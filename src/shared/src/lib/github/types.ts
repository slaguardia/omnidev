/**
 * GitHub module types
 */

import type { WorkspaceId, FilePath, GitUrl } from '@/lib/types/index';

// Re-export types from main types module
export type { GitHubConfig, ClientSafeGitHubConfig, GitHubPullRequest } from '@/lib/types/index';

/**
 * Context for creating a pull request
 */
export interface PullRequestContext {
  workspaceId: WorkspaceId;
  workspacePath: FilePath;
  repoUrl: GitUrl;
  sourceBranch: string;
  targetBranch: string;
  modifiedFiles?: string[];
  originalQuestion?: string;
  claudeResponse?: string;
}

/**
 * Parameters for creating a pull request
 */
export interface CreatePullRequestParams {
  owner: string;
  repo: string;
  title: string;
  body: string;
  head: string; // source branch
  base: string; // target branch
  draft?: boolean;
  // Optional GitHub configuration overrides
  token?: string;
}
