/**
 * Client-side configuration management
 * No Node.js APIs - safe for browser use
 */

import type { AppConfig, ClientSafeAppConfig } from '@/lib/types/index';

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: AppConfig = {
  gitlab: {
    url: 'https://gitlab.com',
    token: '',
    allowedHosts: ['gitlab.com']
  },
  claude: {
    apiKey: '',
    codeCliPath: '/usr/bin/claude',
    maxTokens: 4000,
    defaultTemperature: 0.3
  },
  workspace: {
    maxSizeMB: 500,
    maxConcurrent: 3,
    tempDirPrefix: 'gitlab-claude-'
  },
  security: {
    allowedGitLabHosts: ['gitlab.com'],
    maxWorkspaceSize: 500 * 1024 * 1024, // 500MB in bytes
    enableSandboxing: true,
    apiKey: ''
  },
  logging: {
    level: 'info',
    format: 'text',
    enableFileLogging: false
  }
};

/**
 * Get default configuration (client-safe)
 */
export function getDefaultConfig(): AppConfig {
  return { ...DEFAULT_CONFIG };
}

/**
 * Get default client-safe configuration (sensitive data removed)
 */
export function getDefaultClientSafeConfig(): ClientSafeAppConfig {
  return {
    gitlab: {
      url: DEFAULT_CONFIG.gitlab.url,
      tokenSet: false,
      allowedHosts: DEFAULT_CONFIG.gitlab.allowedHosts
    },
    claude: {
      apiKeySet: false,
      codeCliPath: DEFAULT_CONFIG.claude.codeCliPath,
      maxTokens: DEFAULT_CONFIG.claude.maxTokens,
      defaultTemperature: DEFAULT_CONFIG.claude.defaultTemperature
    },
    workspace: DEFAULT_CONFIG.workspace,
    security: DEFAULT_CONFIG.security,
    logging: DEFAULT_CONFIG.logging
  };
}

/**
 * Validate configuration (client-safe)
 */
export function validateConfig(config: AppConfig): string[] {
  const errors: string[] = [];

  // Validate GitLab URL format
  if (config.gitlab.url && !config.gitlab.url.startsWith('http')) {
    errors.push('GitLab URL must be a valid HTTP(S) URL');
  }

  // Validate workspace limits
  if (config.workspace.maxSizeMB <= 0) {
    errors.push('Workspace size limit must be positive');
  }

  if (config.workspace.maxConcurrent <= 0) {
    errors.push('Concurrent workspace limit must be positive');
  }

  // Validate logging level
  const validLogLevels = ['debug', 'info', 'warn', 'error'];
  if (!validLogLevels.includes(config.logging.level)) {
    errors.push('Log level must be one of: debug, info, warn, error');
  }

  return errors;
}

/**
 * Validate client-safe configuration
 */
export function validateClientSafeConfig(config: ClientSafeAppConfig): string[] {
  const errors: string[] = [];

  // Validate GitLab URL format
  if (config.gitlab.url && !config.gitlab.url.startsWith('http')) {
    errors.push('GitLab URL must be a valid HTTP(S) URL');
  }

  // Validate workspace limits
  if (config.workspace.maxSizeMB <= 0) {
    errors.push('Workspace size limit must be positive');
  }

  if (config.workspace.maxConcurrent <= 0) {
    errors.push('Concurrent workspace limit must be positive');
  }

  // Validate logging level
  const validLogLevels = ['debug', 'info', 'warn', 'error'];
  if (!validLogLevels.includes(config.logging.level)) {
    errors.push('Log level must be one of: debug, info, warn, error');
  }

  return errors;
}

/**
 * Check if configuration is complete (has required tokens)
 */
export function isConfigurationComplete(config: AppConfig): boolean {
  return !!(config.gitlab.token && config.claude.apiKey);
}

/**
 * Get configuration status for UI
 */
export function getConfigurationStatus(config: AppConfig) {
  return {
    gitlab: {
      configured: !!config.gitlab.token,
      url: config.gitlab.url
    },
    claude: {
      configured: !!config.claude.apiKey,
      codeCliPath: config.claude.codeCliPath
    },
    workspace: {
      baseDir: '/app/workspaces', // Static for client
      maxSizeMB: config.workspace.maxSizeMB,
      maxConcurrent: config.workspace.maxConcurrent
    },
    isComplete: isConfigurationComplete(config)
  };
} 