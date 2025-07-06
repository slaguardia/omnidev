'use server';

/**
 * Claude Code execution utilities
 */

import { spawn } from 'node:child_process';
import type { AsyncResult } from '@/lib/common/types';
import type { ClaudeCodeOptions, ClaudeCodeResult } from '@/lib/claudeCode/types';
import { initializeClaudeCode } from './initialization';

/**
 * Execute Claude Code ask command and capture output
 */
export async function askClaudeCode(
  params: ClaudeCodeOptions,
): Promise<AsyncResult<ClaudeCodeResult>> {
  const startTime = Date.now();
  console.log(`[CLAUDE CODE] Starting execution at ${new Date().toISOString()}`);
  console.log(`[CLAUDE CODE] Parameters:`, {
    questionLength: params.question.length,
    workingDirectory: params.workingDirectory,
    contextLength: params.context?.length || 0,
    workspaceId: params.workspaceId
  });

  try {
    // Initialize Claude Code
    const initResult = await initializeClaudeCode(params);
    if (!initResult.success) {
      return {
        success: false,
        error: new Error(`Failed to initialize Claude Code: ${initResult.error?.message}`)
      };
    }
    const config = initResult.data?.config;

    // =================================================================================
    // Build command with enhanced monitoring flags
    // =================================================================================
    const baseCommand = 'claude --verbose';
    const skipPermissionsFlag = params.editRequest ? ' --dangerously-skip-permissions' : '';
    const outputFormatFlag = ' --output-format stream-json';
    
    // Build the full input that will be sent
    let fullInput = params.question;
    
    if (params.context) {
      fullInput += `\n\nContext: ${params.context}`;
    }
    
    if (params.editRequest) {
      fullInput += '\n\nIMPORTANT: Only work within the current workspace directory. Do not access files outside this workspace.';
    }
    
    // Use -p flag to pass the question directly with JSON streaming
    const command = `${baseCommand}${skipPermissionsFlag} -p "${fullInput.replace(/"/g, '\\"')}"${outputFormatFlag}`;
    
    // Activity-based timeout instead of fixed duration
    const maxInactivityTime = 300000; // 5 minutes of inactivity before timeout
    const activityCheckInterval = 30000; // Check activity every 30 seconds
    
    console.log(`[CLAUDE CODE] 🚀 Executing: ${command}`);
    console.log(`[CLAUDE CODE] Input: ${fullInput.length} chars, ${params.editRequest ? 'edit' : 'read-only'} mode, activity-based timeout`);
    
    if (fullInput.length > 200) {
      console.log(`[CLAUDE CODE] Input preview: ${fullInput.substring(0, 200)}...`);
    } else {
      console.log(`[CLAUDE CODE] Input: ${fullInput}`);
    }

    // =================================================================================
    // Execute Claude Code and capture output
    // =================================================================================
    return new Promise((resolve) => {
      let actualOutput = '';
      let rawStdout = '';
      let stderr = '';
      let stdoutChunks = 0;
      let stderrChunks = 0;
      let jsonLogCount = 0;
      let lastActivityTime = Date.now();
      let hasReceivedOutput = false;

      console.log(`[CLAUDE CODE] 🎬 Spawning Claude process...`);
      const spawnStart = Date.now();

      const claudeProcess = spawn(command, {
        cwd: params.workingDirectory,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
        env: {
          ...process.env,
          // Use API key from runtime configuration
          ANTHROPIC_API_KEY: config.claude.apiKey,
          // Ensure non-interactive environment variables for automation
          TERM: 'dumb',
          NO_COLOR: '1'
        }
      });

      console.log(`[CLAUDE CODE] ✅ Using API key from runtime configuration`);

      console.log(`[CLAUDE CODE] ✅ Process spawned in ${Date.now() - spawnStart}ms, PID: ${claudeProcess.pid}`);

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
          const log = JSON.parse(jsonStr);
          jsonLogCount++;
          resetActivityTimer();
          
          // Check for final result message
          if (log.type === 'result') {
            console.log(`[CLAUDE CODE] 🏁 Final result received (${log.subtype}, ${log.duration_ms}ms)`);
            if (log.result) {
              actualOutput = log.result; // Use the final result as the actual output
              console.log(`[CLAUDE CODE] ✅ Extracted final result (${log.result.length} chars)`);
            }
            return;
          }
          
          // Progress indicators based on JSON log content
          if (log.type === 'assistant' && log.message) {
            const message = log.message;
            if (message.content && Array.isArray(message.content)) {
              const toolUse = message.content.find((c: { type: string; name?: string }) => c.type === 'tool_use');
              if (toolUse) {
                console.log(`[CLAUDE CODE] 🔧 Claude is using tool: ${toolUse.name}`);
              }
            }
            
            if (message.stop_reason) {
              console.log(`[CLAUDE CODE] 📝 Claude completed step (reason: ${message.stop_reason})`);
            }
          }
          
          // Generic activity indicator for non-result messages
          if (log.type !== 'result') {
            console.log(`[CLAUDE CODE] 📊 JSON log ${jsonLogCount}: ${log.type || 'activity'}`);
          }
          
        } catch {
          // Not valid JSON, treat as actual output (fallback for non-JSON output)
          actualOutput += jsonStr + '\n';
        }
      }

      // Capture stdout with JSON parsing
      claudeProcess.stdout?.on('data', (data) => {
        const chunk = data.toString();
        rawStdout += chunk;
        stdoutChunks++;
        resetActivityTimer();
        
        console.log(`[CLAUDE CODE] 📥 stdout chunk ${stdoutChunks} (${chunk.length} chars, total: ${rawStdout.length})`);
        
        // Split chunk into lines and process each as potential JSON
        const lines = chunk.split('\n');
        lines.forEach((line: string, index: number) => {
          const trimmedLine = line.trim();
          if (trimmedLine) {
            // Try to parse as JSON log first
            if (trimmedLine.startsWith('{') && trimmedLine.endsWith('}')) {
              handleJsonLog(trimmedLine);
            } else {
              // Not JSON, treat as actual response content
              actualOutput += line;
              if (index < lines.length - 1) actualOutput += '\n';
            }
          }
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
        
        console.log(`[CLAUDE CODE] ⚠️ stderr chunk ${stderrChunks} (${chunk.length} chars, total: ${stderr.length})`);
        
        // Always log stderr content as it might contain important error info
        const preview = chunk.length > 200 ? chunk.substring(0, 200) + '...' : chunk;
        console.log(`[CLAUDE CODE] stderr content:`, preview.replace(/\n/g, '\\n'));
      });

      claudeProcess.on('close', (code) => {
        const executionTime = Date.now() - startTime;
        
        console.log(`[CLAUDE CODE] 🏁 Process closed after ${executionTime}ms (${(executionTime/1000).toFixed(2)}s)`);
        console.log(`[CLAUDE CODE] Exit details:`, {
          code,
          actualOutputLength: actualOutput.length,
          rawStdoutLength: rawStdout.length,
          stderrLength: stderr.length,
          stdoutChunks,
          stderrChunks,
          jsonLogCount,
          hasReceivedOutput,
          executionTime
        });
        
        if (code === 0) {
          const output = actualOutput.trim() || rawStdout.trim() || stderr.trim();
          console.log(`[CLAUDE CODE] ✅ Successful execution, processing output...`);
          
          // Log output summary
          if (output) {
            const isFromResult = actualOutput.trim().length > 0;
            const preview = output.length > 300 ? output.substring(0, 300) + '...' : output;
            console.log(`[CLAUDE CODE] ${isFromResult ? '🎯' : '📄'} Output ${isFromResult ? '(from result)' : '(fallback)'} (${output.length} chars):`, preview);
          } else {
            console.log(`[CLAUDE CODE] ⚠️ No output received`);
          }
          
          // Process completed successfully - trust the exit code
          const result: ClaudeCodeResult = {
            output: output || 'Claude Code executed successfully but produced no output'
          };
          
          console.log(`[CLAUDE CODE] 🎯 Execution completed successfully in ${executionTime}ms with ${jsonLogCount} JSON logs`);
          resolve({ 
            success: true, 
            data: result
          });
        } else {
          console.error(`[CLAUDE CODE] ❌ Process failed with exit code ${code}`);
          if (stderr) {
            console.error(`[CLAUDE CODE] Error details:`, stderr.substring(0, 500));
          }
          
          resolve({
            success: false,
            error: new Error(`Claude Code exited with code ${code}${stderr ? ': ' + stderr.substring(0, 500) : ''}`)
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
          syscall: (error as { syscall?: string }).syscall
        });
        
        resolve({
          success: false,
          error: new Error(`Failed to execute Claude Code: ${error.message}`)
        });
      });

      // Activity-based timeout management
      const activityCheckHandle = setInterval(() => {
        const inactiveTime = Date.now() - lastActivityTime;
        
        if (inactiveTime > maxInactivityTime) {
          clearInterval(activityCheckHandle);
          
          if (!hasReceivedOutput) {
            console.error(`[CLAUDE CODE] ⏰ No output received after ${inactiveTime/1000}s - process likely stuck`);
          } else {
            console.error(`[CLAUDE CODE] ⏰ No activity for ${inactiveTime/1000}s - killing process`);
          }
          
          claudeProcess.kill('SIGKILL');
          
          resolve({
            success: false,
            error: new Error(`Claude Code execution timed out due to inactivity (${inactiveTime/1000}s)`)
          });
        } else {
          console.log(`[CLAUDE CODE] ⏳ Activity check: last activity ${(inactiveTime/1000).toFixed(1)}s ago`);
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
      stack: error instanceof Error ? error.stack : undefined
    });
    
    return {
      success: false,
      error: new Error(`Claude Code integration error: ${error}`)
    };
  }
} 