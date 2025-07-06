import type { CommitHash } from '@/lib/common/types';

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

export interface GitCredentials {
  username: string;
  password: string; // This could be a personal access token
  provider?: 'gitlab' | 'github' | 'bitbucket' | 'other';
}