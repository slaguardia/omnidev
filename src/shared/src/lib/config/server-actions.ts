'use server';

/**
 * Server actions for configuration management
 * Handles file system operations that can't run in the browser
 */

import { resolve } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import type { AppConfig, ClientSafeAppConfig, FilePath } from '@/lib/types/index';
import { validateConfig, validateClientSafeConfig } from './client-settings';
import {
  getConfig as loadAppConfig,
  saveConfig as persistAppConfig,
  getAppConfigStoragePath,
} from './app-config-store';
import { getAllWorkspaces } from '@/lib/managers/workspace-manager';
import { setWorkspaceGitConfig } from '@/lib/git/config';
import { discoverGitLabRepositories } from '@/lib/gitlab/discovery';
import { discoverGitHubRepositories } from '@/lib/github/discovery';
import {
  mergeDiscoveredRepos,
  clearProviderRepos,
} from '@/lib/managers/discovery-registry-manager';
/**
 * Server action: Get data directory (app-managed files only, not accessible to Claude Code)
 */
export async function getDataDir(): Promise<string> {
  return resolve(process.cwd(), 'data');
}

/**
 * Server action: Get current configuration (INTERNAL USE ONLY - contains sensitive data)
 */
export async function getConfig(): Promise<AppConfig> {
  return loadAppConfig();
}

/**
 * Convert full config to client-safe config (removes sensitive data)
 */
function sanitizeConfigForClient(config: AppConfig): ClientSafeAppConfig {
  const result: ClientSafeAppConfig = {
    gitlab: {
      url: config.gitlab.url,
      username: config.gitlab.username || '',
      commitName: config.gitlab.commitName || '',
      commitEmail: config.gitlab.commitEmail || '',
      tokenSet: !!config.gitlab.token,
      allowedHosts: config.gitlab.allowedHosts,
    },
    github: {
      username: config.github.username || '',
      commitName: config.github.commitName || '',
      commitEmail: config.github.commitEmail || '',
      tokenSet: !!config.github.token,
    },
    claude: {
      maxTokens: config.claude.maxTokens,
      defaultTemperature: config.claude.defaultTemperature,
    },
    workspace: config.workspace,
    security: config.security,
    logging: config.logging,
  };
  return result;
}

/**
 * Server action: Get client-safe configuration (sensitive data removed)
 */
export async function getClientSafeConfig(): Promise<ClientSafeAppConfig> {
  const config = await loadAppConfig();
  return sanitizeConfigForClient(config);
}

/**
 * Server action: Save configuration (INTERNAL USE ONLY — file or Postgres via app-config-store)
 */
export async function saveConfig(
  config: AppConfig
): Promise<{ success: boolean; message: string; errors?: string[] }> {
  try {
    // Validate configuration first
    const errors = validateConfig(config);
    if (errors.length > 0) {
      return {
        success: false,
        message: 'Configuration validation failed',
        errors,
      };
    }

    // Strip legacy workflow key if present (now stored separately)
    const toSave = { ...config };
    delete (toSave as Record<string, unknown>).workflow;

    await persistAppConfig(toSave);

    const storage = getAppConfigStoragePath();
    console.log(
      'Configuration saved successfully',
      storage ? `to: ${storage}` : 'to PostgreSQL (omnidev_app_config)'
    );
    return {
      success: true,
      message: 'Configuration saved successfully!',
    };
  } catch (error) {
    console.error('Failed to save configuration:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to save configuration',
    };
  }
}

/**
 * Update git config for all existing workspaces
 */
async function updateAllWorkspacesGitConfig(
  commitName: string,
  commitEmail: string
): Promise<void> {
  if (!commitName && !commitEmail) {
    return;
  }

  try {
    const workspacesResult = await getAllWorkspaces();
    if (!workspacesResult.success) {
      console.warn('Failed to get workspaces for git config update:', workspacesResult.error);
      return;
    }

    const workspaces = workspacesResult.data;
    console.log(`Updating git config for ${workspaces.length} workspaces...`);

    for (const workspace of workspaces) {
      if (!workspace.path) {
        continue;
      }
      try {
        const result = await setWorkspaceGitConfig(workspace.path as FilePath, {
          userName: commitName,
          userEmail: commitEmail,
        });
        if (result.success) {
          console.log(`Git config updated for workspace: ${workspace.id}`);
        } else {
          console.warn(`Failed to update git config for workspace ${workspace.id}:`, result.error);
        }
      } catch (error) {
        console.warn(`Error updating git config for workspace ${workspace.id}:`, error);
      }
    }
  } catch (error) {
    console.warn('Error updating workspaces git config:', error);
  }
}

/**
 * Server action: Update configuration with selective sensitive data updates
 */
export async function updateConfigFromClient(
  clientConfig: ClientSafeAppConfig,
  sensitiveData?: {
    gitlabToken?: string;
    githubToken?: string;
  }
): Promise<{ success: boolean; message: string; errors?: string[] }> {
  try {
    // Validate client-safe configuration first
    const clientErrors = validateClientSafeConfig(clientConfig);
    if (clientErrors.length > 0) {
      return {
        success: false,
        message: 'Configuration validation failed',
        errors: clientErrors,
      };
    }

    // Load current configuration
    const currentConfig = await loadAppConfig();

    // Check if commit identity changed
    const commitIdentityChanged =
      currentConfig.gitlab.commitName !== clientConfig.gitlab.commitName ||
      currentConfig.gitlab.commitEmail !== clientConfig.gitlab.commitEmail;

    // Create updated configuration, preserving existing sensitive data unless explicitly provided
    const updatedConfig: AppConfig = {
      gitlab: {
        url: clientConfig.gitlab.url,
        username: clientConfig.gitlab.username,
        commitName: clientConfig.gitlab.commitName,
        commitEmail: clientConfig.gitlab.commitEmail,
        token:
          sensitiveData?.gitlabToken !== undefined
            ? sensitiveData.gitlabToken
            : currentConfig.gitlab.token,
        allowedHosts: clientConfig.gitlab.allowedHosts,
      },
      github: {
        username: clientConfig.github.username,
        commitName: clientConfig.github.commitName,
        commitEmail: clientConfig.github.commitEmail,
        token:
          sensitiveData?.githubToken !== undefined
            ? sensitiveData.githubToken
            : currentConfig.github.token,
      },
      claude: {
        maxTokens: clientConfig.claude.maxTokens,
        defaultTemperature: clientConfig.claude.defaultTemperature,
      },
      workspace: clientConfig.workspace,
      security: clientConfig.security,
      logging: clientConfig.logging,
    };

    // Save the updated configuration
    const saveResult = await saveConfig(updatedConfig);

    // If save was successful and commit identity changed, update all workspaces
    if (saveResult.success && commitIdentityChanged) {
      console.log('Commit identity changed, updating all workspaces...');
      await updateAllWorkspacesGitConfig(
        clientConfig.gitlab.commitName,
        clientConfig.gitlab.commitEmail
      );
    }

    // Auto-trigger repository discovery when tokens change
    if (saveResult.success) {
      // GitLab token changed
      if (sensitiveData?.gitlabToken !== undefined) {
        if (sensitiveData.gitlabToken) {
          // Token was set/changed — fire-and-forget discovery
          discoverGitLabRepositories(updatedConfig.gitlab.url, sensitiveData.gitlabToken)
            .then((result) => {
              if (result.success) {
                void mergeDiscoveredRepos('gitlab', result.data);
              }
            })
            .catch((err: unknown) =>
              console.warn('[CONFIG] Background GitLab discovery failed:', err)
            );
        } else {
          // Token was cleared
          clearProviderRepos('gitlab').catch((err) =>
            console.warn('[CONFIG] Failed to clear GitLab repos:', err)
          );
        }
      }

      // GitHub token changed
      if (sensitiveData?.githubToken !== undefined) {
        if (sensitiveData.githubToken) {
          // Token was set/changed — fire-and-forget discovery
          discoverGitHubRepositories(sensitiveData.githubToken)
            .then((result) => {
              if (result.success) {
                void mergeDiscoveredRepos('github', result.data);
              }
            })
            .catch((err: unknown) =>
              console.warn('[CONFIG] Background GitHub discovery failed:', err)
            );
        } else {
          // Token was cleared
          clearProviderRepos('github').catch((err) =>
            console.warn('[CONFIG] Failed to clear GitHub repos:', err)
          );
        }
      }
    }

    return saveResult;
  } catch (error) {
    console.error('Failed to update configuration:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to update configuration',
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
 * Check if showcase mode is enabled
 * Showcase mode disables authentication and dashboard access for read-only publishing
 */
export async function isShowcaseMode(): Promise<boolean> {
  return process.env.NEXT_PUBLIC_SHOWCASE_MODE === 'true';
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

    // Ensure data directory exists
    const dataDir = await getDataDir();
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
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
