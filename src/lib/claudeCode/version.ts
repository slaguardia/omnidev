'use server';

/**
 * Claude Code version utilities
 */

import { spawn } from 'node:child_process';
import { getRuntimeConfig } from '@/lib/workspace/runtime-config';
import type { AsyncResult } from '@/lib/types/index';

/**
 * Get Claude Code version information
 */
export async function getClaudeCodeVersion(): Promise<AsyncResult<string>> {
  // Get runtime configuration for API key
  const config = await getRuntimeConfig();

  return new Promise((resolve) => {
    let output = '';

    const versionProcess = spawn('claude', ['--version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      env: {
        ...process.env,
        // Use API key from runtime configuration if available
        ANTHROPIC_API_KEY: config.claude.apiKey || process.env.ANTHROPIC_API_KEY,
      },
    });

    versionProcess.stdout?.on('data', (data) => {
      output += data.toString();
    });

    versionProcess.stderr?.on('data', (data) => {
      output += data.toString();
    });

    versionProcess.on('close', (code) => {
      if (code === 0) {
        resolve({
          success: true,
          data: output.trim(),
        });
      } else {
        resolve({
          success: false,
          error: new Error('Failed to get Claude Code version'),
        });
      }
    });

    versionProcess.on('error', (error) => {
      resolve({
        success: false,
        error: new Error(`Failed to execute Claude Code: ${error.message}`),
      });
    });

    // Timeout after 5 seconds
    setTimeout(() => {
      versionProcess.kill();
      resolve({
        success: false,
        error: new Error('Claude Code version check timed out'),
      });
    }, 5000);
  });
}
