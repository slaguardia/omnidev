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
    // Try 'claude --help' instead of --version
    const testProcess = spawn('claude', ['--help'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true
    });

    let output = '';
    testProcess.stdout?.on('data', (data) => {
      output += data.toString();
    });

    testProcess.stderr?.on('data', (data) => {
      output += data.toString();
    });

    testProcess.on('close', (code) => {
      // Claude Code should exit with 0 for --help and output should contain usage info
      const isAvailable = code === 0 && (output.includes('ask') || output.includes('claude'));
      resolve({
        success: true,
        data: isAvailable
      });
    });

    testProcess.on('error', (error) => {
      console.log('Claude availability check error:', error.message);
      resolve({
        success: true,
        data: false
      });
    });

    // Timeout after 10 seconds
    setTimeout(() => {
      testProcess.kill();
      resolve({
        success: true,
        data: false
      });
    }, 10000);
  });
}

/**
 * Execute Claude Code ask command and capture output
 */
export async function askClaudeCode(
  question: string,
  options: ClaudeCodeOptions
): Promise<AsyncResult<string>> {
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

    // First, try to grant permissions to the directory
    console.log('Attempting to grant Claude Code permissions for:', options.workingDirectory);
    
    // Try using stdin to pass the question with permission grant
    const command = 'claude ask';
    
    console.log('Executing Claude Code command:', command);
    console.log('Passing question via stdin:', question);

    // Execute Claude Code and capture output
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';

      const claudeProcess = spawn(command, {
        cwd: options.workingDirectory,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true
      });

      // Send the question with permission request via stdin
      if (claudeProcess.stdin) {
        claudeProcess.stdin.write('yes\n'); // Auto-approve permission request
        claudeProcess.stdin.write(question + '\n');
        if (options.context) {
          claudeProcess.stdin.write(`Context: ${options.context}\n`);
        }
        claudeProcess.stdin.end();
      }

      // Capture stdout
      claudeProcess.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      // Capture stderr
      claudeProcess.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      claudeProcess.on('close', (code) => {
        console.log('Claude Code process closed with code:', code);
        console.log('stdout:', stdout);
        console.log('stderr:', stderr);
        
        if (code === 0) {
          const output = stdout.trim() || stderr.trim();
          // If we get a generic response, it might mean the question wasn't passed correctly
          if (output.includes("I'm ready to help") || output.includes("What would you like")) {
            resolve({
              success: false,
              error: new Error('Claude Code did not receive the question properly. Output: ' + output)
            });
          } else {
            resolve({ 
              success: true, 
              data: output || 'Claude Code executed successfully but produced no output'
            });
          }
        } else {
          resolve({
            success: false,
            error: new Error(`Claude Code exited with code ${code}${stderr ? ': ' + stderr : ''}`)
          });
        }
      });

      claudeProcess.on('error', (error) => {
        resolve({
          success: false,
          error: new Error(`Failed to execute Claude Code: ${error.message}`)
        });
      });

      // Set a timeout to prevent hanging
      setTimeout(() => {
        claudeProcess.kill('SIGKILL');
        resolve({
          success: false,
          error: new Error('Claude Code execution timed out after 120 seconds')
        });
      }, 120000);
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