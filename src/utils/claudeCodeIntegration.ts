/**
 * Claude Code Integration Utilities
 */

import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import type { FilePath, AsyncResult } from '@/types/index';

export interface ClaudeCodeOptions {
  context?: string;
  workingDirectory: FilePath;
}

/**
 * Check if Claude Code is available in the system
 */
export async function checkClaudeCodeAvailability(): Promise<AsyncResult<boolean>> {
  return new Promise((resolve) => {
    const testProcess = spawn('claude', ['--version'], {
      stdio: 'ignore',
      shell: true
    });

    testProcess.on('close', (code) => {
      resolve({
        success: true,
        data: code === 0
      });
    });

    testProcess.on('error', () => {
      resolve({
        success: true,
        data: false
      });
    });

    // Timeout after 5 seconds
    setTimeout(() => {
      testProcess.kill();
      resolve({
        success: true,
        data: false
      });
    }, 5000);
  });
}

/**
 * Execute Claude Code ask command
 */
export async function askClaudeCode(
  question: string,
  options: ClaudeCodeOptions
): Promise<AsyncResult<void>> {
  try {
    // Verify working directory exists
    try {
      await access(options.workingDirectory);
    } catch {
      return {
        success: false,
        error: new Error(`Working directory does not exist: ${options.workingDirectory}`)
      };
    }

    // Check Claude Code availability
    const availabilityCheck = await checkClaudeCodeAvailability();
    if (!availabilityCheck.success || !availabilityCheck.data) {
      return {
        success: false,
        error: new Error('Claude Code is not available. Make sure it is installed globally: npm install -g claude-code')
      };
    }

    // Build command arguments
    const args = ['ask', question];
    if (options.context) {
      args.push('--context', options.context);
    }

    // Execute Claude Code
    return new Promise((resolve) => {
      const claudeProcess = spawn('claude', args, {
        cwd: options.workingDirectory,
        stdio: 'inherit',
        shell: true
      });

      claudeProcess.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, data: undefined });
        } else {
          resolve({
            success: false,
            error: new Error(`Claude Code exited with code ${code}`)
          });
        }
      });

      claudeProcess.on('error', (error) => {
        resolve({
          success: false,
          error: new Error(`Failed to execute Claude Code: ${error.message}`)
        });
      });
    });

  } catch (error) {
    return {
      success: false,
      error: new Error(`Claude Code integration error: ${error}`)
    };
  }
}

/**
 * Get Claude Code version information
 */
export async function getClaudeCodeVersion(): Promise<AsyncResult<string>> {
  return new Promise((resolve) => {
    let output = '';
    
    const versionProcess = spawn('claude', ['--version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true
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
          data: output.trim()
        });
      } else {
        resolve({
          success: false,
          error: new Error('Failed to get Claude Code version')
        });
      }
    });

    versionProcess.on('error', (error) => {
      resolve({
        success: false,
        error: new Error(`Failed to execute Claude Code: ${error.message}`)
      });
    });

    // Timeout after 5 seconds
    setTimeout(() => {
      versionProcess.kill();
      resolve({
        success: false,
        error: new Error('Claude Code version check timed out')
      });
    }, 5000);
  });
} 