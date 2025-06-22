/**
 * Claude Code Integration Utilities
 */

import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { GitInitResult, RepositoryManager } from '@/managers/RepositoryManager';
import { CacheManager } from '@/managers/CacheManager';
import { WorkspaceManager } from '@/managers/WorkspaceManager';
import { GitOperations } from '@/utils/gitOperations';
import { createGitLabAPI, GitLabAPI } from '@/utils/gitlabApi';
import type { FilePath, AsyncResult, Result, WorkspaceId, GitUrl } from '@/types/index';

export interface ClaudeCodeOptions {
  context?: string;
  workingDirectory: FilePath;
  workspaceId?: WorkspaceId;
  sourceBranch: string;
  enableAutoMR?: boolean;
  mrOptions?: {
    targetBranch?: string;
    assigneeId?: number;
    labels?: string[];
    removeSourceBranch?: boolean;
    squash?: boolean;
    taskId?: string;
  };
}

// Create manager instances for git workflow initialization
const cacheManager = new CacheManager({
  expiryDays: 7,
  maxCacheSize: 1000000,
  includePatterns: ['**/*'],
  excludePatterns: ['node_modules/**', '.git/**', '*.log', '.env*']
});
const workspaceManager = new WorkspaceManager();
const repositoryManager = new RepositoryManager(cacheManager, workspaceManager);

/**
 * Initialize git workflow for a workspace
 */
export async function initializeGitWorkflow(workspaceId: WorkspaceId, sourceBranch: string, taskId: string): Promise<AsyncResult<GitInitResult>> {
  try {
    // Initialize workspace manager and repository manager
    await workspaceManager.initialize();
    await repositoryManager.loadAllWorkspacesFromStorage();

    // Initialize git workflow
    console.log('[GIT WORKFLOW] Initializing git workflow for workspace:', workspaceId);
    return await repositoryManager.initializeGitWorkflow(workspaceId, sourceBranch, taskId);
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to initialize git workflow: ${error}`)
    };
  }
}

/**
 * Check if Claude Code is available in the system
 */
export async function checkClaudeCodeAvailability(): Promise<AsyncResult<boolean>> {
  const startTime = Date.now();
  console.log(`[AVAILABILITY CHECK] Starting Claude Code availability check at ${new Date().toISOString()}`);
  
  // First, try a quick command existence check
  try {
    console.log(`[AVAILABILITY CHECK] Phase 1: Checking if 'claude' command exists...`);
    const whichResult = await checkCommandExists('claude');
    if (!whichResult) {
      console.log(`[AVAILABILITY CHECK] ❌ 'claude' command not found in PATH`);
      return {
        success: true,
        data: false
      };
    }
    console.log(`[AVAILABILITY CHECK] ✅ 'claude' command found in PATH`);
  } catch (error) {
    console.log(`[AVAILABILITY CHECK] ⚠️ Command existence check failed, proceeding with version check...`);
  }

  // Use a more aggressive timeout with AbortController for better control
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.error(`[AVAILABILITY CHECK] ⏰ FORCE TIMEOUT after 5000ms - aborting...`);
    controller.abort();
  }, 5000); // Reduced timeout to 5 seconds

  try {
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
          data: false
        });
      });

      // Phase 2: Try version command with better error handling
      console.log(`[AVAILABILITY CHECK] Phase 2: Testing 'claude --version' command...`);
      const spawnStart = Date.now();
      
      const testProcess = spawn('claude', ['--version'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
        signal: controller.signal,
        timeout: 5000 // Built-in timeout as backup
      });

      console.log(`[AVAILABILITY CHECK] Process spawned in ${Date.now() - spawnStart}ms, PID: ${testProcess.pid || 'unknown'}`);

      // Handle immediate spawn errors (command not found, etc.)
      let spawnErrorHandled = false;
      testProcess.on('spawn', () => {
        console.log(`[AVAILABILITY CHECK] ✅ Process spawned successfully`);
      });

      testProcess.stdout?.on('data', (data) => {
        const chunk = data.toString();
        output += chunk;
        stdoutChunks++;
        console.log(`[AVAILABILITY CHECK] stdout chunk ${stdoutChunks} (${chunk.length} chars, total: ${output.length})`);
        
        if (stdoutChunks <= 2) {
          const preview = chunk.length > 100 ? chunk.substring(0, 100) + '...' : chunk;
          console.log(`[AVAILABILITY CHECK] stdout preview:`, preview.replace(/\n/g, '\\n'));
        }
      });

      testProcess.stderr?.on('data', (data) => {
        const chunk = data.toString();
        output += chunk;
        stderrChunks++;
        console.log(`[AVAILABILITY CHECK] stderr chunk ${stderrChunks} (${chunk.length} chars, total: ${output.length})`);
        
        const preview = chunk.length > 100 ? chunk.substring(0, 100) + '...' : chunk;
        console.log(`[AVAILABILITY CHECK] stderr content:`, preview.replace(/\n/g, '\\n'));
        
        // Check for common error patterns
        if (chunk.includes('command not found') || chunk.includes('not recognized')) {
          console.log(`[AVAILABILITY CHECK] ❌ Command not found error detected`);
          spawnErrorHandled = true;
          safeResolve({
            success: true,
            data: false
          });
        }
      });

      testProcess.on('close', (code, signal) => {
        if (spawnErrorHandled) return; // Already handled
        
        const executionTime = Date.now() - startTime;
        console.log(`[AVAILABILITY CHECK] Process closed after ${executionTime}ms with code: ${code}, signal: ${signal}`);
        console.log(`[AVAILABILITY CHECK] Final output length: ${output.length}, stdout chunks: ${stdoutChunks}, stderr chunks: ${stderrChunks}`);
        
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
          console.log(`[AVAILABILITY CHECK] ❌ Unexpected exit - code: ${code}, output length: ${output.length}`);
        }
        
        console.log(`[AVAILABILITY CHECK] Availability analysis:`, {
          exitCode: code,
          signal,
          hasOutput: output.length > 0,
          isAvailable
        });
        
        safeResolve({
          success: true,
          data: isAvailable
        });
      });

      testProcess.on('error', (error) => {
        if (spawnErrorHandled) return; // Already handled
        
        const executionTime = Date.now() - startTime;
        console.log(`[AVAILABILITY CHECK] Process error after ${executionTime}ms:`, {
          message: error.message,
          name: error.name,
          code: (error as any).code,
          errno: (error as any).errno,
          syscall: (error as any).syscall
        });
        
        // Handle specific error codes
        if ((error as any).code === 'ENOENT') {
          console.log(`[AVAILABILITY CHECK] ❌ Command not found (ENOENT)`);
        }
        
        safeResolve({
          success: true,
          data: false
        });
      });

      // Set up progressive timeout warnings with shorter intervals
      const timeoutWarnings = [
        { time: 1000, message: '1s warning - process still running' },
        { time: 3000, message: '3s warning - approaching timeout' },
        { time: 4500, message: '4.5s warning - will timeout soon' }
      ];

      timeoutWarnings.forEach(warning => {
        setTimeout(() => {
          if (!resolved && !testProcess.killed) {
            console.warn(`[AVAILABILITY CHECK] ⚠️ ${warning.message} (stdout: ${stdoutChunks}, stderr: ${stderrChunks})`);
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
      data: false
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
      shell: true
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

// Removed grantClaudeCodePermissions function - no longer needed
// We now use --dangerously-skip-permissions flag only when needed for edit requests

/**
 * Detect if a question involves editing operations
 */
function isEditRequest(question: string): boolean {
  const editKeywords = [
    'dev-test', 'dev-test mode', 'development mode'
  ];
  
  const questionLower = question.toLowerCase();
  return editKeywords.some(keyword => questionLower.includes(keyword));
}

export interface ClaudeCodeResult {
  output: string;
  gitInitResult?: GitInitResult;
}

/**
 * Execute Claude Code ask command and capture output
 */
export async function askClaudeCode(
  question: string,
  options: ClaudeCodeOptions,
): Promise<AsyncResult<ClaudeCodeResult>> {
  const startTime = Date.now();
  console.log(`[CLAUDE CODE] Starting execution at ${new Date().toISOString()}`);
  console.log(`[CLAUDE CODE] Parameters:`, {
    questionLength: question.length,
    workingDirectory: options.workingDirectory,
    contextLength: options.context?.length || 0,
    sourceBranch: options.sourceBranch,
    workspaceId: options.workspaceId
  });

  try {
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
        error: new Error(`Working directory does not exist: ${options.workingDirectory}`)
      };
    }

    // Check if this is an edit request that needs permissions
    const needsPermissions = isEditRequest(question);
    console.log(`[CLAUDE CODE] Request type analysis:`, {
      isEditRequest: isEditRequest(question),
      needsPermissions
    });
    
    // Initialize git workflow for edit operations
    let gitInitResult: GitInitResult | undefined;
    if (needsPermissions && options.workspaceId) {
      console.log(`[CLAUDE CODE] 🔄 Initializing git workflow for edit request...`);
      const gitInitStart = Date.now();
      
      const result = await initializeGitWorkflow(options.workspaceId, options.sourceBranch, options.mrOptions?.taskId || '');
      const gitInitTime = Date.now() - gitInitStart;
      
      if (!result.success) {
        console.warn(`[CLAUDE CODE] ⚠️ Git workflow initialization failed in ${gitInitTime}ms:`, result.error?.message);
        // Don't fail the request, just warn - Claude Code might still work
      } else {
        console.log(`[CLAUDE CODE] ✅ Git workflow initialized successfully in ${gitInitTime}ms`);
        gitInitResult = result.data;
      }
    }
    
    // Build command with enhanced monitoring flags
    const baseCommand = 'claude --verbose';
    const skipPermissionsFlag = needsPermissions ? ' --dangerously-skip-permissions' : '';
    const outputFormatFlag = ' --output-format stream-json';
    
    // Build the full input that will be sent
    let fullInput = question;
    
    if (options.context) {
      fullInput += `\n\nContext: ${options.context}`;
    }
    
    if (needsPermissions) {
      fullInput += '\n\nIMPORTANT: Only work within the current workspace directory. Do not access files outside this workspace.';
    }
    
    // Use -p flag to pass the question directly with JSON streaming
    const command = `${baseCommand}${skipPermissionsFlag} -p "${fullInput.replace(/"/g, '\\"')}"${outputFormatFlag}`;
    
    // Activity-based timeout instead of fixed duration
    const maxInactivityTime = 120000; // 2 minutes of inactivity before timeout
    const activityCheckInterval = 30000; // Check activity every 30 seconds
    
    console.log(`[CLAUDE CODE] 🚀 Executing: ${command}`);
    console.log(`[CLAUDE CODE] Input: ${fullInput.length} chars, ${needsPermissions ? 'edit' : 'read-only'} mode, activity-based timeout`);
    
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

      console.log(`[CLAUDE CODE] 🎬 Spawning Claude process...`);
      const spawnStart = Date.now();

      const claudeProcess = spawn(command, {
        cwd: options.workingDirectory,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
        env: {
          ...process.env,
          // Ensure non-interactive environment variables for automation
          TERM: 'dumb',
          NO_COLOR: '1'
        }
      });

      console.log(`[CLAUDE CODE] ✅ Process spawned in ${Date.now() - spawnStart}ms, PID: ${claudeProcess.pid}`);

      // Remove complex activity monitoring - Claude CLI handles completion naturally

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
              const toolUse = message.content.find((c: any) => c.type === 'tool_use');
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
          
        } catch (error) {
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
          if (gitInitResult) {
            result.gitInitResult = gitInitResult;
            console.log(`[CLAUDE CODE] ✅ Including git init result in response`);
          }
          
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
          code: (error as any).code,
          errno: (error as any).errno,
          syscall: (error as any).syscall
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

export interface PostExecutionResult {
  hasChanges: boolean;
  commitHash?: string;
  mergeRequestUrl?: string;
  pushedBranch?: string;
}

/**
 * Handle post-Claude Code execution git operations
 * This function runs after Claude Code completes and handles:
 * - Checking for changes
 * - Committing changes
 * - Creating merge requests or pushing changes
 */
export async function handlePostClaudeCodeExecution(
  workspacePath: FilePath,
  gitInitResult: GitInitResult,
  repoUrl?: GitUrl,
  commitMessage?: string
): Promise<AsyncResult<PostExecutionResult>> {
  try {
    const gitOps = new GitOperations(workspacePath);
    
    // Check if there are any changes to commit
    const changesResult = await gitOps.hasUncommittedChanges(workspacePath);
    if (!changesResult.success) {
      return {
        success: false,
        error: new Error(`Failed to check for changes: ${changesResult.error?.message}`)
      };
    }

    // If no changes, return early
    if (!changesResult.data) {
      return {
        success: true,
        data: {
          hasChanges: false
        }
      };
    }

    // Add all files to staging
    const addResult = await gitOps.addAllFiles(workspacePath);
    if (!addResult.success) {
      return {
        success: false,
        error: new Error(`Failed to add files: ${addResult.error?.message}`)
      };
    }

    // Commit changes
    const defaultCommitMessage = commitMessage || `Automated changes via Claude Code - ${new Date().toISOString()}`;
    const commitResult = await gitOps.commitChanges(workspacePath, defaultCommitMessage);
    if (!commitResult.success) {
      return {
        success: false,
        error: new Error(`Failed to commit changes: ${commitResult.error?.message}`)
      };
    }

    const result: PostExecutionResult = {
      hasChanges: true,
      commitHash: commitResult.data
    };

    // Handle merge request vs direct push
    if (gitInitResult.mergeRequestRequired) {
      // Push source branch to remote
      const pushResult = await gitOps.pushChanges(workspacePath, gitInitResult.sourceBranch);
      if (!pushResult.success) {
        return {
          success: false,
          error: new Error(`Failed to push changes: ${pushResult.error?.message}`)
        };
      }

      // Create merge request if GitLab API is available and repo URL is provided
      if (repoUrl) {
        const gitlabApi = await createGitLabAPI();
        if (gitlabApi) {
          const projectId = GitLabAPI.extractProjectIdFromUrl(repoUrl);
          if (projectId) {
            const mrResult = await gitlabApi.createMergeRequest({
              projectId,
              sourceBranch: gitInitResult.sourceBranch,
              targetBranch: gitInitResult.targetBranch,
              title: `Automated changes from Claude Code`,
              description: `This merge request contains automated changes made by Claude Code.\n\nCommit: ${commitResult.data}\nTimestamp: ${new Date().toISOString()}`
            });

            if (mrResult.success) {
              result.mergeRequestUrl = mrResult.data.webUrl;
              console.log('Merge request created successfully:', mrResult.data.webUrl);
            } else {
              console.warn('Failed to create merge request:', mrResult.error?.message);
            }
          } else {
            console.warn('Could not extract project ID from repository URL:', repoUrl);
          }
        } else {
          console.warn('GitLab API not configured - merge request creation skipped');
        }
      }
    } else {
      // Push directly to source branch (no merge request needed)
      const pushResult = await gitOps.pushChanges(workspacePath, gitInitResult.sourceBranch);
      if (!pushResult.success) {
        return {
          success: false,
          error: new Error(`Failed to push changes: ${pushResult.error?.message}`)
        };
      }

      result.pushedBranch = gitInitResult.sourceBranch;
    }

    return { success: true, data: result };

  } catch (error) {
    return {
      success: false,
      error: new Error(`Post-execution processing failed: ${error}`)
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