'use server';

import { getConfig } from '@/lib/config/server-actions';

/**
 * Get runtime configuration from /data/app-config.json
 */
export async function getRuntimeConfig() {
  return await getConfig();
}

/**
 * Validate that required configuration is available
 */
export async function validateRuntimeConfiguration() {
  const config = await getRuntimeConfig();
  const errors: string[] = [];

  if (!config.gitlab.token) {
    errors.push('GitLab token is required. Please configure it in Settings.');
  }

  if (!config.claude.apiKey) {
    errors.push('Claude API key is required. Please configure it in Settings.');
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      message: 'Configuration incomplete. Please check your settings.'
    };
  }

  return {
    valid: true,
    errors: [],
    message: 'Configuration is valid.'
  };
} 