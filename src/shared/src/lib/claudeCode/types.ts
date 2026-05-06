/**
 * Types retained for git workflow helpers in this directory. The Claude
 * Code CLI orchestrator was deleted; the only ClaudeCodeResult /
 * ClaudeCodeOptions consumers now are post-execution git ops, which
 * could be inlined when this directory is renamed.
 */

import type { WorkspaceId } from '@/lib/types/index';
import type { GitInitResult } from '@/lib/managers/repository-manager';

export interface GitWorkflowOptions {
  workspaceId: WorkspaceId;
  /** Optional. If omitted, the workflow uses the workspace targetBranch as the base. */
  sourceBranch?: string;
  /** Whether to create a merge/pull request. If false and sourceBranch === targetBranch, commits directly to that branch. */
  createMR?: boolean;
}

/**
 * Result type retained on the legacy ClaudeCodeJobResult shape so existing
 * UI consumers (ExternalTaskingHistoryTab) keep typechecking. Always
 * populated with output + gitInitResult; the streaming AgentEvent timeline
 * is the source of truth for everything else.
 */
export interface ClaudeCodeResult {
  output: string;
  gitInitResult?: GitInitResult;
}

export interface PostExecutionResult {
  hasChanges: boolean;
  commitHash?: string;
  mergeRequestUrl?: string;
  pushedBranch?: string;
}
