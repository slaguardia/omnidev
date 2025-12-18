'use server';

import { getConfig } from '@/lib/config/server-actions';

/**
 * Get runtime configuration from workspaces/app-config.json
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
  const authModeEnv = (process.env.CLAUDE_CODE_AUTH_MODE || '').toLowerCase();
  const authMode = (authModeEnv || config.claude.authMode || 'auto').toLowerCase();
  const forceCliAuth = authMode === 'cli';

  if (!config.gitlab.token) {
    errors.push('GitLab token is required. Please configure it in Settings.');
  }

  // In subscription/manual-login mode, an API key is intentionally not required.
  if (!forceCliAuth && !config.claude.apiKey && !process.env.ANTHROPIC_API_KEY) {
    errors.push(
      "Claude authentication is required. Set an API key in Settings (platform account) or set CLAUDE_CODE_AUTH_MODE=cli and log in with the 'claude' CLI inside the container (subscription account)."
    );
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      message: 'Configuration incomplete. Please check your settings.',
    };
  }

  return {
    valid: true,
    errors: [],
    message: 'Configuration is valid.',
  };
}
