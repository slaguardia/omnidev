/**
 * Claude Code adapter for the streaming AgentRunner interface.
 *
 * The Claude Code CLI returns its full output as a buffered { output, jsonLogs }
 * payload. This adapter calls askClaudeCode() to completion and then yields
 * synthetic AgentEvents reconstructed from the jsonLogs array — preserving
 * tool-call/tool-result visibility for downstream consumers (DB persistence,
 * Ralph Board live timeline) while matching the existing final-output text.
 *
 * This is a transitional implementation: the real win is the CursorSdkAgent
 * (sibling issue) where events are truly emitted as they arrive. Until then,
 * Claude Code users get the new interface without functional regression.
 */

import { askClaudeCode } from '@/lib/claudeCode/orchestrator';
import type { ClaudeCodeJsonLog } from '@/lib/claudeCode/types';
import type { FilePath } from '@/lib/common/types';

import type { AgentEvent, AgentRunner, AgentRunnerOptions } from './types';

// Re-export the runner contract so callers that previously imported it from
// this file continue to compile. New imports should prefer the './types'
// barrel via @/lib/agent.
export type { AgentEvent, AgentRunner, AgentRunnerOptions, AgentRunnerResult } from './types';

/**
 * Claude Code CLI adapter. Stateless — safe to share a single instance across
 * concurrent run() invocations (the per-run state lives in the async generator).
 */
export class ClaudeCodeAgent implements AgentRunner {
  async *run(options: AgentRunnerOptions): AsyncIterable<AgentEvent> {
    let seq = 0;
    const ts = (): string => new Date().toISOString();

    const result = await askClaudeCode({
      question: options.question,
      workingDirectory: options.workingDirectory as FilePath,
      editRequest: options.editRequest,
      extraEnv: options.extraEnv,
    });

    if (!result.success) {
      yield {
        type: 'error',
        message: result.error.message,
        recoverable: false,
        seq: seq++,
        timestamp: ts(),
      };
      return;
    }

    // Walk the buffered jsonLogs and yield synthetic events. Order preserved.
    const logs = result.data.jsonLogs ?? [];
    for (const log of logs) {
      yield* mapLogToEvents(log, () => seq++, ts);
    }

    // The CLI's `result.result` is canonical final assistant text. Yield it as
    // a single AssistantMessage so collapseEventsToOutput reproduces today's
    // ClaudeCodeResult.output exactly. Intermediate `assistant` log entries
    // contributed only ToolCall events (text was suppressed) to avoid
    // duplicating what the result event provides.
    if (result.data.output) {
      yield {
        type: 'assistant_message',
        text: result.data.output,
        seq: seq++,
        timestamp: ts(),
      };
    }

    yield {
      type: 'done',
      stopReason: 'end_turn',
      seq: seq++,
      timestamp: ts(),
    };
  }
}

// ---------------------------------------------------------------------------
// Internal: map a single Claude Code stream-json log entry to AgentEvents
// ---------------------------------------------------------------------------

function* mapLogToEvents(
  log: ClaudeCodeJsonLog,
  nextSeq: () => number,
  ts: () => string
): Generator<AgentEvent> {
  // Intermediate assistant turn: extract tool_use blocks. Skip text blocks
  // because the canonical text comes from the final result event.
  if (log.type === 'assistant' && log.message && typeof log.message === 'object') {
    const message = log.message as { content?: unknown };
    const content = Array.isArray(message.content) ? message.content : [];
    for (const block of content) {
      if (typeof block !== 'object' || block === null) continue;
      const b = block as Record<string, unknown>;
      if (b.type === 'tool_use' && typeof b.id === 'string' && typeof b.name === 'string') {
        yield {
          type: 'tool_call',
          toolUseId: b.id,
          name: b.name,
          input: b.input ?? null,
          seq: nextSeq(),
          timestamp: ts(),
        };
      }
    }
    return;
  }

  // Tool result delivered to the model: surfaces under `user` log entries.
  if (log.type === 'user' && log.message && typeof log.message === 'object') {
    const message = log.message as { content?: unknown };
    const content = Array.isArray(message.content) ? message.content : [];
    for (const block of content) {
      if (typeof block !== 'object' || block === null) continue;
      const b = block as Record<string, unknown>;
      if (b.type === 'tool_result' && typeof b.tool_use_id === 'string') {
        yield {
          type: 'tool_result',
          toolUseId: b.tool_use_id,
          content: stringifyToolResultContent(b.content),
          isError: b.is_error === true,
          seq: nextSeq(),
          timestamp: ts(),
        };
      }
    }
    return;
  }

  // The CLI's `result` log entry is handled by the caller (yields
  // AssistantMessage + Done after the loop), so nothing to emit here.
}

function stringifyToolResultContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => {
        if (typeof c === 'string') return c;
        if (typeof c === 'object' && c !== null && 'text' in c) {
          const t = (c as { text: unknown }).text;
          return typeof t === 'string' ? t : JSON.stringify(c);
        }
        return JSON.stringify(c);
      })
      .join('\n');
  }
  return content == null ? '' : JSON.stringify(content);
}
