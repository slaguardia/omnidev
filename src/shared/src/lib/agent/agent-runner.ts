'use server';

/**
 * Agent runner — executes a single agent iteration.
 *
 * This module owns: git identity setup, git workflow initialization,
 * AI invocation via AgentRunner, post-execution git ops, artifact I/O,
 * question parsing, and completion signal detection.
 *
 * This module does NOT import from ralph-task-manager. It never reads or
 * writes task state. That responsibility belongs to the orchestrator.
 */

import { nanoid } from 'nanoid';

// Import directly from sibling modules (not the barrel) so test files can
// mock these helpers without pulling in CursorSdkAgent and its @cursor/sdk
// transitive deps via the @/lib/agent re-export.
import { initializeGitWorkflow } from './git-workflow';
import { handlePostExecution } from './post-execution';
import { dbAppendAgentEvent, dbUpdateAgentRunSummary } from '@/lib/managers/ralph-task-db';
import type { GitInitResult } from '@/lib/managers/repository-manager';
import type { GitUrl, Result } from '@/lib/types/index';

import type { AgentEvent, AgentRunRequest, AgentRunResult, AgentRunner } from './types';

/**
 * Tool names registered on the in-process MCP signals server
 * (mcp-signals-server.ts). The Ralph stage runner reads tool_call events
 * with these names instead of parsing free-form text. The strings here MUST
 * match the registerTool() calls on the MCP server side.
 */
const TOOL_MARK_STAGE_COMPLETE = 'mark_stage_complete';
const TOOL_REQUEST_CLARIFICATION = 'request_clarification';

const LOG_PREFIX = '[AGENT]';

/**
 * Module-level agent instance, lazily initialized and shared across concurrent
 * executeAgentRun() calls. CursorSdkAgent is the default after the Claude
 * Code CLI decommission.
 *
 * Sharing is SAFE because AgentRunner implementations are stateless — all
 * per-run state lives on the async iterable returned by run(). This is part
 * of the AgentRunner reentrancy contract documented on the interface in
 * ./types.ts.
 */
let defaultAgent: AgentRunner | null = null;

async function getDefaultAgent(): Promise<AgentRunner> {
  if (!defaultAgent) {
    // Lazy import to avoid circular deps at module load time.
    const { CursorSdkAgent } = await import('@/lib/agent/cursor-sdk-agent');
    defaultAgent = new CursorSdkAgent();
  }
  return defaultAgent;
}

/**
 * Execute a single agent run: git setup → AI execution → post-exec git → artifacts → signals.
 *
 * Returns a Result so callers can distinguish between a clean failure (success: false)
 * and a successful run that may carry a non-fatal error in `result.error`.
 *
 * @param agent — optional AgentRunner override. Defaults to CursorSdkAgent.
 */
export async function executeAgentRun(
  request: AgentRunRequest,
  agent?: AgentRunner
): Promise<Result<AgentRunResult, Error>> {
  const startTime = Date.now();
  const tag = `${request.stageName}[${request.iteration}]`;
  console.log(`${LOG_PREFIX} Starting ${tag} for task ${request.taskId}`);

  try {
    // ----- 1. Git identity setup (edit mode only) -----
    if (request.editMode && request.git) {
      const { name, email } = request.git.commitIdentity;
      if (!name || !email) {
        return {
          success: false,
          error: new Error(
            `Pre-flight failed: git commit identity not configured. ` +
              `Set Commit Name and Commit Email in Settings > Git Source Config. ` +
              `(commitName=${name || 'unset'}, commitEmail=${email || 'unset'})`
          ),
        };
      }

      const { setWorkspaceGitConfig } = await import('@/lib/git/config');
      await setWorkspaceGitConfig(request.workspacePath, {
        userName: name,
        userEmail: email,
      });
      console.log(`${LOG_PREFIX} Git identity: ${name} <${email}>`);
    }

    // ----- 2. Git workflow initialization (edit mode only) -----
    let gitInitResult: GitInitResult | undefined;
    let _effectiveSourceBranch: string | undefined;

    if (request.editMode && request.git) {
      const sourceBranch = request.git.featureBranch;
      const isDirectCommit = request.git.deliveryMethod === 'direct-commit';

      console.log(`${LOG_PREFIX} Initializing git workflow for ${tag}`, {
        featureBranch: sourceBranch,
        deliveryMethod: request.git.deliveryMethod,
        isDirectCommit,
      });

      const gitWorkflowOpts: Parameters<typeof initializeGitWorkflow>[0] = {
        workspaceId: request.workspaceId,
      };
      if (sourceBranch) {
        gitWorkflowOpts.sourceBranch = sourceBranch;
        gitWorkflowOpts.createMR = !isDirectCommit;
      }

      const initResult = await initializeGitWorkflow(gitWorkflowOpts);
      if (!initResult.success) {
        return {
          success: false,
          error: new Error(
            `Git workflow initialization failed: ${initResult.error?.message || 'Unknown error'}`
          ),
        };
      }

      gitInitResult = {
        ...initResult.data,
        mergeRequestRequired: !isDirectCommit && initResult.data.mergeRequestRequired,
      };
      _effectiveSourceBranch = initResult.data.sourceBranch;
    }

    // ----- 3. AI execution via AgentRunner (streaming) -----
    // Iterate the AgentEvent stream, persist each event to agent_events
    // (when request.runId is set), and assemble the legacy AgentRunResult
    // fields from terminal events. Structured signals (completion +
    // questions) come from tool_call events on the in-process MCP signals
    // server, NOT from text parsing.
    const runner = agent ?? (await getDefaultAgent());
    const consumed = await consumeAgentStream(runner, request, tag);
    if (!consumed.success) {
      return consumed;
    }
    const { output, signals: streamSignals } = consumed.data;
    const executionTimeMs = Date.now() - startTime;
    console.log(`${LOG_PREFIX} ${tag} output (${output.length} chars) in ${executionTimeMs}ms`);

    // ----- 4. Post-execution git ops (edit mode only) -----
    let gitResult: AgentRunResult['git'];

    if (gitInitResult && request.git?.repoUrl) {
      console.log(`${LOG_PREFIX} Post-execution git ops for ${tag}`);
      try {
        const postResult = await handlePostExecution(
          request.workspacePath,
          gitInitResult,
          request.git.repoUrl as GitUrl,
          undefined, // provider auto-detected
          request.git.taskContext
        );

        if (postResult.success && postResult.data) {
          gitResult = {
            pushed: postResult.data.hasChanges,
            pushedBranch: postResult.data.pushedBranch,
            commitHash: postResult.data.commitHash,
            prUrl: postResult.data.mergeRequestUrl,
          };
          console.log(`${LOG_PREFIX} Post-execution completed:`, {
            hasChanges: postResult.data.hasChanges,
            pushedBranch: postResult.data.pushedBranch,
            mergeRequestUrl: postResult.data.mergeRequestUrl,
          });
        } else if (!postResult.success) {
          console.warn(`${LOG_PREFIX} Post-execution failed:`, postResult.error?.message);
        }
      } catch (postError) {
        console.warn(`${LOG_PREFIX} Post-execution error (non-fatal):`, postError);
      }
    }

    // ----- 5. Artifact file I/O -----
    let fileOutput: string | undefined;

    if (request.artifact) {
      const { readFile, writeFile, mkdir } = await import('node:fs/promises');
      const { join, dirname } = await import('node:path');
      const artifactFullPath = join(request.workspacePath, request.artifact.relativePath);

      // For edit stages, check if Claude wrote the file directly
      if (request.editMode) {
        try {
          const claudeVersion = await readFile(artifactFullPath, 'utf-8');
          if (claudeVersion.trim()) {
            fileOutput = claudeVersion;
            console.log(
              `${LOG_PREFIX} Read Claude-written artifact ${request.artifact.relativePath} (${claudeVersion.length} chars)`
            );
          }
        } catch {
          // Claude didn't write it — we'll write the output below
        }
      }

      // Write the artifact from Claude's response output (always, for both modes)
      if (!fileOutput && output) {
        try {
          await mkdir(dirname(artifactFullPath), { recursive: true });
          await writeFile(artifactFullPath, output, 'utf-8');
          fileOutput = output;
          console.log(
            `${LOG_PREFIX} Wrote stage artifact ${request.artifact.relativePath} (${output.length} chars)`
          );
        } catch (writeErr) {
          console.warn(
            `${LOG_PREFIX} Failed to write stage artifact ${request.artifact.relativePath}:`,
            writeErr
          );
          fileOutput = output; // Still use output even if file write failed
        }
      }
    }

    // ----- 6. Structured signals from MCP tool calls -----
    // Both signals are now driven by tool_call events on the agent's stream
    // (see consumeAgentStream below). request.parseQuestions stays in the
    // request shape for forward compat with non-Ralph callers but the field
    // no longer drives parsing — questions populate from request_clarification
    // tool calls regardless. Empty arrays collapse to undefined so the result
    // shape matches the pre-migration contract.
    const questions = streamSignals.questions.length > 0 ? streamSignals.questions : undefined;
    const completionSignal = streamSignals.completionSignal;

    // ----- Build result -----
    const result: AgentRunResult = {
      output,
      executionTimeMs,
      fileOutput,
      questions,
      git: gitResult,
      signals: { completionSignal },
    };

    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

// ---------------------------------------------------------------------------
// Internal: drive the AgentRunner stream and persist events
// ---------------------------------------------------------------------------

/**
 * Iterate the AgentRunner event stream once. Side effects:
 *   - Persists every event to agent_events when request.runId is set.
 *   - Aggregates usage_update events into a per-run summary that is written
 *     back via dbUpdateAgentRunSummary on completion.
 *   - Concatenates assistant_message text into the legacy output string.
 *   - Surfaces error events as a failed Result.
 *
 * Persistence failures are logged but never abort execution — the agent
 * stream is the source of truth for the run's success, not the timeline DB.
 */
interface StreamSignals {
  /** True when a tool_call event with name='mark_stage_complete' was seen. */
  completionSignal: boolean;
  /** Accumulated questions from request_clarification tool_call events. */
  questions: string[];
}

async function consumeAgentStream(
  runner: AgentRunner,
  request: AgentRunRequest,
  tag: string
): Promise<Result<{ output: string; signals: StreamSignals }, Error>> {
  let output = '';
  let agentError: Error | null = null;
  let lastUsage: { inputTokens: number; outputTokens: number; model: string } | null = null;
  const signals: StreamSignals = { completionSignal: false, questions: [] };

  try {
    const stream = runner.run({
      question: request.prompt,
      workingDirectory: request.workspacePath,
      editRequest: request.editMode,
      extraEnv: request.extraEnv,
      signal: request.signal,
    });

    for await (const event of stream) {
      if (request.runId) {
        await persistEvent(request.runId, event, tag);
      }

      if (event.type === 'assistant_message') {
        output += event.text;
      } else if (event.type === 'usage_update') {
        lastUsage = {
          inputTokens: event.inputTokens,
          outputTokens: event.outputTokens,
          model: event.model,
        };
      } else if (event.type === 'error') {
        agentError = new Error(event.message);
      } else if (event.type === 'tool_call') {
        recordSignalFromToolCall(event.name, event.input, signals);
      }
    }
  } catch (runError) {
    return {
      success: false,
      error: runError instanceof Error ? runError : new Error(String(runError)),
    };
  }

  if (request.runId && lastUsage) {
    try {
      await dbUpdateAgentRunSummary(request.runId, {
        model: lastUsage.model,
        input_tokens: lastUsage.inputTokens,
        output_tokens: lastUsage.outputTokens,
        total_tokens: lastUsage.inputTokens + lastUsage.outputTokens,
      });
    } catch (err) {
      console.warn(`${LOG_PREFIX} ${tag} failed to persist run summary:`, err);
    }
  }

  if (agentError) {
    return { success: false, error: agentError };
  }
  return { success: true, data: { output, signals } };
}

/**
 * Translate a tool_call event into a signal mutation. MCP tool names are
 * sometimes prefixed by the SDK's server alias (e.g. "omnidev-signals.mark_stage_complete"
 * or "mcp__omnidev-signals__mark_stage_complete") — accept both raw and
 * prefixed forms so detection is resilient to the SDK's namespacing choice.
 */
function recordSignalFromToolCall(
  rawName: string,
  rawInput: unknown,
  signals: StreamSignals
): void {
  const name = stripToolNamespace(rawName);
  if (name === TOOL_MARK_STAGE_COMPLETE) {
    signals.completionSignal = true;
    return;
  }
  if (name === TOOL_REQUEST_CLARIFICATION) {
    const input = (rawInput ?? {}) as { questions?: unknown };
    if (Array.isArray(input.questions)) {
      for (const q of input.questions) {
        if (typeof q === 'string' && q.trim().length > 0) {
          signals.questions.push(q.trim());
        }
      }
    }
  }
}

function stripToolNamespace(name: string): string {
  // Common MCP server prefixes: "<serverName>.<tool>" or "mcp__<serverName>__<tool>".
  if (name.startsWith('mcp__')) {
    const idx = name.indexOf('__', 5);
    if (idx >= 0) return name.slice(idx + 2);
  }
  const dot = name.lastIndexOf('.');
  if (dot >= 0) return name.slice(dot + 1);
  return name;
}

async function persistEvent(runId: string, event: AgentEvent, tag: string): Promise<void> {
  try {
    await dbAppendAgentEvent({
      id: nanoid(12),
      run_id: runId,
      seq: event.seq,
      type: event.type,
      payload: JSON.stringify(event),
      created_at: event.timestamp,
    });
  } catch (err) {
    // Don't abort execution on a single persistence failure — the agent
    // stream is canonical, the timeline is best-effort.
    console.warn(`${LOG_PREFIX} ${tag} failed to persist event ${event.seq} (${event.type}):`, err);
  }
}
