/**
 * Types and interfaces for Git operations
 */

import type { CommitHash } from '@/lib/types/index';

// Re-export GitCredentials from main types module
export type { GitCredentials } from '@/lib/types/index';

export interface GitCloneOptions {
  targetBranch?: string;
  depth?: number;
  singleBranch?: boolean;
  bare?: boolean;
  credentials?: {
    username: string;
    password: string;
  };
}

export interface GitCommitInfo {
  hash: CommitHash;
  message: string;
  author: string;
  date: Date;
}

export interface GitBranchInfo {
  name: string;
  isRemote: boolean;
  isCurrent: boolean;
  commitHash: CommitHash;
}

export interface GitStatus {
  isClean: boolean;
  staged: string[];
  modified: string[];
  untracked: string[];
}

export interface GitConfig {
  userEmail?: string;
  userName?: string;
  signingKey?: string;
}
