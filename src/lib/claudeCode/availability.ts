'use server';

/**
 * Claude Code availability checking utilities
 */

import { spawn } from 'node:child_process';
import { getRuntimeConfig } from '@/lib/workspace/runtime-config';
import type { AsyncResult, Result } from '@/lib/types/index';

/**
 * Check if Claude Code is available in the system
 */
export async function checkClaudeCodeAvailability(): Promise<AsyncResult<boolean>> {
  const startTime = Date.now();
  console.log(
    `[AVAILABILITY CHECK] Starting Claude Code availability check at ${new Date().toISOString()}`
  );

  // First, try a quick command existence check
  try {
    console.log(`[AVAILABILITY CHECK] Phase 1: Checking if 'claude' command exists...`);
    const whichResult = await checkCommandExists('claude');
    if (!whichResult) {
      console.log(`[AVAILABILITY CHECK] ❌ 'claude' command not found in PATH`);
      return {
        success: true,
        data: false,
      };
    }
    console.log(`[AVAILABILITY CHECK] ✅ 'claude' command found in PATH`);
  } catch {
    console.log(
      `[AVAILABILITY CHECK] ⚠️ Command existence check failed, proceeding with version check...`
    );
  }

  // Use a more aggressive timeout with AbortController for better control
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.error(`[AVAILABILITY CHECK] ⏰ FORCE TIMEOUT after 5000ms - aborting...`);
    controller.abort();
  }, 5000); // Reduced timeout to 5 seconds

  try {
    // Get runtime configuration for API key outside the promise
    const config = await getRuntimeConfig();

    return await new Promise<Result<boolean>>((resolve) => {
      let resolved = false;
      let output = '';
      let stdoutChunks = 0;
      let stderrChunks = 0;

      const safeResolve = (result: Result<boolean>) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutId);
          const totalTime = Date.now() - startTime;
          console.log(`[AVAILABILITY CHECK] Resolving after ${totalTime}ms with result:`, result);
          resolve(result);
        }
      };

      // Handle abort signal
      controller.signal.addEventListener('abort', () => {
        console.log(`[AVAILABILITY CHECK] 🚫 Abort signal received`);
        if (testProcess && !testProcess.killed) {
          console.log(`[AVAILABILITY CHECK] 🔪 Force killing process due to abort...`);
          testProcess.kill('SIGKILL');
        }
        safeResolve({
          success: true,
          data: false,
        });
      });

      // Phase 2: Try version command with better error handling
      console.log(`[AVAILABILITY CHECK] Phase 2: Testing 'claude --version' command...`);

      const spawnStart = Date.now();

      const testProcess = spawn('claude', ['--version'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
        signal: controller.signal,
        timeout: 5000, // Built-in timeout as backup
        env: {
          ...process.env,
          // Use API key from runtime configuration if available
          ANTHROPIC_API_KEY: config.claude.apiKey || process.env.ANTHROPIC_API_KEY,
        },
      });

      console.log(
        `[AVAILABILITY CHECK] Process spawned in ${Date.now() - spawnStart}ms, PID: ${testProcess.pid || 'unknown'}`
      );

      // Handle immediate spawn errors (command not found, etc.)
      let spawnErrorHandled = false;
      testProcess.on('spawn', () => {
        console.log(`[AVAILABILITY CHECK] ✅ Process spawned successfully`);
      });

      testProcess.stdout?.on('data', (data) => {
        const chunk = data.toString();
        output += chunk;
        stdoutChunks++;
        console.log(
          `[AVAILABILITY CHECK] stdout chunk ${stdoutChunks} (${chunk.length} chars, total: ${output.length})`
        );

        if (stdoutChunks <= 2) {
          const preview = chunk.length > 100 ? chunk.substring(0, 100) + '...' : chunk;
          console.log(`[AVAILABILITY CHECK] stdout preview:`, preview.replace(/\n/g, '\\n'));
        }
      });

      testProcess.stderr?.on('data', (data) => {
        const chunk = data.toString();
        output += chunk;
        stderrChunks++;
        console.log(
          `[AVAILABILITY CHECK] stderr chunk ${stderrChunks} (${chunk.length} chars, total: ${output.length})`
        );

        const preview = chunk.length > 100 ? chunk.substring(0, 100) + '...' : chunk;
        console.log(`[AVAILABILITY CHECK] stderr content:`, preview.replace(/\n/g, '\\n'));

        // Check for common error patterns
        if (chunk.includes('command not found') || chunk.includes('not recognized')) {
          console.log(`[AVAILABILITY CHECK] ❌ Command not found error detected`);
          spawnErrorHandled = true;
          safeResolve({
            success: true,
            data: false,
          });
        }
      });

      testProcess.on('close', (code, signal) => {
        if (spawnErrorHandled) return; // Already handled

        const executionTime = Date.now() - startTime;
        console.log(
          `[AVAILABILITY CHECK] Process closed after ${executionTime}ms with code: ${code}, signal: ${signal}`
        );
        console.log(
          `[AVAILABILITY CHECK] Final output length: ${output.length}, stdout chunks: ${stdoutChunks}, stderr chunks: ${stderrChunks}`
        );

        if (output) {
          const preview = output.length > 200 ? output.substring(0, 200) + '...' : output;
          console.log(`[AVAILABILITY CHECK] Final output preview:`, preview);
        }

        // Determine availability based on exit code and output
        let isAvailable = false;

        if (code === 0 && output.length > 0) {
          isAvailable = true;
        } else if (code === 127) {
          // Command not found
          console.log(`[AVAILABILITY CHECK] ❌ Command not found (exit code 127)`);
        } else if (signal === 'SIGTERM' || signal === 'SIGKILL') {
          console.log(`[AVAILABILITY CHECK] ❌ Process killed by signal: ${signal}`);
        } else {
          console.log(
            `[AVAILABILITY CHECK] ❌ Unexpected exit - code: ${code}, output length: ${output.length}`
          );
        }

        console.log(`[AVAILABILITY CHECK] Availability analysis:`, {
          exitCode: code,
          signal,
          hasOutput: output.length > 0,
          isAvailable,
        });

        safeResolve({
          success: true,
          data: isAvailable,
        });
      });

      testProcess.on('error', (error) => {
        if (spawnErrorHandled) return; // Already handled

        const executionTime = Date.now() - startTime;
        console.log(`[AVAILABILITY CHECK] Process error after ${executionTime}ms:`, {
          message: error.message,
          name: error.name,
          code: (error as { code?: string }).code,
          errno: (error as { errno?: number }).errno,
          syscall: (error as { syscall?: string }).syscall,
        });

        // Handle specific error codes
        if ((error as { code?: string }).code === 'ENOENT') {
          console.log(`[AVAILABILITY CHECK] ❌ Command not found (ENOENT)`);
        }

        safeResolve({
          success: true,
          data: false,
        });
      });

      // Set up progressive timeout warnings with shorter intervals
      const timeoutWarnings = [
        { time: 1000, message: '1s warning - process still running' },
        { time: 3000, message: '3s warning - approaching timeout' },
        { time: 4500, message: '4.5s warning - will timeout soon' },
      ];

      timeoutWarnings.forEach((warning) => {
        setTimeout(() => {
          if (!resolved && !testProcess.killed) {
            console.warn(
              `[AVAILABILITY CHECK] ⚠️ ${warning.message} (stdout: ${stdoutChunks}, stderr: ${stderrChunks})`
            );
          }
        }, warning.time);
      });
    });
  } catch (error) {
    clearTimeout(timeoutId);
    const totalTime = Date.now() - startTime;
    console.error(`[AVAILABILITY CHECK] ❌ Exception after ${totalTime}ms:`, error);

    return {
      success: true,
      data: false,
    };
  }
}

/**
 * Helper function to check if a command exists in PATH
 */
async function checkCommandExists(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    const whichProcess = spawn(process.platform === 'win32' ? 'where' : 'which', [command], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });

    let hasOutput = false;

    whichProcess.stdout?.on('data', () => {
      hasOutput = true;
    });

    whichProcess.on('close', (code) => {
      resolve(code === 0 && hasOutput);
    });

    whichProcess.on('error', () => {
      resolve(false);
    });

    // Timeout after 2 seconds
    setTimeout(() => {
      if (!whichProcess.killed) {
        whichProcess.kill();
        resolve(false);
      }
    }, 2000);
  });
}
