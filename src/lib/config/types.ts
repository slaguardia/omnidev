import { WorkspaceConfig } from '@/lib/workspace/types';
import { GitLabConfig } from '@/lib/gitlab/types';
import { ClientSafeGitLabConfig } from '@/lib/gitlab/types';

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

export interface ClaudeConfig {
  apiKey: string;
  /**
   * How to authenticate the `claude` CLI subprocess.
   * - auto: use API key if available; otherwise rely on CLI login
   * - cli: never pass ANTHROPIC_API_KEY to the subprocess (subscription/manual login)
   */
  authMode: 'auto' | 'cli';
  maxTokens: number;
  defaultTemperature: number;
}

export interface ClientSafeClaudeConfig {
  apiKeySet: boolean; // Instead of the actual API key
  authMode: 'auto' | 'cli';
  maxTokens: number;
  defaultTemperature: number;
}

export interface SecurityConfig {
  allowedGitLabHosts: string[];
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
