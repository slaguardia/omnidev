/**
 * Types and interfaces for Claude Code integration
 */

import type { FilePath, WorkspaceId } from '@/lib/types/index';
import type { GitInitResult } from '@/lib/managers/repository-manager';

export interface ClaudeCodeOptions {
  question: string;
  context?: string;
  workingDirectory: FilePath;
  workspaceId?: WorkspaceId;
  sourceBranch?: string;
  editRequest?: boolean;
  enableAutoMR?: boolean;
  mrOptions?: {
    targetBranch?: string;
    assigneeId?: number;
    labels?: string[];
    removeSourceBranch?: boolean;
    squash?: boolean;
  };
  /** Extra environment variables to merge into the child process env */
  extraEnv?: Record<string, string> | undefined;
}

export interface GitWorkflowOptions {
  workspaceId: WorkspaceId;
  /** Optional. If omitted, the workflow uses the workspace targetBranch as the base. */
  sourceBranch?: string;
  /** Whether to create a merge/pull request. If false and sourceBranch === targetBranch, commits directly to that branch. */
  createMR?: boolean;
}

/**
 * Individual JSON log entry from Claude Code stream
 */
export interface ClaudeCodeJsonLog {
  type: string;
  subtype?: string;
  timestamp?: string;
  message?: unknown;
  result?: string;
  duration_ms?: number;
  [key: string]: unknown;
}

export interface ClaudeCodeResult {
  output: string;
  gitInitResult?: GitInitResult;
  /** Raw JSON stream logs from Claude Code execution */
  jsonLogs?: ClaudeCodeJsonLog[];
  /** Raw stdout output (includes all output before parsing) */
  rawOutput?: string;
}

export interface PostExecutionResult {
  hasChanges: boolean;
  commitHash?: string;
  mergeRequestUrl?: string;
  pushedBranch?: string;
}

// ---------------------------------------------------------------------------
// Streaming types
// ---------------------------------------------------------------------------

export interface ClaudeCodeStreamOptions {
  /** The message/prompt to send */
  message: string;
  /** Absolute path to the workspace directory */
  workingDirectory: FilePath;
  /** Session ID for multi-turn conversations (first message uses --session-id, follow-ups use --resume) */
  sessionId: string;
  /** Whether this is a resumed session (use --resume instead of --session-id) */
  isResume: boolean;
  /** Optional system context prepended to the message */
  context?: string;
}

export type ClaudeCodeStreamEvent =
  | { type: 'text'; content: string }
  | { type: 'log'; logType: string; data: ClaudeCodeJsonLog }
  | { type: 'result'; content: string; durationMs: number | null }
  | { type: 'error'; message: string };
