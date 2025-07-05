'use server';

/**
 * Server actions for configuration management
 * Handles file system operations that can't run in the browser
 */

import { resolve } from 'node:path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import type { AppConfig, ClientSafeAppConfig } from '@/lib/types/index';
import { DEFAULT_CONFIG, validateConfig, validateClientSafeConfig } from './client-settings';


/**
 * Configuration file path in workspaces directory
 */
function getConfigFilePath(): string {
  const workspaceDir = resolve(process.cwd(), 'workspaces');
  if (!existsSync(workspaceDir)) {
    mkdirSync(workspaceDir, { recursive: true });
  }
  return resolve(workspaceDir, 'app-config.json');
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
    
    // Merge with defaults to ensure all fields exist
    return {
      gitlab: { ...DEFAULT_CONFIG.gitlab, ...savedConfig.gitlab },
      claude: { ...DEFAULT_CONFIG.claude, ...savedConfig.claude },
      workspace: { ...DEFAULT_CONFIG.workspace, ...savedConfig.workspace },
      security: { ...DEFAULT_CONFIG.security, ...savedConfig.security },
      logging: { ...DEFAULT_CONFIG.logging, ...savedConfig.logging }
    };
  } catch (error) {
    console.warn('Failed to load config file, using defaults:', error);
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Server action: Get current configuration (INTERNAL USE ONLY - contains sensitive data)
 */
export async function getConfig(): Promise<AppConfig> {
  return loadConfigFromFile();
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
      return {
        success: false,
        message: 'Configuration validation failed',
        errors
      };
    }

    const configPath = getConfigFilePath();
    writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    
    console.log('Configuration saved successfully to:', configPath);
    return {
      success: true,
      message: 'Configuration saved successfully!'
    };
  } catch (error) {
    console.error('Failed to save configuration:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to save configuration'
    };
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
    // Validate client-safe configuration first
    const clientErrors = validateClientSafeConfig(clientConfig);
    if (clientErrors.length > 0) {
      return {
        success: false,
        message: 'Configuration validation failed',
        errors: clientErrors
      };
    }

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

    // Save the updated configuration
    return await saveConfig(updatedConfig);
  } catch (error) {
    console.error('Failed to update configuration:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to update configuration'
    };
  }
}

/**
 * Server action: Get workspace base directory
 */
export async function getWorkspaceBaseDir(): Promise<string> {
  return resolve(process.cwd(), 'workspaces');
}

/**
 * Server action: Initialize configuration system
 */
export async function initializeConfigSystem(): Promise<void> {
  try {
    // Ensure workspaces directory exists
    const workspaceDir = await getWorkspaceBaseDir();
    if (!existsSync(workspaceDir)) {
      mkdirSync(workspaceDir, { recursive: true });
    }
    
    // Load configuration (creates defaults if none exist)
    const config = await getConfig();
    const errors = validateConfig(config);
    
    if (errors.length > 0) {
      console.warn('Configuration has issues:', errors);
    } else {
      console.log('Configuration system initialized');
    }
  } catch (error) {
    console.error('Configuration initialization failed:', error);
    // Don't throw - let the app start anyway
  }
}
