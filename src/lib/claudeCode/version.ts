'use server';

/**
 * Claude Code version utilities
 */

import { spawn } from 'node:child_process';
import type { AsyncResult } from '@/lib/types/index';

/**
 * Get Claude Code version information
 */
export async function getClaudeCodeVersion(): Promise<AsyncResult<string>> {
  return new Promise((resolve) => {
    let output = '';

    // CLI auth: never pass API key to subprocess
    const childEnv: NodeJS.ProcessEnv = { ...process.env };
    delete childEnv.ANTHROPIC_API_KEY;

    const versionProcess = spawn('claude', ['--version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      env: {
        ...childEnv,
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
