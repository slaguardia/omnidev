/**
 * Types and interfaces for Claude Code integration
 */

import type { FilePath, WorkspaceId } from '@/lib/types/index';
import type { GitInitResult } from '@/lib/managers/repository-manager';

export interface ClaudeCodeOptions {
  context?: string;
  workingDirectory: FilePath;
  workspaceId?: WorkspaceId;
  sourceBranch: string;
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