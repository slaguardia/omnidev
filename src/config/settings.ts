/**
 * Configuration management for GitLab Claude Manager
 */

import { config } from 'dotenv';
import { resolve } from 'node:path';
import type { AppConfig, GitLabConfig, ClaudeConfig, WorkspaceConfig, SecurityConfig, LoggingConfig } from '@/lib/types/index';

// Load environment variables
config();

/**
 * Get environment variable with type safety and default value
 */
function getEnvVar<T = string>(
  key: string,
  defaultValue?: T,
  parser?: (value: string) => T
): T {
  const value = process.env[key];
  
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Required environment variable ${key} is not set`);
  }
  
  return parser ? parser(value) : (value as unknown as T);
}

/**
 * Parse boolean from string
 */
function parseBoolean(value: string): boolean {
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Parse number from string
 */
function parseNumber(value: string): number {
  const num = parseInt(value, 10);
  if (isNaN(num)) {
    throw new Error(`Invalid number value: ${value}`);
  }
  return num;
}

/**
 * Parse comma-separated string to array
 */
function parseStringArray(value: string): string[] {
  return value.split(',').map(s => s.trim()).filter(s => s.length > 0);
}

/**
 * GitLab configuration
 */
export const gitlabConfig: GitLabConfig = {
  url: getEnvVar('GITLAB_URL', 'https://gitlab.com'),
  token: getEnvVar('GITLAB_TOKEN'),
  allowedHosts: getEnvVar('ALLOWED_GITLAB_HOSTS', ['gitlab.com'], parseStringArray)
};

/**
 * Claude configuration
 */
export const claudeConfig: ClaudeConfig = {
  apiKey: getEnvVar('CLAUDE_API_KEY'),
  codeCliPath: getEnvVar('CLAUDE_CODE_PATH', 'claude-code'),
  maxTokens: getEnvVar('CLAUDE_MAX_TOKENS', 4000, parseNumber),
  defaultTemperature: getEnvVar('CLAUDE_TEMPERATURE', 0.3, parseFloat)
};

/**
 * Workspace configuration
 */
export const workspaceConfig: WorkspaceConfig = {
  maxSizeMB: getEnvVar('MAX_WORKSPACE_SIZE_MB', 500, parseNumber),
  maxConcurrent: getEnvVar('MAX_CONCURRENT_WORKSPACES', 3, parseNumber),

  tempDirPrefix: getEnvVar('TEMP_DIR_PREFIX', 'gitlab-claude-')
};

/**
 * Security configuration
 */
export const securityConfig: SecurityConfig = {
  allowedGitLabHosts: getEnvVar('ALLOWED_GITLAB_HOSTS', ['gitlab.com'], parseStringArray),
  maxWorkspaceSize: getEnvVar('MAX_WORKSPACE_SIZE_MB', 500, parseNumber) * 1024 * 1024, // Convert to bytes
  enableSandboxing: getEnvVar('ENABLE_SANDBOXING', true, parseBoolean)
};

/**
 * Logging configuration
 */
export const loggingConfig: LoggingConfig = {
  level: getEnvVar('LOG_LEVEL', 'info') as LoggingConfig['level'],
  format: getEnvVar('LOG_FORMAT', 'text') as LoggingConfig['format'],
  enableFileLogging: getEnvVar('ENABLE_FILE_LOGGING', false, parseBoolean)
};

/**
 * Complete application configuration
 */
export const appConfig: AppConfig = {
  gitlab: gitlabConfig,
  claude: claudeConfig,
  workspace: workspaceConfig,
  security: securityConfig,
  logging: loggingConfig
};

/**
 * Validate configuration
 */
export function validateConfig(): void {
  const errors: string[] = [];

  // Validate GitLab configuration
  if (!gitlabConfig.token) {
    errors.push('GITLAB_TOKEN is required');
  }

  if (!gitlabConfig.url.startsWith('http')) {
    errors.push('GITLAB_URL must be a valid HTTP(S) URL');
  }

  // Validate Claude configuration
  if (!claudeConfig.apiKey) {
    errors.push('CLAUDE_API_KEY is required');
  }

  // Validate workspace limits
  if (workspaceConfig.maxSizeMB <= 0) {
    errors.push('MAX_WORKSPACE_SIZE_MB must be positive');
  }

  if (workspaceConfig.maxConcurrent <= 0) {
    errors.push('MAX_CONCURRENT_WORKSPACES must be positive');
  }

  // Validate logging level
  const validLogLevels = ['debug', 'info', 'warn', 'error'];
  if (!validLogLevels.includes(loggingConfig.level)) {
    errors.push('LOG_LEVEL must be one of: debug, info, warn, error');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}

/**
 * Get workspace base directory
 */
export function getWorkspaceBaseDir(): string {
  const baseDir = getEnvVar('WORKSPACE_BASE_DIR', resolve(process.cwd(), 'workspaces'));
  return resolve(baseDir);
}

/**
 * Check if running in development mode
 */
export function isDevelopment(): boolean {
  return getEnvVar('NODE_ENV', 'development' as string) === 'development';
}

/**
 * Check if running in production mode
 */
export function isProduction(): boolean {
  return getEnvVar('NODE_ENV', 'development' as string) === 'production';
}

/**
 * Initialize configuration
 */
export function initializeConfig(): void {
  try {
    validateConfig();
    console.log('Configuration loaded successfully');
    
    if (isDevelopment()) {
      console.log('Running in development mode');
      console.log('Workspace base directory:', getWorkspaceBaseDir());
    
    }
  } catch (error) {
    console.error('Configuration initialization failed:', error);
    process.exit(1);
  }
}

// Auto-initialize on import in production
if (isProduction()) {
  initializeConfig();
} 