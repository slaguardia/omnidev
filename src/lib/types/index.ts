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

/**
 * Client-safe configuration (sensitive data removed)
 */
export interface ClientSafeAppConfig {
  gitlab: ClientSafeGitLabConfig;
  claude: ClientSafeClaudeConfig;
  workspace: WorkspaceConfig;
  security: SecurityConfig;
  logging: LoggingConfig;
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

export interface ClaudeConfig {
  apiKey: string;
  codeCliPath: string;
  maxTokens: number;
  defaultTemperature: number;
}

export interface ClientSafeClaudeConfig {
  apiKeySet: boolean; // Instead of the actual API key
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
  apiKey: string;
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
  [key: string]: unknown;
}

/**
 * Utility types
 */
export type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };

export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;

export interface GitCredentials {
  username: string;
  password: string; // This could be a personal access token
  provider?: 'gitlab' | 'github' | 'bitbucket' | 'other';
}
