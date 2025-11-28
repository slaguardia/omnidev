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
  // Get runtime configuration for API key
  console.log(`[CLAUDE CODE] Loading runtime configuration...`);
  const configStart = Date.now();
  const config = await getConfig();
  console.log(`[CLAUDE CODE] ✅ Configuration loaded in ${Date.now() - configStart}ms`);

  // Validate that API key is configured
  if (!config.claude.apiKey) {
    console.error(`[CLAUDE CODE] ❌ No Claude API key found in configuration`);
    return {
      success: false,
      error: new Error(
        'Claude API key is not configured. Please set your API key in the application settings.'
      ),
    };
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
