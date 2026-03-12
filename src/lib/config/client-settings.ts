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
    username: '',
    commitName: '',
    commitEmail: '',
    allowedHosts: ['gitlab.com'],
  },
  github: {
    token: '',
    username: '',
    commitName: '',
    commitEmail: '',
  },
  claude: {
    maxTokens: 4000,
    defaultTemperature: 0.3,
  },
  workspace: {
    maxSizeMB: 500,
    maxConcurrent: 3,
    tempDirPrefix: 'gitlab-claude-',
  },
  security: {
    allowedGitLabHosts: ['gitlab.com'],
    allowedGitHubHosts: ['github.com'],
    maxWorkspaceSize: 500 * 1024 * 1024, // 500MB in bytes
    apiKey: '',
  },
  logging: {
    level: 'info',
    format: 'text',
    enableFileLogging: false,
  },
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
      username: DEFAULT_CONFIG.gitlab.username,
      commitName: DEFAULT_CONFIG.gitlab.commitName,
      commitEmail: DEFAULT_CONFIG.gitlab.commitEmail,
      tokenSet: false,
      allowedHosts: DEFAULT_CONFIG.gitlab.allowedHosts,
    },
    github: {
      username: DEFAULT_CONFIG.github.username,
      commitName: DEFAULT_CONFIG.github.commitName,
      commitEmail: DEFAULT_CONFIG.github.commitEmail,
      tokenSet: false,
    },
    claude: {
      maxTokens: DEFAULT_CONFIG.claude.maxTokens,
      defaultTemperature: DEFAULT_CONFIG.claude.defaultTemperature,
    },
    workspace: DEFAULT_CONFIG.workspace,
    security: DEFAULT_CONFIG.security,
    logging: DEFAULT_CONFIG.logging,
  };
}

/**
 * Validate common configuration fields shared between full and client-safe configs
 */
function validateCommonFields(config: {
  gitlab: { url: string };
  workspace: { maxSizeMB: number; maxConcurrent: number };
  logging: { level: string };
}): string[] {
  const errors: string[] = [];

  if (config.gitlab.url && !config.gitlab.url.startsWith('http')) {
    errors.push('GitLab URL must be a valid HTTP(S) URL');
  }

  if (config.workspace.maxSizeMB <= 0) {
    errors.push('Workspace size limit must be positive');
  }

  if (config.workspace.maxConcurrent <= 0) {
    errors.push('Concurrent workspace limit must be positive');
  }

  const validLogLevels = ['debug', 'info', 'warn', 'error'];
  if (!validLogLevels.includes(config.logging.level)) {
    errors.push('Log level must be one of: debug, info, warn, error');
  }

  return errors;
}

/**
 * Validate configuration (client-safe)
 */
export function validateConfig(config: AppConfig): string[] {
  return validateCommonFields(config);
}

/**
 * Validate client-safe configuration
 */
export function validateClientSafeConfig(config: ClientSafeAppConfig): string[] {
  return validateCommonFields(config);
}

/**
 * Check if configuration is complete (has required tokens)
 */
export function isConfigurationComplete(config: AppConfig): boolean {
  // CLI auth is always used — no API key required.
  return Boolean(config.gitlab.token);
}

/**
 * Get configuration status for UI
 */
export function getConfigurationStatus(config: AppConfig) {
  return {
    gitlab: {
      configured: !!config.gitlab.token,
      url: config.gitlab.url,
    },
    claude: {
      configured: true, // CLI auth is always used
    },
    workspace: {
      baseDir: '/app/workspaces', // Static for client
      maxSizeMB: config.workspace.maxSizeMB,
      maxConcurrent: config.workspace.maxConcurrent,
    },
    isComplete: isConfigurationComplete(config),
  };
}
