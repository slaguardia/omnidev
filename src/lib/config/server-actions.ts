'use server';

/**
 * Server actions for configuration management
 * Handles file system operations that can't run in the browser
 */

import { resolve } from 'node:path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import type { AppConfig, ClientSafeAppConfig } from '@/lib/config/types';
import { DEFAULT_CONFIG, validateConfig } from '@/lib/config/client-settings';
import { createErrorResponse, createSuccessResponse } from '@/lib/common/actions';

/**
 * Get the path to the app-config.json file in the data directory at the project root
 */
const dataDir = resolve(process.cwd(), 'data');

function ensureDataDirSync() {
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
}

/**
 * Configuration file path in root directory
 */
function getConfigFilePath(): string {
  ensureDataDirSync();
  return resolve(dataDir, 'app-config.json');
}

/**
 * Deep merge utility specifically for AppConfig objects
 */
function mergeAppConfig(defaults: AppConfig, override: Partial<AppConfig>): AppConfig {
  return {
    gitlab: { ...defaults.gitlab, ...override.gitlab },
    claude: { ...defaults.claude, ...override.claude },
    workspace: { ...defaults.workspace, ...override.workspace },
    security: { ...defaults.security, ...override.security },
    logging: { ...defaults.logging, ...override.logging }
  };
}

/**
 * Load configuration from file or return defaults
 */
function loadConfigFromFile(): AppConfig {
  const configPath = getConfigFilePath();
  
  if (!existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }
  
  try {
    const configData = readFileSync(configPath, 'utf-8');
    const savedConfig = JSON.parse(configData) as Partial<AppConfig>;
    
    // Use specific merge function
    return mergeAppConfig(DEFAULT_CONFIG, savedConfig);
  } catch (error) {
    console.warn('Failed to load config file, using defaults:', error);
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Convert full config to client-safe config (removes sensitive data)
 */
function sanitizeConfigForClient(config: AppConfig): ClientSafeAppConfig {
  return {
    gitlab: {
      url: config.gitlab.url,
      tokenSet: !!config.gitlab.token,
      allowedHosts: config.gitlab.allowedHosts
    },
    claude: {
      apiKeySet: !!config.claude.apiKey,
      codeCliPath: config.claude.codeCliPath,
      maxTokens: config.claude.maxTokens,
      defaultTemperature: config.claude.defaultTemperature
    },
    workspace: config.workspace,
    security: config.security,
    logging: config.logging
  };
}

/**
 * Server action: Get current configuration (INTERNAL USE ONLY - contains sensitive data)
 */
export async function getConfig(): Promise<AppConfig> {
  return loadConfigFromFile();
}

/**
 * Server action: Get client-safe configuration (sensitive data removed)
 */
export async function getClientSafeConfig(): Promise<ClientSafeAppConfig> {
  const config = loadConfigFromFile();
  return sanitizeConfigForClient(config);
}

/**
 * Server action: Save configuration to file (INTERNAL USE ONLY - contains sensitive data)
 */
export async function saveConfig(config: AppConfig): Promise<{ success: boolean; message: string; errors?: string[] }> {
  try {
    // Validate configuration first
    const errors = validateConfig(config);
    if (errors.length > 0) {
      return createErrorResponse('Configuration validation failed', errors);
    }

    const configPath = getConfigFilePath();
    writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    
    console.log('Configuration saved successfully to:', configPath);
    return createSuccessResponse('Configuration saved successfully!');
  } catch (error) {
    console.error('Failed to save configuration:', error);
    return createErrorResponse(error instanceof Error ? error.message : 'Failed to save configuration');
  }
}

/**
 * Server action: Update configuration with selective sensitive data updates
 */
export async function updateConfigFromClient(
  clientConfig: ClientSafeAppConfig,
  sensitiveData?: {
    gitlabToken?: string;
    claudeApiKey?: string;
  }
): Promise<{ success: boolean; message: string; errors?: string[] }> {
  try {
    // Load current configuration
    const currentConfig = loadConfigFromFile();
    
    // Create updated configuration, preserving existing sensitive data unless explicitly provided
    const updatedConfig: AppConfig = {
      gitlab: {
        url: clientConfig.gitlab.url,
        token: sensitiveData?.gitlabToken !== undefined ? sensitiveData.gitlabToken : currentConfig.gitlab.token,
        allowedHosts: clientConfig.gitlab.allowedHosts
      },
      claude: {
        apiKey: sensitiveData?.claudeApiKey !== undefined ? sensitiveData.claudeApiKey : currentConfig.claude.apiKey,
        codeCliPath: clientConfig.claude.codeCliPath,
        maxTokens: clientConfig.claude.maxTokens,
        defaultTemperature: clientConfig.claude.defaultTemperature
      },
      workspace: clientConfig.workspace,
      security: clientConfig.security,
      logging: clientConfig.logging
    };

    // Use the shared save function with validation
    return await saveConfig(updatedConfig);
  } catch (error) {
    console.error('Failed to update configuration:', error);
    return createErrorResponse(error instanceof Error ? error.message : 'Failed to update configuration');
  }
}

/**
 * Server action: Get workspace base directory
 */
export async function getWorkspaceBaseDir(): Promise<string> {
  return resolve(process.cwd(), 'workspaces');
}
