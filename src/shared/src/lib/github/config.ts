'use server';

/**
 * GitHub configuration utilities
 */

import { getConfig } from '@/lib/config/server-actions';

/**
 * Load GitHub config from saved settings
 */
export async function loadGitHubConfig(): Promise<{
  GITHUB_TOKEN?: string;
} | null> {
  try {
    const config = await getConfig();
    return {
      GITHUB_TOKEN: config.github?.token,
    };
  } catch (error) {
    console.warn('[GITHUB CONFIG] Failed to load saved configuration:', error);
    return null;
  }
}

/**
 * Get GitHub config with validation
 */
export async function getGitHubConfig(): Promise<{
  token: string | null;
}> {
  const savedConfig = await loadGitHubConfig();

  if (!savedConfig) {
    console.warn('[GITHUB CONFIG] No saved GitHub configuration found.');
    return { token: null };
  }

  const token = savedConfig.GITHUB_TOKEN || null;

  if (!token) {
    console.warn('[GITHUB CONFIG] GitHub token not found in saved configuration.');
  }

  return { token };
}
