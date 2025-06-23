/**
 * GitLab-related types and interfaces
 */

import type { GitUrl, FilePath, WorkspaceId } from '@/lib/types/index';

export interface GitLabAPIConfig {
  baseUrl: string;
  token: string;
}

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

export interface AutoMergeRequestOptions {
  assigneeId?: number;
  labels?: string[];
  removeSourceBranch?: boolean;
  squash?: boolean;
  skipReview?: boolean;
} 