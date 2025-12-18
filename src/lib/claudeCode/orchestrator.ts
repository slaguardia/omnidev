'use server';

/**
 * Claude Code execution utilities
 */

import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { GitInitResult } from '@/lib/managers/repository-manager';
import { getRuntimeConfig } from '@/lib/workspace/runtime-config';
import type { AsyncResult } from '@/lib/types/index';
import type { ClaudeCodeOptions, ClaudeCodeResult } from '@/lib/claudeCode/types';

/**
 * Detect if a request involves editing operations.
 * Prefer explicit caller intent when provided; fall back to keyword heuristics.
 */
function inferEditRequest(explicit: boolean | undefined, question: string): boolean {
  if (typeof explicit === 'boolean') return explicit;
  const editKeywords = ['dev-test', 'dev-test mode', 'development mode'];
  const questionLower = question.toLowerCase();
  return editKeywords.some((keyword) => questionLower.includes(keyword));
}

/**
 * Execute Claude Code ask command and capture output
 */
export async function askClaudeCode(
  options: ClaudeCodeOptions
): Promise<AsyncResult<ClaudeCodeResult>> {
  const startTime = Date.now();
  const { question } = options;
  const authModeEnv = (process.env.CLAUDE_CODE_AUTH_MODE || '').toLowerCase();
  console.log(`[CLAUDE CODE] Starting execution at ${new Date().toISOString()}`);
  console.log(`[CLAUDE CODE] Parameters:`, {
    questionLength: question.length,
    workingDirectory: options.workingDirectory,
    contextLength: options.context?.length || 0,
    sourceBranch: options.sourceBranch,
    workspaceId: options.workspaceId,
    authModeEnv: authModeEnv || undefined,
  });

  try {
    // Get runtime configuration for API key
    console.log(`[CLAUDE CODE] Loading runtime configuration...`);
    const configStart = Date.now();
    const config = await getRuntimeConfig();
    console.log(`[CLAUDE CODE] ✅ Configuration loaded in ${Date.now() - configStart}ms`);
    const authMode = (authModeEnv || config.claude.authMode || 'auto').toLowerCase();
    const forceCliAuth = authMode === 'cli';
    console.log(`[CLAUDE CODE] 🔐 Claude auth mode: ${authMode}`);

    // Verify working directory exists
    console.log(`[CLAUDE CODE] Verifying working directory: ${options.workingDirectory}`);
    const dirCheckStart = Date.now();
    try {
      await access(options.workingDirectory);
      console.log(`[CLAUDE CODE] ✅ Working directory verified in ${Date.now() - dirCheckStart}ms`);
    } catch (error) {
      console.error(`[CLAUDE CODE] ❌ Working directory not accessible:`, error);
      return {
        success: false,
        error: new Error(`Working directory does not exist: ${options.workingDirectory}`),
      };
    }

    // Check if this is an edit request that needs permissions
    const needsPermissions = inferEditRequest(options.editRequest, question);
    console.log(`[CLAUDE CODE] Request type analysis:`, {
      isEditRequest: needsPermissions,
      needsPermissions,
    });

    // NOTE: Git workflow initialization is intentionally handled by the caller (API/worker)
    // so that "before/after" behavior is consistent for immediate vs queued execution.
    const gitInitResult: GitInitResult | undefined = undefined;

    // Build command with sandboxed wrapper
    // Claude Code always runs through the sandbox wrapper to prevent git operations.
    // Use bash invocation for cross-platform reliability (Windows bind mounts may not preserve +x).
    const wrapperPath = process.env.CLAUDE_CODE_WRAPPER || '/usr/local/bin/claude-code-wrapper';
    const wrapperCommand =
      wrapperPath.endsWith('.sh') || wrapperPath.includes('claude-code-wrapper')
        ? `bash ${wrapperPath}`
        : wrapperPath;

    const skipPermissionsFlag = needsPermissions ? ' --dangerously-skip-permissions' : '';
    const outputFormatFlag = ' --output-format stream-json';

    // Build the full input that will be sent
    let fullInput = question;

    if (options.context) {
      fullInput += `\n\nContext: ${options.context}`;
    }

    if (needsPermissions) {
      fullInput +=
        '\n\nIMPORTANT: Only work within the current workspace directory. Do not access files outside this workspace.';
    }

    // Use -p flag to pass the question directly with JSON streaming
    // Note: --verbose is required when using --output-format stream-json with -p
    const command = `${wrapperCommand} ${options.workingDirectory} --verbose${skipPermissionsFlag} -p "${fullInput.replace(/"/g, '\\"')}"${outputFormatFlag}`;

    // Activity-based timeout instead of fixed duration
    const maxInactivityTime = 300000; // 5 minutes of inactivity before timeout
    const activityCheckInterval = 30000; // Check activity every 30 seconds

    console.log(`[CLAUDE CODE] 🔒 Sandbox mode: ENABLED (always)`);

    console.log(`[CLAUDE CODE] 🚀 Executing: ${command}`);
    console.log(
      `[CLAUDE CODE] Input: ${fullInput.length} chars, ${needsPermissions ? 'edit' : 'read-only'} mode, activity-based timeout`
    );

    if (fullInput.length > 200) {
      console.log(`[CLAUDE CODE] Input preview: ${fullInput.substring(0, 200)}...`);
    } else {
      console.log(`[CLAUDE CODE] Input: ${fullInput}`);
    }

    // Execute Claude Code and capture output
    return new Promise((resolve) => {
      let actualOutput = '';
      let rawStdout = '';
      let stderr = '';
      let stdoutChunks = 0;
      let stderrChunks = 0;
      let jsonLogCount = 0;
      let lastActivityTime = Date.now();
      let hasReceivedOutput = false;
      const jsonLogs: Array<{ type: string; [key: string]: unknown }> = [];
      let finalResultSubtype: string | null = null;
      let finalResultDurationMs: number | null = null;
      let sawSuccessResult = false;

      console.log(`[CLAUDE CODE] 🎬 Spawning Claude process...`);
      const spawnStart = Date.now();

      const childEnv: NodeJS.ProcessEnv = {
        ...process.env,
        // Ensure non-interactive environment variables for automation
        TERM: 'dumb',
        NO_COLOR: '1',
      };

      if (forceCliAuth) {
        // Subscription/manual-login mode: do NOT pass API key to subprocess even if present.
        delete childEnv.ANTHROPIC_API_KEY;
      } else {
        // Use API key from runtime configuration if available, otherwise fall back to environment.
        childEnv.ANTHROPIC_API_KEY = config.claude.apiKey || process.env.ANTHROPIC_API_KEY;
      }

      const claudeProcess = spawn(command, {
        cwd: process.cwd(), // Wrapper handles cd to workspace directory
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
        env: childEnv,
      });

      // Log which API key source is being used
      if (forceCliAuth) {
        console.log(
          `[CLAUDE CODE] 🔐 Auth mode 'cli': not passing ANTHROPIC_API_KEY to subprocess (expects manual 'claude' login)`
        );
      } else if (config.claude.apiKey) {
        console.log(`[CLAUDE CODE] ✅ Using API key from runtime configuration`);
      } else if (process.env.ANTHROPIC_API_KEY) {
        console.log(`[CLAUDE CODE] ✅ Using API key from environment variables`);
      } else {
        console.warn(`[CLAUDE CODE] ⚠️ No API key found in configuration or environment`);
      }

      console.log(
        `[CLAUDE CODE] ✅ Process spawned in ${Date.now() - spawnStart}ms, PID: ${claudeProcess.pid}`
      );

      // Using -p flag, so no stdin input needed
      console.log(`[CLAUDE CODE] ✅ Using -p flag - no stdin input required`);
      console.log(`[CLAUDE CODE] 🎯 Waiting for Claude Code to process the question...`);

      /**
       * Activity tracking helper functions
       */
      function resetActivityTimer() {
        lastActivityTime = Date.now();
        if (!hasReceivedOutput) {
          hasReceivedOutput = true;
          console.log(`[CLAUDE CODE] 🎉 First output received after ${Date.now() - startTime}ms`);
        }
      }

      function handleJsonLog(jsonStr: string) {
        try {
          const parsed = JSON.parse(jsonStr) as unknown;
          if (typeof parsed !== 'object' || parsed === null) {
            return;
          }
          const log = parsed as Record<string, unknown>;
          const logType = typeof log.type === 'string' ? log.type : 'unknown';
          jsonLogCount++;
          resetActivityTimer();

          // Store all JSON logs for history
          jsonLogs.push({ ...log, type: logType });

          // Check for final result message
          if (logType === 'result') {
            const subtype = typeof log.subtype === 'string' ? log.subtype : null;
            finalResultSubtype = subtype;
            finalResultDurationMs = typeof log.duration_ms === 'number' ? log.duration_ms : null;
            sawSuccessResult = subtype === 'success';
            console.log(
              `[CLAUDE CODE] 🏁 Final result received (${subtype ?? 'unknown'}, ${finalResultDurationMs ?? 'unknown'}ms)`
            );
            if (typeof log.result === 'string') {
              actualOutput = log.result; // Use the final result as the actual output
              console.log(`[CLAUDE CODE] ✅ Extracted final result (${log.result.length} chars)`);
            }
            return;
          }

          // Progress indicators based on JSON log content
          if (logType === 'assistant' && log.message && typeof log.message === 'object') {
            const message = log.message as Record<string, unknown>;
            const content = message.content;
            if (Array.isArray(content)) {
              const toolUse = content.find((c) => {
                if (typeof c !== 'object' || c === null) return false;
                const entry = c as Record<string, unknown>;
                return entry.type === 'tool_use';
              }) as Record<string, unknown> | undefined;
              if (toolUse && typeof toolUse.name === 'string') {
                console.log(`[CLAUDE CODE] 🔧 Claude is using tool: ${toolUse.name}`);
              }
            }

            if (typeof message.stop_reason === 'string') {
              console.log(
                `[CLAUDE CODE] 📝 Claude completed step (reason: ${message.stop_reason})`
              );
            }
          }

          // Generic activity indicator for non-result messages
          if (logType !== 'result') {
            console.log(`[CLAUDE CODE] 📊 JSON log ${jsonLogCount}: ${logType || 'activity'}`);
          }
        } catch {
          // JSON parsing failed - log for debugging but don't add to output
          console.log(`[CLAUDE CODE] ⚠️ Failed to parse JSON: ${jsonStr.substring(0, 100)}...`);
        }
      }

      // Buffer for incomplete lines across chunks
      let lineBuffer = '';

      // Capture stdout with JSON parsing
      claudeProcess.stdout?.on('data', (data) => {
        const chunk = data.toString();
        rawStdout += chunk;
        stdoutChunks++;
        resetActivityTimer();

        console.log(
          `[CLAUDE CODE] 📥 stdout chunk ${stdoutChunks} (${chunk.length} chars, total: ${rawStdout.length})`
        );

        // Add chunk to buffer and process complete lines
        lineBuffer += chunk;
        const lines = lineBuffer.split('\n');

        // Keep the last incomplete line in the buffer
        lineBuffer = lines.pop() || '';

        // Process complete lines
        lines.forEach((line: string) => {
          const trimmedLine = line.trim();
          if (!trimmedLine) return;

          // Skip wrapper log lines - they're just debug output
          if (trimmedLine.startsWith('[CLAUDE-WRAPPER]')) {
            console.log(`[CLAUDE CODE] 🔧 Wrapper: ${trimmedLine}`);
            return;
          }

          // Try to parse as JSON log
          if (trimmedLine.startsWith('{')) {
            handleJsonLog(trimmedLine);
          }
          // Non-JSON, non-wrapper lines are ignored (Claude uses JSON streaming)
        });

        // Log first few chunks more verbosely for debugging
        if (stdoutChunks <= 3) {
          const preview = chunk.length > 100 ? chunk.substring(0, 100) + '...' : chunk;
          console.log(`[CLAUDE CODE] stdout preview:`, preview.replace(/\n/g, '\\n'));
        }
      });

      // Capture stderr
      claudeProcess.stderr?.on('data', (data) => {
        const chunk = data.toString();
        stderr += chunk;
        stderrChunks++;
        resetActivityTimer();

        console.log(
          `[CLAUDE CODE] ⚠️ stderr chunk ${stderrChunks} (${chunk.length} chars, total: ${stderr.length})`
        );

        // Always log stderr content as it might contain important error info
        const preview = chunk.length > 200 ? chunk.substring(0, 200) + '...' : chunk;
        console.log(`[CLAUDE CODE] stderr content:`, preview.replace(/\n/g, '\\n'));
      });

      claudeProcess.on('close', (code) => {
        const executionTime = Date.now() - startTime;

        // Process any remaining content in the line buffer
        if (lineBuffer.trim()) {
          const trimmedLine = lineBuffer.trim();
          if (trimmedLine.startsWith('{')) {
            handleJsonLog(trimmedLine);
          }
        }

        console.log(
          `[CLAUDE CODE] 🏁 Process closed after ${executionTime}ms (${(executionTime / 1000).toFixed(2)}s)`
        );
        console.log(`[CLAUDE CODE] Exit details:`, {
          code,
          actualOutputLength: actualOutput.length,
          rawStdoutLength: rawStdout.length,
          stderrLength: stderr.length,
          stdoutChunks,
          stderrChunks,
          jsonLogCount,
          hasReceivedOutput,
          executionTime,
        });

        const trustSuccessResult = sawSuccessResult && actualOutput.trim().length > 0;
        const exitCodeOk = code === 0 || trustSuccessResult;

        if (exitCodeOk) {
          if (code !== 0 && trustSuccessResult) {
            console.warn(
              `[CLAUDE CODE] ⚠️ Non-zero exit code (${code}) but received successful result payload; treating as success`
            );
          }
          const output = actualOutput.trim() || rawStdout.trim() || stderr.trim();
          console.log(`[CLAUDE CODE] ✅ Successful execution, processing output...`);

          // Log output summary
          if (output) {
            const isFromResult = actualOutput.trim().length > 0;
            const preview = output.length > 300 ? output.substring(0, 300) + '...' : output;
            console.log(
              `[CLAUDE CODE] ${isFromResult ? '🎯' : '📄'} Output ${isFromResult ? '(from result)' : '(fallback)'} (${output.length} chars):`,
              preview
            );
          } else {
            console.log(`[CLAUDE CODE] ⚠️ No output received`);
          }

          // Process completed successfully - trust the exit code
          const result: ClaudeCodeResult = {
            output: output || 'Claude Code executed successfully but produced no output',
            jsonLogs: jsonLogs,
            rawOutput: rawStdout,
          };
          if (gitInitResult) {
            result.gitInitResult = gitInitResult;
            console.log(`[CLAUDE CODE] ✅ Including git init result in response`);
          }
          console.log(`[CLAUDE CODE] ✅ Including ${jsonLogs.length} JSON logs in response`);

          console.log(
            `[CLAUDE CODE] 🎯 Execution completed successfully in ${executionTime}ms with ${jsonLogCount} JSON logs`
          );
          resolve({
            success: true,
            data: result,
          });
        } else {
          console.error(`[CLAUDE CODE] ❌ Process failed with exit code ${code}`);
          if (stderr) {
            console.error(`[CLAUDE CODE] Error details:`, stderr.substring(0, 500));
          }

          resolve({
            success: false,
            error: new Error(
              `Claude Code exited with code ${code}${finalResultSubtype ? ` (result subtype: ${finalResultSubtype})` : ''}${stderr ? ': ' + stderr.substring(0, 500) : ''}`
            ),
          });
        }
      });

      claudeProcess.on('error', (error) => {
        const executionTime = Date.now() - startTime;

        console.error(`[CLAUDE CODE] ❌ Process error after ${executionTime}ms:`, {
          error: error.message,
          name: error.name,
          code: (error as { code?: string }).code,
          errno: (error as { errno?: number }).errno,
          syscall: (error as { syscall?: string }).syscall,
        });

        resolve({
          success: false,
          error: new Error(`Failed to execute Claude Code: ${error.message}`),
        });
      });

      // Activity-based timeout management
      const activityCheckHandle = setInterval(() => {
        const inactiveTime = Date.now() - lastActivityTime;

        if (inactiveTime > maxInactivityTime) {
          clearInterval(activityCheckHandle);

          if (!hasReceivedOutput) {
            console.error(
              `[CLAUDE CODE] ⏰ No output received after ${inactiveTime / 1000}s - process likely stuck`
            );
          } else {
            console.error(
              `[CLAUDE CODE] ⏰ No activity for ${inactiveTime / 1000}s - killing process`
            );
          }

          claudeProcess.kill('SIGKILL');

          resolve({
            success: false,
            error: new Error(
              `Claude Code execution timed out due to inactivity (${inactiveTime / 1000}s)`
            ),
          });
        } else {
          console.log(
            `[CLAUDE CODE] ⏳ Activity check: last activity ${(inactiveTime / 1000).toFixed(1)}s ago`
          );
        }
      }, activityCheckInterval);

      // Clear activity monitor when process completes naturally
      claudeProcess.on('close', () => {
        clearInterval(activityCheckHandle);
      });
    });
  } catch (error) {
    const executionTime = Date.now() - startTime;
    console.error(`[CLAUDE CODE] ❌ Integration error after ${executionTime}ms:`, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return {
      success: false,
      error: new Error(`Claude Code integration error: ${error}`),
    };
  }
}
