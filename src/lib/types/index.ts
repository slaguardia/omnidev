/**
 * Core type definitions for GitLab Claude Manager
 */

// Branded types for better type safety
export type WorkspaceId = string & { readonly brand: unique symbol };
export type GitUrl = string & { readonly brand: unique symbol };
export type FilePath = string & { readonly brand: unique symbol };
export type CommitHash = string & { readonly brand: unique symbol };

/**
 * Workspace configuration and metadata
 */
export interface Workspace {
  id: WorkspaceId;
  path: FilePath;
  repoUrl: GitUrl;
  targetBranch: string;
  createdAt: Date;
  lastAccessed: Date;
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



/**
 * File system types
 */
export interface FileTreeNode {
  name: string;
  path: FilePath;
  type: 'file' | 'directory';
  size?: number;
  lastModified?: Date;
  children?: FileTreeNode[];
  mimeType?: string;
}

/**
 * Claude Code integration types
 */
export interface ClaudeCodeResponse {
  analysis: string;
  suggestions: string[];
  modifiedFiles?: FilePath[];
  confidence: number;
  timestamp: Date;
}

export interface ClaudeCodeRequest {
  workspaceId: WorkspaceId;
  prompt: string;
  context?: ClaudeCodeContext;
  options?: ClaudeCodeOptions;
}

export interface ClaudeCodeContext {
  files?: FilePath[];
  directories?: FilePath[];
  language?: string;
  framework?: string;
}

export interface ClaudeCodeOptions {
  maxTokens?: number;
  temperature?: number;
  includeTests?: boolean;
  preserveFormatting?: boolean;
}

/**
 * GitLab API types
 */
export interface GitLabRepository {
  id: number;
  name: string;
  path: string;
  pathWithNamespace: string;
  httpUrlToRepo: GitUrl;
  sshUrlToRepo: GitUrl;
  defaultBranch: string;
  lastActivityAt: Date;
}

export interface GitLabBranch {
  name: string;
  commit: {
    id: CommitHash;
    message: string;
    authorName: string;
    authoredDate: Date;
  };
  protected: boolean;
}

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

export interface CreateMergeRequestOptions {
  projectId: string | number;
  title: string;
  description: string;
  sourceBranch: string;
  targetBranch: string;
  assigneeId?: number;
  labels?: string[];
  removeSourceBranch?: boolean;
  squash?: boolean;
}

// MergeRequestSummary interface removed - auto-generated summaries deprecated

/**
 * Error types
 */
export class WorkspaceError extends Error {
  constructor(
    message: string,
    public readonly code: WorkspaceErrorCode,
    public readonly workspaceId?: WorkspaceId
  ) {
    super(message);
    this.name = 'WorkspaceError';
  }
}

export enum WorkspaceErrorCode {
  NOT_FOUND = 'WORKSPACE_NOT_FOUND',
  CREATION_FAILED = 'WORKSPACE_CREATION_FAILED',
  ACCESS_DENIED = 'WORKSPACE_ACCESS_DENIED',
  SIZE_LIMIT_EXCEEDED = 'WORKSPACE_SIZE_LIMIT_EXCEEDED',
  INVALID_REPOSITORY = 'INVALID_REPOSITORY',
  GIT_OPERATION_FAILED = 'GIT_OPERATION_FAILED',

  CLAUDE_API_ERROR = 'CLAUDE_API_ERROR'
}

/**
 * Configuration types
 */
export interface AppConfig {
  gitlab: GitLabConfig;
  claude: ClaudeConfig;
  workspace: WorkspaceConfig;
  security: SecurityConfig;
  logging: LoggingConfig;
}

export interface GitLabConfig {
  url: string;
  token: string;
  allowedHosts: string[];
}

export interface ClaudeConfig {
  apiKey: string;
  codeCliPath: string;
  maxTokens: number;
  defaultTemperature: number;
}

export interface WorkspaceConfig {
  maxSizeMB: number;
  maxConcurrent: number;
  tempDirPrefix: string;
}

export interface SecurityConfig {
  allowedGitLabHosts: string[];
  maxWorkspaceSize: number;
  enableSandboxing: boolean;
}

export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  format: 'json' | 'text';
  enableFileLogging: boolean;
}

/**
 * UI Component types
 */
export interface IconSvgProps {
  size?: number;
  width?: number;
  height?: number;
  [key: string]: any;
}

/**
 * Utility types
 */
export type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };

export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
  hasPrevious: boolean;
};

export interface GitCredentials {
  username: string;
  password: string; // This could be a personal access token
  provider?: 'gitlab' | 'github' | 'bitbucket' | 'other';
}

export interface GitCloneRequestOptions {
  branch?: string;
  depth?: number;
  singleBranch?: boolean;
  credentials?: GitCredentials;
} 