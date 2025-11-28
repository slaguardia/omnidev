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
