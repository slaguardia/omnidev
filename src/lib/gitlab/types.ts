/**
 * GitLab-related types and interfaces
 */

import type { GitUrl, FilePath, WorkspaceId } from '@/lib/types/index';

// Re-export config types from main types module
export type { GitLabConfig, ClientSafeGitLabConfig } from '@/lib/types/index';

export interface MergeRequestContext {
  workspaceId: WorkspaceId;
  workspacePath: FilePath;
  repoUrl: GitUrl;
  sourceBranch: string;
  targetBranch: string;
  modifiedFiles?: string[];
  originalQuestion?: string;
  claudeResponse?: string;
}
