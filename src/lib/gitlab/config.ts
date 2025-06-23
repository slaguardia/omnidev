'use server';

/**
 * GitLab configuration loading and API instance creation
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { GitLabAPI } from '@/lib/gitlab/api';
import { getConfigFile } from '@/lib/workspace/serverConfig';

/**
 * Load configuration from saved config file
 */
async function loadSavedConfig(): Promise<{ GITLAB_URL?: string; GITLAB_TOKEN?: string } | null> {
  try {
    const configFile = await getConfigFile();
    
    if (!existsSync(configFile)) {
      return null;
    }
    
    const fileContent = await readFile(configFile, 'utf-8');
    const config = JSON.parse(fileContent);
    
    return {
      GITLAB_URL: config.GITLAB_URL,
      GITLAB_TOKEN: config.GITLAB_TOKEN
    };
  } catch (error) {
    console.warn('Failed to load saved configuration:', error);
    return null;
  }
}

/**
 * Create GitLab API instance from saved config file only
 */
export async function createGitLabAPI(): Promise<GitLabAPI | null> {
  // Load from saved configuration only
  const savedConfig = await loadSavedConfig();
  
  if (!savedConfig) {
    console.warn('No saved GitLab configuration found. Please configure GitLab settings in the UI.');
    return null;
  }

  const baseUrl = savedConfig.GITLAB_URL || 'https://gitlab.com';
  const token = savedConfig.GITLAB_TOKEN;

  if (!token) {
    console.warn('GitLab token not found in saved configuration. Please set it in the settings.');
    return null;
  }

  return new GitLabAPI({ baseUrl, token });
} 