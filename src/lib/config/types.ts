import { WorkspaceConfig } from '@/lib/workspace/types';
import { GitLabConfig, ClientSafeGitLabConfig } from '@/lib/gitlab/types';
import { GitHubConfig, ClientSafeGitHubConfig } from '@/lib/github/types';

/**
 * Configuration types
 */
export interface AppConfig {
  gitlab: GitLabConfig;
  github: GitHubConfig;
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
  github: ClientSafeGitHubConfig;
  claude: ClientSafeClaudeConfig;
  workspace: WorkspaceConfig;
  security: SecurityConfig;
  logging: LoggingConfig;
}

export interface ClaudeConfig {
  maxTokens: number;
  defaultTemperature: number;
}

export interface ClientSafeClaudeConfig {
  maxTokens: number;
  defaultTemperature: number;
}

export interface SecurityConfig {
  allowedGitLabHosts: string[];
  allowedGitHubHosts: string[];
  maxWorkspaceSize: number;
  apiKey: string;
}

export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  format: 'json' | 'text';
  enableFileLogging: boolean;
}

export interface ApiKey {
  key: string;
  userId: string;
  createdAt: string;
}
