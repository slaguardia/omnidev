/**
 * Job Handlers - Execution logic for each job type
 *
 * These handlers wrap existing functionality from the codebase
 * to be called by the queue worker.
 */

import {
  askClaudeCode,
  handlePostClaudeCodeExecution,
  initializeGitWorkflow,
} from '@/lib/claudeCode';
import type { GitInitResult } from '@/lib/managers/repository-manager';
import * as WorkspaceManagerFunctions from '@/lib/managers/workspace-manager';
import type {
  ClaudeCodeJobPayload,
  ClaudeCodeJobResult,
  ClaudeCodeUsage,
  ClaudeCodeJsonLog,
  GitPushJobPayload,
  GitMRJobPayload,
  WorkspaceCleanupJobPayload,
} from './types';
import type { CommitHash, FilePath, GitUrl } from '@/lib/types/index';

/**
 * Extract usage information from the final 'result' type JSON log.
 * The result log contains:
 * - total_cost_usd: total cost in USD
 * - usage: { input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens }
 */
function extractUsageFromJsonLogs(jsonLogs: ClaudeCodeJsonLog[]): ClaudeCodeUsage | undefined {
  // Find the final result log which contains aggregated usage
  const resultLog = jsonLogs.find((log) => log.type === 'result');
  if (!resultLog) {
    return undefined;
  }

  const usage = resultLog.usage as Record<string, unknown> | undefined;
  if (!usage) {
    return undefined;
  }

  const result: ClaudeCodeUsage = {
    inputTokens: (usage.input_tokens as number) || 0,
    outputTokens: (usage.output_tokens as number) || 0,
  };

  if (
    typeof usage.cache_creation_input_tokens === 'number' &&
    usage.cache_creation_input_tokens > 0
  ) {
    result.cacheCreationInputTokens = usage.cache_creation_input_tokens;
  }
  if (typeof usage.cache_read_input_tokens === 'number' && usage.cache_read_input_tokens > 0) {
    result.cacheReadInputTokens = usage.cache_read_input_tokens;
  }

  // Get total cost from the result log
  if (typeof resultLog.total_cost_usd === 'number') {
    result.costUsd = resultLog.total_cost_usd;
  }

  return result;
}

/**
 * Execute a Claude Code job
 */
export async function executeClaudeCodeJob(
  payload: ClaudeCodeJobPayload
): Promise<ClaudeCodeJobResult> {
  const startTime = Date.now();
  console.log(`[JOB] Starting Claude Code job for workspace ${payload.workspaceId}`);

  // For edit jobs, initialize git workflow inside the job so behavior is consistent
  // whether the API executed immediately or queued. This also ensures we can commit/push
  // changes to the selected branch even when no merge request is requested.
  let gitInitResult: GitInitResult | undefined;
  let effectiveSourceBranch = payload.sourceBranch;

  const isEditJob = payload.editRequest ?? false;

  // For non-edit (ask) jobs, switch to the default/target branch (unless a specific branch
  // is specified) and pull latest changes to ensure we're querying up-to-date code
  if (!isEditJob) {
    console.log(
      `[JOB] 🔄 Preparing workspace for ask job - switching to target branch and pulling latest...`
    );
    const prepStart = Date.now();

    try {
      const { switchBranch, pullChanges, loadAllWorkspacesFromStorage } = await import(
        '@/lib/managers/repository-manager'
      );
      const { loadWorkspace } = await import('@/lib/managers/workspace-manager');
      const { getAllRemoteBranches } = await import('@/lib/git/branches');

      // Ensure workspaces are loaded into memory
      await loadAllWorkspacesFromStorage();

      // Determine the target branch: use sourceBranch if specified, otherwise use workspace's target branch
      let targetBranch = payload.sourceBranch;
      if (!targetBranch) {
        const workspaceResult = await loadWorkspace(payload.workspaceId);
        if (workspaceResult.success && workspaceResult.data.targetBranch) {
          targetBranch = workspaceResult.data.targetBranch;
          console.log(`[JOB] 📌 Using workspace target branch: ${targetBranch}`);
        }
      }

      // Validate the branch exists before attempting to switch
      if (targetBranch) {
        console.log(`[JOB] 🔍 Validating branch exists: ${targetBranch}`);
        const branchesResult = await getAllRemoteBranches(payload.workspacePath as FilePath);

        if (branchesResult.success) {
          const availableBranches = branchesResult.data;
          const branchExists = availableBranches.some(
            (b) => b === targetBranch || b === `origin/${targetBranch}`
          );

          if (!branchExists) {
            const _prepTime = Date.now() - prepStart;
            console.error(
              `[JOB] ❌ Branch '${targetBranch}' does not exist. Available branches: ${availableBranches.slice(0, 10).join(', ')}${availableBranches.length > 10 ? '...' : ''}`
            );
            throw new Error(
              `Branch '${targetBranch}' does not exist in the repository. Available branches: ${availableBranches.slice(0, 5).join(', ')}${availableBranches.length > 5 ? ` and ${availableBranches.length - 5} more` : ''}`
            );
          }
          console.log(`[JOB] ✅ Branch '${targetBranch}' exists`);
        } else {
          console.warn(
            `[JOB] ⚠️ Could not validate branch existence:`,
            branchesResult.error?.message
          );
          // Continue anyway - switchBranch will fail if branch doesn't exist
        }

        // Switch to the target branch
        console.log(`[JOB] 📌 Switching to branch: ${targetBranch}`);
        const switchResult = await switchBranch(payload.workspaceId, targetBranch);
        if (!switchResult.success) {
          throw new Error(
            `Failed to switch to branch '${targetBranch}': ${switchResult.error?.message}`
          );
        }
      }

      // Pull latest changes using existing repository-manager function
      console.log(`[JOB] 🔄 Pulling latest changes...`);
      const pullResult = await pullChanges(payload.workspaceId);
      const prepTime = Date.now() - prepStart;

      if (!pullResult.success) {
        console.warn(
          `[JOB] ⚠️ Failed to pull latest changes in ${prepTime}ms:`,
          pullResult.error?.message
        );
        // Continue anyway - we'll work with whatever code is there
      } else {
        console.log(`[JOB] ✅ Workspace prepared in ${prepTime}ms`);
      }
    } catch (error) {
      const prepTime = Date.now() - prepStart;
      // Re-throw branch validation errors - these should fail the job
      if (
        error instanceof Error &&
        (error.message.includes('does not exist') || error.message.includes('Failed to switch'))
      ) {
        console.error(`[JOB] ❌ Branch error in ${prepTime}ms:`, error.message);
        throw error;
      }
      console.warn(`[JOB] ⚠️ Failed to prepare workspace in ${prepTime}ms:`, error);
      // Continue anyway for other errors - we'll work with whatever code is there
    }
  }

  if (isEditJob) {
    console.log(`[JOB] 🔄 Initializing git workflow for edit job...`);
    const gitInitStart = Date.now();

    const initResult = await initializeGitWorkflow({
      workspaceId: payload.workspaceId,
      ...(payload.sourceBranch ? { sourceBranch: payload.sourceBranch } : {}),
    });

    const gitInitTime = Date.now() - gitInitStart;

    if (!initResult.success) {
      const gitInitError = initResult.error?.message || 'Unknown git workflow error';
      console.error(
        `[JOB] ❌ Git workflow initialization failed in ${gitInitTime}ms:`,
        gitInitError
      );
      // Fail the job immediately - continuing without git automation would leave changes uncommitted
      throw new Error(
        `Git workflow initialization failed: ${gitInitError}. ` +
          `This prevents orphaned changes in the workspace.`
      );
    } else {
      // Only create merge requests when explicitly requested.
      // We still want commit+push behavior for edit jobs even when createMR=false.
      gitInitResult = {
        ...initResult.data,
        mergeRequestRequired: Boolean(payload.createMR) && initResult.data.mergeRequestRequired,
      };
      effectiveSourceBranch = initResult.data.sourceBranch;
      console.log(`[JOB] ✅ Git workflow initialized in ${gitInitTime}ms`, {
        mergeRequestRequired: gitInitResult.mergeRequestRequired,
        sourceBranch: initResult.data.sourceBranch,
        targetBranch: initResult.data.targetBranch,
      });
    }
  }

  // Build options, only including defined properties
  const options: Parameters<typeof askClaudeCode>[0] = {
    question: payload.question,
    workingDirectory: payload.workspacePath as FilePath,
    workspaceId: payload.workspaceId,
    editRequest: isEditJob,
  };

  if (payload.context) {
    options.context = payload.context;
  }

  if (effectiveSourceBranch) {
    options.sourceBranch = effectiveSourceBranch;
  }

  const result = await askClaudeCode(options);

  const executionTimeMs = Date.now() - startTime;

  if (!result.success) {
    throw new Error(result.error?.message || 'Claude Code execution failed');
  }

  console.log(`[JOB] Claude Code job completed in ${executionTimeMs}ms`);

  let postExecution: ClaudeCodeJobResult['postExecution'] | undefined;

  // Handle post-execution git operations if needed
  if (gitInitResult && payload.repoUrl) {
    console.log(`[JOB] Processing post-execution git operations...`);

    try {
      const postResult = await handlePostClaudeCodeExecution(
        payload.workspacePath as FilePath,
        gitInitResult,
        payload.repoUrl as GitUrl
      );

      if (postResult.success) {
        if (postResult.data) {
          const pe: NonNullable<ClaudeCodeJobResult['postExecution']> = {
            hasChanges: postResult.data.hasChanges,
          };
          if (postResult.data.commitHash) pe.commitHash = postResult.data.commitHash;
          if (postResult.data.mergeRequestUrl) pe.mergeRequestUrl = postResult.data.mergeRequestUrl;
          if (postResult.data.pushedBranch) pe.pushedBranch = postResult.data.pushedBranch;
          postExecution = pe;

          // After edit flow completes, always switch back to target branch and update
          // the workspace commitHash to reflect the target branch's HEAD, not the working branch
          try {
            const { updateWorkspace, switchBranch, pullChanges } = await import(
              '@/lib/managers/repository-manager'
            );
            const { getCurrentCommitHash } = await import('@/lib/git/commits');

            console.log(
              `[JOB] 🔄 Resetting workspace to target branch: ${gitInitResult.targetBranch}`
            );

            // Switch back to target branch
            const switchResult = await switchBranch(
              payload.workspaceId,
              gitInitResult.targetBranch
            );
            if (!switchResult.success) {
              console.warn(
                `[JOB] ⚠️ Failed to switch to target branch: ${switchResult.error?.message}`
              );
            } else {
              // Pull latest changes to ensure we have the most recent commit
              const pullResult = await pullChanges(payload.workspaceId);
              if (!pullResult.success) {
                console.warn(
                  `[JOB] ⚠️ Failed to pull latest changes: ${pullResult.error?.message}`
                );
              }
            }

            // Get the current commit hash from the target branch
            const commitHashResult = await getCurrentCommitHash(payload.workspacePath as FilePath);
            if (!commitHashResult.success) {
              console.warn(
                `[JOB] ⚠️ Failed to get commit hash: ${commitHashResult.error?.message}`
              );
            } else if (commitHashResult.data) {
              const targetBranchCommitHash = commitHashResult.data;

              const updateResult = await updateWorkspace(payload.workspaceId, {
                metadata: { commitHash: targetBranchCommitHash as CommitHash },
              });

              if (updateResult.success) {
                // Persist to disk
                await WorkspaceManagerFunctions.saveWorkspace(updateResult.data);
                console.log(
                  `[JOB] ✅ Workspace reset to ${gitInitResult.targetBranch}, commitHash: ${targetBranchCommitHash.substring(0, 7)}`
                );
              }
            }
          } catch (updateError) {
            console.warn(`[JOB] ⚠️ Failed to reset workspace to target branch:`, updateError);
            // Don't fail the job, just log the warning
          }
        } else {
          postExecution = undefined;
        }
        console.log(`[JOB] Post-execution completed:`, {
          hasChanges: postResult.data?.hasChanges,
          mergeRequestUrl: postResult.data?.mergeRequestUrl,
          pushedBranch: postResult.data?.pushedBranch,
        });
      } else {
        console.warn(`[JOB] Post-execution failed:`, postResult.error?.message);
      }
    } catch (error) {
      console.error(`[JOB] Post-execution error:`, error);
      // Don't fail the job, just log the error
    }
  }

  const jobResult: ClaudeCodeJobResult = {
    output: result.data?.output || '',
    executionTimeMs,
  };

  if (gitInitResult) {
    jobResult.gitInitResult = gitInitResult;
  }
  if (postExecution) {
    jobResult.postExecution = postExecution;
  }
  if (result.data?.jsonLogs) {
    jobResult.jsonLogs = result.data.jsonLogs;
    // Extract usage from JSON logs
    const usage = extractUsageFromJsonLogs(result.data.jsonLogs);
    if (usage) {
      jobResult.usage = usage;
      console.log(`[JOB] ✅ Extracted usage:`, {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheCreation: usage.cacheCreationInputTokens,
        cacheRead: usage.cacheReadInputTokens,
        costUsd: usage.costUsd,
      });
    }
  }
  if (result.data?.rawOutput) {
    jobResult.rawOutput = result.data.rawOutput;
  }

  return jobResult;
}

/**
 * Execute a git push job
 */
export async function executeGitPushJob(payload: GitPushJobPayload): Promise<{ success: boolean }> {
  console.log(`[JOB] Starting git push job for branch ${payload.branch}`);

  // Import git operations dynamically to avoid circular dependencies
  const { pushChanges } = await import('@/lib/git/remotes');

  const result = await pushChanges(payload.workspacePath as FilePath, payload.branch);

  if (!result.success) {
    throw new Error(result.error?.message || 'Git push failed');
  }

  console.log(`[JOB] Git push completed for branch ${payload.branch}`);
  return { success: true };
}

/**
 * Execute a merge request creation job
 */
export async function executeGitMRJob(
  payload: GitMRJobPayload
): Promise<{ mergeRequestUrl: string | undefined }> {
  console.log(`[JOB] Starting MR creation job`);

  // Use post-execution handler which already handles MR creation
  const result = await handlePostClaudeCodeExecution(
    payload.workspacePath as FilePath,
    payload.gitInitResult as GitInitResult,
    payload.repoUrl as GitUrl
  );

  if (!result.success) {
    throw new Error(result.error?.message || 'MR creation failed');
  }

  console.log(`[JOB] MR creation completed:`, result.data?.mergeRequestUrl);
  return { mergeRequestUrl: result.data?.mergeRequestUrl };
}

/**
 * Execute a workspace cleanup job
 */
export async function executeWorkspaceCleanupJob(
  payload: WorkspaceCleanupJobPayload
): Promise<{ success: boolean }> {
  console.log(`[JOB] Starting workspace cleanup for ${payload.workspaceId}`);

  // Import cleanup function dynamically
  const { cleanupWorkspace } = await import('@/lib/workspace/cleanup');

  const result = await cleanupWorkspace(payload.workspaceId);

  // cleanupWorkspace throws on error, so if we get here it succeeded
  console.log(`[JOB] Workspace cleanup completed for ${payload.workspaceId}:`, result.message);
  return { success: true };
}
