/**
 * Cursor SDK adapter for the streaming AgentRunner interface.
 *
 * The Cursor SDK runs an agent loop in-process and yields native SDKMessage
 * events as they arrive. This adapter maps those 1:1 onto our AgentEvent
 * discriminated union so downstream consumers (DB persistence, Ralph Board
 * live timeline, retry logic, cancellation) work identically across agent
 * implementations.
 *
 * Reentrancy: a fresh `Agent` instance is created per run() invocation so
 * concurrent runs do not share state. Each run is wrapped in try/finally to
 * dispose the SDK resources even on early termination (cancel, error, caller
 * stops iterating).
 *
 * Authentication: the SDK reads CURSOR_API_KEY from the environment by
 * default. For deploys that prefer explicit pass-through (e.g. per-job env
 * via the worker's extraEnv), the key is also resolved from
 * options.extraEnv.CURSOR_API_KEY first.
 */

import { Agent } from '@cursor/sdk';
import type {
  SDKAgent,
  SDKAssistantMessage,
  SDKMessage,
  SDKStatusMessage,
  SDKThinkingMessage,
  SDKToolUseMessage,
} from '@cursor/sdk';

import { getMcpSignalsUrl } from './mcp-signals-server';
import type { AgentEvent, AgentRunner, AgentRunnerOptions } from './types';

const DEFAULT_MODEL_ID = 'composer-2';

/**
 * Stateless Cursor SDK adapter. A single instance can be shared across
 * concurrent run() invocations — each call constructs its own SDKAgent and
 * keeps all per-run state inside the async generator scope.
 */
export class CursorSdkAgent implements AgentRunner {
  constructor(
    private readonly config: {
      /** Model id to send to Agent.create. Defaults to "composer-2". */
      modelId?: string;
      /**
       * API key override. When unset, the SDK reads CURSOR_API_KEY from the
       * environment of the calling process (or from options.extraEnv at
       * call-site).
       */
      apiKey?: string;
    } = {}
  ) {}

  async *run(options: AgentRunnerOptions): AsyncIterable<AgentEvent> {
    let seq = 0;
    const ts = (): string => new Date().toISOString();

    // Per-run usage capture from onDelta — the SDK exposes token counts
    // through the delta channel rather than the SDKMessage stream.
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    let model: string | undefined;

    const apiKey =
      options.extraEnv?.CURSOR_API_KEY ?? this.config.apiKey ?? process.env.CURSOR_API_KEY;
    if (!apiKey) {
      yield {
        type: 'error',
        message:
          'CursorSdkAgent: CURSOR_API_KEY is not set. Provide it via process.env, options.extraEnv, or CursorSdkAgent({ apiKey }).',
        recoverable: false,
        seq: seq++,
        timestamp: ts(),
      };
      return;
    }

    let agent: SDKAgent | null = null;
    let cancelled = false;

    // Resolve the in-process MCP signals server URL. This advertises the
    // mark_stage_complete and request_clarification tools used by the
    // Ralph stage runner. Lazy-started; cached after first use.
    let signalsMcpUrl: string;
    try {
      signalsMcpUrl = await getMcpSignalsUrl();
    } catch (err) {
      yield {
        type: 'error',
        message: `Failed to start MCP signals server: ${err instanceof Error ? err.message : String(err)}`,
        recoverable: false,
        seq: seq++,
        timestamp: ts(),
      };
      return;
    }

    try {
      agent = await Agent.create({
        apiKey,
        model: { id: this.config.modelId ?? DEFAULT_MODEL_ID },
        local: { cwd: options.workingDirectory },
        mcpServers: {
          'omnidev-signals': { type: 'http', url: signalsMcpUrl },
        },
      });

      const run = await agent.send(options.question, {
        onDelta: ({ update }) => {
          // TokenDeltaUpdate carries cumulative input/output token counts
          // and the resolved model id. The SDK ships its delta types as a
          // discriminated union; narrow by the literal `type` field.
          if ((update as { type?: string }).type === 'token_delta') {
            const u = update as {
              tokensIn?: number;
              tokensOut?: number;
              tokens_in?: number;
              tokens_out?: number;
              model?: string;
            };
            // The SDK's snake_case <-> camelCase coverage has shifted across
            // versions; accept both rather than gambling on one shape.
            if (typeof u.tokensIn === 'number') inputTokens = u.tokensIn;
            else if (typeof u.tokens_in === 'number') inputTokens = u.tokens_in;
            if (typeof u.tokensOut === 'number') outputTokens = u.tokensOut;
            else if (typeof u.tokens_out === 'number') outputTokens = u.tokens_out;
            if (typeof u.model === 'string') model = u.model;
          }
        },
      });

      // Wire the caller's AbortSignal into the SDK's cancel(). This is the
      // hook sub-task 9 (mid-run cancellation) plugs into.
      const onAbort = (): void => {
        cancelled = true;
        void run.cancel().catch(() => {
          // Best-effort cancel — the run may have already finished.
        });
      };
      if (options.signal) {
        if (options.signal.aborted) {
          onAbort();
        } else {
          options.signal.addEventListener('abort', onAbort);
        }
      }

      try {
        for await (const message of run.stream()) {
          yield* mapSdkMessageToEvents(message, () => seq++, ts);
        }
      } finally {
        options.signal?.removeEventListener('abort', onAbort);
      }

      // Trailing usage_update with whatever totals we captured during the
      // run. Emitted before the natural Done event from SDKStatusMessage so
      // downstream summary persistence sees the numbers.
      if (model !== undefined || inputTokens !== undefined || outputTokens !== undefined) {
        yield {
          type: 'usage_update',
          inputTokens: inputTokens ?? 0,
          outputTokens: outputTokens ?? 0,
          model: model ?? this.config.modelId ?? DEFAULT_MODEL_ID,
          seq: seq++,
          timestamp: ts(),
        };
      }
    } catch (err) {
      yield {
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
        // If the caller cancelled, that's intentional — not retryable.
        // Other errors (network, transient) are flagged recoverable so the
        // worker's retry path can use them.
        recoverable: !cancelled,
        seq: seq++,
        timestamp: ts(),
      };
    } finally {
      if (agent) {
        try {
          await agent[Symbol.asyncDispose]();
        } catch {
          // Best-effort cleanup; do not surface dispose failures to callers.
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Internal: map a single Cursor SDKMessage to AgentEvent(s)
// ---------------------------------------------------------------------------

function* mapSdkMessageToEvents(
  message: SDKMessage,
  nextSeq: () => number,
  ts: () => string
): Generator<AgentEvent> {
  switch (message.type) {
    case 'assistant': {
      const m = message as SDKAssistantMessage;
      for (const block of m.message.content) {
        if (block.type === 'text') {
          yield {
            type: 'assistant_message',
            text: block.text,
            seq: nextSeq(),
            timestamp: ts(),
          };
        } else if (block.type === 'tool_use') {
          yield {
            type: 'tool_call',
            toolUseId: block.id,
            name: block.name,
            input: block.input,
            seq: nextSeq(),
            timestamp: ts(),
          };
        }
      }
      return;
    }

    case 'thinking': {
      const m = message as SDKThinkingMessage;
      yield {
        type: 'thinking',
        text: m.text,
        seq: nextSeq(),
        timestamp: ts(),
      };
      return;
    }

    case 'tool_call': {
      // Cursor emits one tool_call message per lifecycle transition: the
      // 'running' edge is the start (we already saw the tool_use block on
      // the assistant message), and 'completed' / 'error' carry the result.
      const m = message as SDKToolUseMessage;
      if (m.status === 'completed' || m.status === 'error') {
        yield {
          type: 'tool_result',
          toolUseId: m.call_id,
          content: stringifyToolResult(m.result),
          isError: m.status === 'error',
          seq: nextSeq(),
          timestamp: ts(),
        };
      }
      return;
    }

    case 'status': {
      const m = message as SDKStatusMessage;
      if (m.status === 'FINISHED') {
        yield {
          type: 'done',
          stopReason: 'end_turn',
          seq: nextSeq(),
          timestamp: ts(),
        };
      } else if (m.status === 'CANCELLED') {
        yield {
          type: 'done',
          stopReason: 'cancelled',
          seq: nextSeq(),
          timestamp: ts(),
        };
      } else if (m.status === 'ERROR') {
        yield {
          type: 'error',
          message: m.message ?? 'Cursor agent run errored',
          recoverable: true,
          seq: nextSeq(),
          timestamp: ts(),
        };
      } else if (m.status === 'EXPIRED') {
        yield {
          type: 'error',
          message: m.message ?? 'Cursor agent run expired',
          recoverable: false,
          seq: nextSeq(),
          timestamp: ts(),
        };
      }
      // 'CREATING' / 'RUNNING' are intermediate — no event for these.
      return;
    }

    // 'system', 'user', 'task', 'request' message types intentionally
    // unmapped — they do not fit the AgentEvent taxonomy and are not
    // load-bearing for the omnidev pipeline.
    default:
      return;
  }
}

function stringifyToolResult(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
