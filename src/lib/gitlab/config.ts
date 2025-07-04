'use server';

/**
 * GitLab configuration loading
 */

import { getConfig } from '@/lib/config/server-actions';

/**
 * Load configuration from saved config file
 */
export async function loadGitLabConfig(): Promise<{ GITLAB_URL?: string; GITLAB_TOKEN?: string } | null> {
  try {
    const config = await getConfig();
    
    return {
      GITLAB_URL: config.gitlab.url,
      GITLAB_TOKEN: config.gitlab.token
    };
  } catch (error) {
    console.warn('Failed to load saved configuration:', error);
    return null;
  }
}

/**
 * Get GitLab configuration with defaults
 */
export async function getGitLabConfig(): Promise<{ baseUrl: string; token: string | null }> {
  const savedConfig = await loadGitLabConfig();
  
  if (!savedConfig) {
    console.warn('No saved GitLab configuration found. Please configure GitLab settings in the UI.');
    return {
      baseUrl: 'https://gitlab.com',
      token: null
    };
  }

  const baseUrl = savedConfig.GITLAB_URL || 'https://gitlab.com';
  const token = savedConfig.GITLAB_TOKEN || null;

  if (!token) {
    console.warn('GitLab token not found in saved configuration. Please set it in the settings.');
  }

  return { baseUrl, token };
} 