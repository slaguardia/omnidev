import type { GitUrl, FilePath, WorkspaceId } from '@/lib/common/types';

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

/**
 * GitLab API types
 */
export interface GitLabMergeRequest {
  id: number;
  iid: number;
  title: string;
  description: string;
  state: 'opened' | 'closed' | 'merged';
  sourceBranch: string;
  targetBranch: string;
  webUrl: string;
  createdAt: Date;
  updatedAt: Date;
  author: {
    id: number;
    name: string;
    username: string;
  };
}


export interface GitLabConfig {
  url: string;
  token: string;
  allowedHosts: string[];
}

export interface ClientSafeGitLabConfig {
  url: string;
  tokenSet: boolean; // Instead of the actual token
  allowedHosts: string[];
}
