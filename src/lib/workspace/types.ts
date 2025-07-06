import type { WorkspaceId, FilePath, GitUrl, CommitHash } from '@/lib/common/types';

/**
 * Workspace configuration and metadata
 */
export interface Workspace {
    id: WorkspaceId;
    path: FilePath;
    repoUrl: GitUrl;
    targetBranch: string;
    createdAt: Date;
    lastAccessed: Date
    metadata?: WorkspaceMetadata;
}

export interface WorkspaceMetadata {
    size: number;
    commitHash: CommitHash;
    isActive: boolean;
    tags?: string[];
    gitConfig?: WorkspaceGitConfig;
}

/**
 * Git configuration for workspaces
 */
export interface WorkspaceGitConfig {
    userEmail?: string;
    userName?: string;
    signingKey?: string;
    defaultBranch?: string;
}

export interface WorkspaceConfig {
    maxSizeMB: number;
    maxConcurrent: number;
    tempDirPrefix: string;
}
  