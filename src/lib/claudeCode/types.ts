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
    taskId?: string;
  };
}

export interface GitWorkflowOptions {
  workspaceId: WorkspaceId;
  sourceBranch: string;
  taskId: string | null;
  newBranchName?: string | null;
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
