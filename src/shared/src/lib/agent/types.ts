'use server';

/**
 * Agent contract — defines two boundaries:
 *
 *   1. The worker contract (AgentRunRequest / AgentRunResult): the
 *      request/result boundary between orchestration (task state, loop
 *      decisions, prompt building) and execution (git setup, AI invocation,
 *      commit/push/PR, artifacts).
 *
 *   2. The runner contract (AgentRunner / AgentEvent): the streaming
 *      boundary between the orchestration step that invokes the AI and the
 *      AI implementation itself (Claude Code CLI, Cursor SDK, custom loops).
 *
 * Key constraint: nothing in this file imports from ralph-task-manager.
 */

import type { FilePath, WorkspaceId } from '@/lib/types/index';

// ---------------------------------------------------------------------------
// Streaming runner contract — AgentEvent + AgentRunner
// ---------------------------------------------------------------------------

/**
 * Common fields on every AgentEvent.
 *
 * `seq` is monotonic PER RUN (not global) — concurrent runs from the same
 * AgentRunner instance must not collide on seq because each run scopes its
 * own counter inside the returned async iterable.
 */
export interface AgentEventBase {
  /** Monotonic sequence number, scoped per-run. Starts at 0. */
  seq: number;
  /** ISO 8601 timestamp set by the runner when the event is emitted. */
  timestamp: string;
}

/** Plain text content emitted by the assistant. */
export interface AgentAssistantMessageEvent extends AgentEventBase {
  type: 'assistant_message';
  text: string;
}

/** Reasoning content from the model (may be redacted by the provider). */
export interface AgentThinkingEvent extends AgentEventBase {
  type: 'thinking';
  text: string;
}

/** The model invoked a tool. Pairs with a tool_result event via toolUseId. */
export interface AgentToolCallEvent extends AgentEventBase {
  type: 'tool_call';
  /** Tool-use ID assigned by the model. */
  toolUseId: string;
  /** Tool name (e.g. "Read", "Bash", "Edit"). */
  name: string;
  /** Tool input arguments — shape is provider/tool-defined. */
  input: unknown;
}

/** Result of a previously-issued tool call. */
export interface AgentToolResultEvent extends AgentEventBase {
  type: 'tool_result';
  /** Matches the toolUseId of the corresponding tool_call event. */
  toolUseId: string;
  /** Result content as text. Structured results are stringified by the runner. */
  content: string;
  /** True if the tool call errored. */
  isError: boolean;
}

/** Token / model usage update emitted at least once per run. */
export interface AgentUsageUpdateEvent extends AgentEventBase {
  type: 'usage_update';
  inputTokens: number;
  outputTokens: number;
  /** Model identifier as reported by the agent (e.g. "claude-sonnet-4-6"). */
  model: string;
}

/** Terminal event — the run completed. Always the last event in a successful stream. */
export interface AgentDoneEvent extends AgentEventBase {
  type: 'done';
  /** Why the model stopped (e.g. 'end_turn', 'tool_use', 'max_tokens', 'cancelled'). */
  stopReason?: string | undefined;
}

/** Terminal event — the run failed. Always the last event when an error occurred. */
export interface AgentErrorEvent extends AgentEventBase {
  type: 'error';
  message: string;
  /** Whether the caller can usefully retry (vs. e.g. auth failure). */
  recoverable: boolean;
}

/**
 * Discriminated union of all events an AgentRunner may emit.
 * Narrow with `event.type === '...'`.
 */
export type AgentEvent =
  | AgentAssistantMessageEvent
  | AgentThinkingEvent
  | AgentToolCallEvent
  | AgentToolResultEvent
  | AgentUsageUpdateEvent
  | AgentDoneEvent
  | AgentErrorEvent;

/**
 * Options for an AgentRunner.run() invocation.
 *
 * REENTRANCY: Implementations must keep all per-run state on the returned
 * async iterable, never on the AgentRunner instance. A single AgentRunner
 * MUST support N concurrent run() calls without cross-talk.
 */
export interface AgentRunnerOptions {
  /** The prompt to send to the agent. */
  question: string;
  /** Absolute path to the agent's working directory (the cloned workspace). */
  workingDirectory: string;
  /** True if the agent may modify files/git; false for read-only runs. */
  editRequest: boolean;
  /** Extra environment variables to expose to the agent runtime. */
  extraEnv?: Record<string, string> | undefined;
  /**
   * Optional abort signal. When triggered, the run terminates cleanly and the
   * event stream ends with a `done` (stopReason='cancelled') or `error` event.
   * Honored by implementations that support it (Cursor SDK); the legacy
   * Claude Code CLI adapter accepts but does not honor the signal until the
   * dedicated cancellation issue lands.
   */
  signal?: AbortSignal | undefined;
}

/**
 * Legacy { output: string } shape returned by collapseEventsToOutput(). Kept
 * so callers can migrate to the streaming interface incrementally rather than
 * flag-day. New consumers should iterate AgentRunner.run() directly.
 */
export interface AgentRunnerResult {
  output: string;
}

/**
 * Streaming agent runner — executes one agent invocation and yields a
 * sequence of typed AgentEvents as they arrive.
 *
 * Implementations: see `CursorSdkAgent` (the default after the Claude Code
 * CLI decommission).
 *
 * REENTRANCY GUARANTEE (load-bearing for in-process job parallelism):
 *   Multiple concurrent invocations of run() on the same AgentRunner instance
 *   produce independent event streams. Implementations must not store
 *   per-run mutable state on the instance.
 */
export interface AgentRunner {
  run(options: AgentRunnerOptions): AsyncIterable<AgentEvent>;
}

// ---------------------------------------------------------------------------
// Request — everything the agent needs to run one iteration
// ---------------------------------------------------------------------------

export interface AgentGitConfig {
  /** Branch to commit to (e.g. "ralph/<taskId>") */
  featureBranch?: string | undefined;
  /** Base branch to create the feature branch from */
  baseBranch?: string | undefined;
  /** Remote repo URL — needed for push/PR ops */
  repoUrl: string;
  /** Delivery method determines whether a PR/MR is created */
  deliveryMethod: 'merge-request' | 'direct-commit';
  /** Identity for commit author */
  commitIdentity: { name: string; email: string };
  /** Task context for semantic commit messages */
  taskContext?: { id: string; title: string } | undefined;
}

export interface AgentArtifactConfig {
  /** Relative path from workspace root, e.g. ".ralph/tasks/{id}/{stage}.md" */
  relativePath: string;
}

export interface AgentRunRequest {
  /** Task ID — used for logging and artifact paths only */
  taskId: string;
  /** Stage name — used for logging only */
  stageName: string;
  /** Current iteration number — used for logging only */
  iteration: number;

  /**
   * Agent run id (matches an agent_runs row already created by the caller).
   * When provided, every AgentEvent emitted during this run is persisted to
   * the agent_events table and any usage_update events update the run's
   * summary fields. Must be unique per concurrent invocation; the orchestrator
   * is responsible for generating it (see worker/src/index.ts:runJob).
   *
   * Optional so that pre-DB callers (tests, ad-hoc scripts) can still invoke
   * the runner; events are then collected in-memory only.
   */
  runId?: string | undefined;

  /** Fully-resolved prompt (orchestrator handles continuation context) */
  prompt: string;

  /** Absolute path to the workspace */
  workspacePath: FilePath;
  /** Workspace ID for executor */
  workspaceId: WorkspaceId;

  /** Whether to run in edit mode (true) or readonly (false) */
  editMode: boolean;

  /** Git configuration for edit-mode stages. Omit for readonly. */
  git?: AgentGitConfig | undefined;

  /** Artifact file configuration. When set, the agent reads/writes this file. */
  artifact?: AgentArtifactConfig | undefined;

  /** Whether to parse QUESTION: lines from the output */
  parseQuestions: boolean;

  /** Extra environment variables to pass to the agent subprocess (e.g. CLI tokens) */
  extraEnv?: Record<string, string> | undefined;

  /**
   * Optional abort signal forwarded to AgentRunner.run(). When the worker
   * observes a cancellation_requested_at marker on the run's row, it aborts
   * this signal; the agent then ends its event stream cleanly. Wired by
   * sub-task 9 (mid-run cancellation end-to-end).
   */
  signal?: AbortSignal | undefined;
}

// ---------------------------------------------------------------------------
// Result — what the agent returns to the orchestrator
// ---------------------------------------------------------------------------

export interface AgentGitResult {
  /** Whether changes were pushed */
  pushed: boolean;
  /** Branch that was pushed to */
  pushedBranch?: string | undefined;
  /** Commit hash of the push */
  commitHash?: string | undefined;
  /** URL of the created PR/MR, if any */
  prUrl?: string | undefined;
}

export interface AgentRunResult {
  /** Raw output from Claude Code */
  output: string;
  /** Execution time in milliseconds */
  executionTimeMs: number;

  /** Artifact file content (read from disk or from output) */
  fileOutput?: string | undefined;
  /** Parsed QUESTION: lines from output */
  questions?: string[] | undefined;

  /** Git operation results (only present if git config was provided) */
  git?: AgentGitResult | undefined;

  /** Signals detected in the output */
  signals: {
    /** Whether <promise>COMPLETE</promise> was found */
    completionSignal: boolean;
  };

  /** Non-fatal error message (execution succeeded but something went wrong) */
  error?: string | undefined;
}
