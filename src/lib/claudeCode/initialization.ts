'use server';

import { access } from 'node:fs/promises';
import { ClaudeCodeOptions } from './types';
import { getConfig } from '@/lib/config/server-actions';
import { AsyncResult } from '@/lib/common/types';
import { AppConfig } from '@/lib/config/types';

/**
 * Initialize Claude Code with runtime configuration and validation
 *
 * This function performs the following initialization steps:
 * 1. Loads runtime configuration to get the Claude API key
 * 2. Validates that the API key is properly configured
 * 3. Verifies that the working directory exists and is accessible
 */
export async function initializeClaudeCode(params: ClaudeCodeOptions): Promise<
  AsyncResult<{
    config: AppConfig;
  }>
> {
  const authModeEnv = (process.env.CLAUDE_CODE_AUTH_MODE || '').toLowerCase();

  // Get runtime configuration for API key
  console.log(`[CLAUDE CODE] Loading runtime configuration...`);
  const configStart = Date.now();
  const config = await getConfig();
  console.log(`[CLAUDE CODE] ✅ Configuration loaded in ${Date.now() - configStart}ms`);
  const authMode = (authModeEnv || config.claude.authMode || 'auto').toLowerCase();
  const forceCliAuth = authMode === 'cli';

  // Validate auth configuration:
  // - In 'cli' mode (subscription/manual login), API key is intentionally not required.
  // - In other modes, we still allow missing API key (it may be provided via env),
  //   but we emit a warning to aid debugging.
  if (!forceCliAuth && !config.claude.apiKey && !process.env.ANTHROPIC_API_KEY) {
    console.warn(
      `[CLAUDE CODE] ⚠️ No Claude API key found in configuration or environment; if you are using a subscription account set CLAUDE_CODE_AUTH_MODE=cli and login with 'claude auth login'`
    );
  }

  // Verify working directory exists
  console.log(`[CLAUDE CODE] Verifying working directory: ${params.workingDirectory}`);
  const dirCheckStart = Date.now();
  try {
    await access(params.workingDirectory);
    console.log(`[CLAUDE CODE] ✅ Working directory verified in ${Date.now() - dirCheckStart}ms`);
  } catch (error) {
    console.error(`[CLAUDE CODE] ❌ Working directory not accessible:`, error);
    return {
      success: false,
      error: new Error(`Working directory does not exist: ${params.workingDirectory}`),
    };
  }

  return {
    success: true,
    data: {
      config: config,
    },
  };
}
