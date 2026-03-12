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
import { createStageExecutor } from '@/lib/executor';
import type { GitInitResult } from '@/lib/managers/repository-manager';
import * as WorkspaceManagerFunctions from '@/lib/managers/workspace-manager';
import type { FilePath, GitUrl, CommitHash } from '@/lib/types/index';
import type {
  ClaudeCodeJobPayload,
  ClaudeCodeJobResult,
  ClaudeCodeUsage,
  ClaudeCodeJsonLog,
  GitPushJobPayload,
  GitMRJobPayload,
  WorkspaceCleanupJobPayload,
  RalphStageJobPayload,
  RalphStageJobResult,
} from './types';

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

        // Switch to the target branch (without updating workspace config - this is a temporary switch)
        console.log(`[JOB] 📌 Switching to branch: ${targetBranch}`);
        const switchResult = await switchBranch(payload.workspaceId, targetBranch, false);
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
      ...(payload.createMR !== undefined ? { createMR: payload.createMR } : {}),
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
        payload.repoUrl as GitUrl,
        undefined, // provider - auto-detected from URL
        payload.taskContext
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
// ============================================================================
// Generic Stage Execution Job Handler
// ============================================================================

/**
 * Execute a Ralph generic stage job.
 *
 * Runs a user-configured prompt against Claude Code and stores the raw output
 * in the task's `stageOutputs[stageName]`. If `returnQuestions` is enabled,
 * QUESTION: lines are parsed from the output and stored as pending questions.
 */
export async function executeRalphStageJob(
  payload: RalphStageJobPayload
): Promise<RalphStageJobResult> {
  const startTime = Date.now();
  console.log(
    `[JOB] Starting Ralph stage job: ${payload.stageName} for task ${payload.taskId}, iteration ${payload.iteration}`
  );

  try {
    const { getRalphTask, updateRalphTask } = await import('@/lib/managers/ralph-task-manager');
    const { parseQuestionsFromOutput } = await import('@/lib/workflow/prompt-template');

    // Pre-flight: verify git identity is configured for edit-mode stages
    if (payload.editRequest) {
      const { getConfig } = await import('@/lib/config/server-actions');
      const { setWorkspaceGitConfig } = await import('@/lib/git/config');
      const appConfig = await getConfig();
      const commitName = appConfig.gitlab?.commitName || appConfig.github?.commitName || '';
      const commitEmail = appConfig.gitlab?.commitEmail || appConfig.github?.commitEmail || '';

      if (!commitName || !commitEmail) {
        throw new Error(
          `Pre-flight failed: git commit identity not configured. ` +
            `Set Commit Name and Commit Email in Settings > Git Source Config. ` +
            `(commitName=${commitName || 'unset'}, commitEmail=${commitEmail || 'unset'})`
        );
      }

      // Ensure workspace has the git config set (may have been lost during workspace prep)
      await setWorkspaceGitConfig(payload.workspacePath as FilePath, {
        userName: commitName,
        userEmail: commitEmail,
      });
      console.log(`[JOB] Git identity: ${commitName} <${commitEmail}>`);
    }

    const taskResult = await getRalphTask(payload.taskId);
    if (!taskResult.success) {
      throw new Error(`Failed to load task: ${taskResult.error?.message}`);
    }

    const task = taskResult.data;

    // Auto-loop cancellation check: if this is a continuation iteration and the loop
    // has been cancelled (autoLoopActive === false), skip execution
    if (payload.autoLoop && payload.iteration > 1) {
      const existingOutput = task.stageOutputs?.[payload.stageName];
      if (existingOutput && existingOutput.autoLoopActive === false) {
        console.log(
          `[JOB] Auto-loop cancelled for ${payload.stageName} iteration ${payload.iteration}, skipping`
        );
        return {
          taskId: payload.taskId,
          stageName: payload.stageName,
          iteration: payload.iteration,
          output: '',
          executionTimeMs: Date.now() - startTime,
          error: 'Auto-loop cancelled',
        };
      }
    }

    // Build the effective prompt — strategy differs for auto-loop vs manual iterations
    let effectivePrompt = payload.prompt;

    if (payload.iteration > 1) {
      if (payload.autoLoop) {
        // Auto-loop: don't prepend previous output (it grows unbounded).
        // Claude reads workspace files (.ralph/progress.md) for state — each
        // iteration is a fresh instance, matching the ralph.sh pattern.
        effectivePrompt = `# Auto-Loop Iteration ${payload.iteration} of ${payload.maxIterations}\n\n${payload.prompt}`;
      } else {
        // Manual iterations: prepend previous output + answered questions
        const existingOutput = task.stageOutputs?.[payload.stageName];
        if (existingOutput) {
          const parts: string[] = [];
          parts.push(`# Continuation — Iteration ${payload.iteration}`);
          parts.push('');

          // Include previous iteration output
          const prevIteration = existingOutput.iterations.find(
            (i) => i.iteration === payload.iteration - 1
          );
          if (prevIteration) {
            parts.push('## Previous Output');
            parts.push(prevIteration.output);
            parts.push('');
          }

          // Include any answered questions
          const answeredQuestions = existingOutput.pendingQuestions.filter((q) => q.answer);
          if (answeredQuestions.length > 0) {
            parts.push('## Answers to Questions');
            for (const q of answeredQuestions) {
              parts.push(`**Q:** ${q.question}`);
              parts.push(`**A:** ${q.answer}`);
              parts.push('');
            }
          }

          parts.push('## Updated Prompt');
          parts.push(payload.prompt);

          effectivePrompt = parts.join('\n');
        }
      }
    }

    const isEditMode = payload.editRequest ?? false;

    // For edit mode, initialize git workflow if needed
    let gitInitResult: GitInitResult | undefined;
    let effectiveSourceBranch: string | undefined;

    if (isEditMode) {
      // Resolve source branch: prefer task.featureBranch, fall back to auto-generated
      // name for merge-request tasks (defensive against missing data)
      let sourceBranch = task.featureBranch;
      if (!sourceBranch && task.deliveryMethod === 'merge-request') {
        sourceBranch = `ralph/${payload.taskId}`;
        console.warn(
          `[JOB] ⚠️ Task ${payload.taskId} has deliveryMethod=merge-request but no featureBranch — using fallback: ${sourceBranch}`
        );
      }

      console.log(`[JOB] 🔄 Initializing git workflow for edit-mode stage: ${payload.stageName}`, {
        featureBranch: task.featureBranch,
        deliveryMethod: task.deliveryMethod,
        sourceBranch,
      });
      const gitWorkflowOpts: Parameters<typeof initializeGitWorkflow>[0] = {
        workspaceId: payload.workspaceId,
      };
      if (sourceBranch) {
        gitWorkflowOpts.sourceBranch = sourceBranch;
        gitWorkflowOpts.createMR = true;
      }
      const initResult = await initializeGitWorkflow(gitWorkflowOpts);

      if (!initResult.success) {
        const errorMsg = initResult.error?.message || 'Unknown git workflow error';
        console.error(`[JOB] ❌ Git workflow initialization failed:`, errorMsg);
        throw new Error(`Git workflow initialization failed: ${errorMsg}`);
      }

      const isDirectCommit = (task.deliveryMethod ?? 'merge-request') === 'direct-commit';
      gitInitResult = {
        ...initResult.data,
        mergeRequestRequired: !isDirectCommit && initResult.data.mergeRequestRequired,
      };
      effectiveSourceBranch = initResult.data.sourceBranch;
    }

    // Execute stage via executor interface
    const executor = createStageExecutor();
    const result = await executor.execute({
      prompt: effectivePrompt,
      workingDirectory: payload.workspacePath as FilePath,
      workspaceId: payload.workspaceId,
      editMode: isEditMode,
      sourceBranch: effectiveSourceBranch,
    });

    const executionTimeMs = Date.now() - startTime;

    if (!result.success) {
      console.error(`[JOB] Stage execution failed:`, result.error?.message);

      // Store error iteration
      const existingOutput = task.stageOutputs?.[payload.stageName];
      const errorIteration = {
        iteration: payload.iteration,
        output: '',
        executionTimeMs,
        completedAt: new Date().toISOString(),
        error: result.error?.message || 'Stage execution failed',
      };

      const updatedErrorStageOutput = {
        prompt: existingOutput?.prompt ?? payload.prompt,
        currentIteration: payload.iteration,
        maxIterations: payload.maxIterations,
        returnQuestions: payload.returnQuestions,
        iterations: [...(existingOutput?.iterations ?? []), errorIteration],
        pendingQuestions: existingOutput?.pendingQuestions ?? [],
        activeJobId: undefined as string | undefined,
        lastUpdated: new Date().toISOString(),
        autoLoopActive: payload.autoLoop ? false : (undefined as boolean | undefined),
        completionReason: (payload.autoLoop ? 'error' : undefined) as
          | 'complete'
          | 'max-iterations'
          | 'error'
          | 'questions'
          | 'cancelled'
          | undefined,
      };

      await updateRalphTask(payload.taskId, {
        executionError: result.error?.message || 'Stage execution failed',
        stageOutputs: {
          ...task.stageOutputs,
          [payload.stageName]: updatedErrorStageOutput,
        },
      });

      return {
        taskId: payload.taskId,
        stageName: payload.stageName,
        iteration: payload.iteration,
        output: '',
        executionTimeMs,
        error: result.error?.message || 'Stage execution failed',
      };
    }

    // Handle post-execution git operations for edit mode
    if (gitInitResult && payload.repoUrl) {
      console.log(`[JOB] Processing post-execution git operations for stage: ${payload.stageName}`);
      try {
        const postResult = await handlePostClaudeCodeExecution(
          payload.workspacePath as FilePath,
          gitInitResult,
          payload.repoUrl as GitUrl,
          undefined,
          { id: payload.taskId, title: task.title }
        );

        if (postResult.success && postResult.data) {
          // Update task with feature branch, and PR URL if created
          const taskUpdates: Record<string, unknown> = {};
          if (gitInitResult.sourceBranch) {
            taskUpdates.featureBranch = gitInitResult.sourceBranch;
            taskUpdates.baseBranch = gitInitResult.targetBranch;
          }
          if (postResult.data.mergeRequestUrl) {
            taskUpdates.prUrl = postResult.data.mergeRequestUrl;
          }
          if (Object.keys(taskUpdates).length > 0) {
            await updateRalphTask(payload.taskId, taskUpdates);
          }
          console.log(`[JOB] Post-execution completed:`, {
            hasChanges: postResult.data.hasChanges,
            pushedBranch: postResult.data.pushedBranch,
            mergeRequestUrl: postResult.data.mergeRequestUrl,
          });
        } else if (!postResult.success) {
          console.warn(`[JOB] Post-execution failed:`, postResult.error?.message);
        }
      } catch (postError) {
        console.warn(`[JOB] Post-execution error (non-fatal):`, postError);
      }
    }

    const output = result.data?.output || '';
    console.log(`[JOB] Stage output (${output.length} chars)`);

    // Parse questions if returnQuestions is enabled
    let parsedQuestions: string[] | undefined;
    if (payload.returnQuestions) {
      const questions = parseQuestionsFromOutput(output);
      if (questions.length > 0) {
        parsedQuestions = questions;
      }
    }

    // Build stage iteration record
    const iterationRecord: {
      iteration: number;
      output: string;
      questions?: { id: string; question: string }[];
      executionTimeMs: number;
      completedAt: string;
    } = {
      iteration: payload.iteration,
      output,
      executionTimeMs,
      completedAt: new Date().toISOString(),
    };

    if (parsedQuestions) {
      iterationRecord.questions = parsedQuestions.map((q, i) => ({
        id: `sq-${Date.now()}-${i}`,
        question: q,
      }));
    }

    // Build pending questions from this iteration
    const newPendingQuestions = (iterationRecord.questions ?? []).map((q) => ({
      id: q.id,
      question: q.question,
    }));

    // Update stageOutputs on the task (clear activeJobId since job is done)
    const existingOutput = task.stageOutputs?.[payload.stageName];

    // Determine auto-loop state
    type CompletionReason = 'complete' | 'max-iterations' | 'error' | 'questions' | 'cancelled';
    let nextActiveJobId: string | undefined;
    let autoLoopActive: boolean | undefined;
    let completionReasonValue: CompletionReason | undefined;

    if (payload.autoLoop) {
      const hasCompletionSignal = output.includes('<promise>COMPLETE</promise>');
      const atMaxIterations = payload.iteration >= payload.maxIterations;
      const hasQuestions = (parsedQuestions?.length ?? 0) > 0;

      if (hasCompletionSignal) {
        completionReasonValue = 'complete';
      } else if (atMaxIterations) {
        completionReasonValue = 'max-iterations';
      } else if (hasQuestions) {
        completionReasonValue = 'questions';
      }

      if (completionReasonValue) {
        // Stop the loop
        autoLoopActive = false;
        console.log(
          `[JOB] Auto-loop stopping for ${payload.stageName}: ${completionReasonValue} (iteration ${payload.iteration})`
        );
      } else {
        // Continue: enqueue next iteration
        const { enqueueJob } = await import('@/lib/queue/queue-manager');
        const nextPayload: RalphStageJobPayload = {
          ...payload,
          iteration: payload.iteration + 1,
        };
        const nextJobId = await enqueueJob('ralph-stage', nextPayload);
        nextActiveJobId = nextJobId as string;
        autoLoopActive = true;
        console.log(
          `[JOB] Auto-loop continuing: enqueued iteration ${payload.iteration + 1} as job ${nextJobId}`
        );
      }
    }

    // For manual (non-auto-loop) continuation iterations, the new iteration
    // is a strict superset of the previous one (it includes the prior output +
    // answered questions in its prompt context). Replace rather than append so
    // the user isn't left with a stale, uninformed first iteration.
    const isManualContinuation = !payload.autoLoop && payload.iteration > 1;
    const updatedIterations = isManualContinuation
      ? [iterationRecord]
      : [...(existingOutput?.iterations ?? []), iterationRecord];

    const updatedStageOutput = {
      prompt: existingOutput?.prompt ?? payload.prompt,
      currentIteration: payload.iteration,
      maxIterations: payload.maxIterations,
      returnQuestions: payload.returnQuestions,
      iterations: updatedIterations,
      pendingQuestions: newPendingQuestions,
      activeJobId: nextActiveJobId,
      autoLoopActive,
      completionReason: completionReasonValue,
      lastUpdated: new Date().toISOString(),
    };

    await updateRalphTask(payload.taskId, {
      executionError: null,
      stageOutputs: {
        ...task.stageOutputs,
        [payload.stageName]: updatedStageOutput,
      },
    });

    // Auto-advance: if stage completed and task has a playbook, move to next stage
    if (
      payload.autoLoop &&
      completionReasonValue &&
      (completionReasonValue === 'complete' || completionReasonValue === 'max-iterations')
    ) {
      try {
        const { getNextPlaybookStage, transitionRalphTask: transitionTask } = await import(
          '@/lib/managers/ralph-task-manager'
        );
        const { nextStage } = getNextPlaybookStage(payload.taskId, payload.stageName);

        if (nextStage) {
          // Loop to handle no-prompt stages (fast-forward through them)
          let targetStage: string | null = nextStage;
          while (targetStage && targetStage !== 'complete') {
            await transitionTask(
              payload.taskId,
              targetStage,
              `Playbook auto-advance from ${payload.stageName}`
            );

            const { startStageRun } = await import('@/lib/ralph/stage-runner');
            const runResult = await startStageRun(payload.taskId, targetStage);

            if (runResult.skipped) {
              // No-prompt stage — advance past it
              const next = getNextPlaybookStage(payload.taskId, targetStage);
              targetStage = next.nextStage;
            } else {
              break; // Stage is running or errored, stop here
            }
          }

          if (targetStage === 'complete') {
            await transitionTask(payload.taskId, 'complete', 'Playbook pipeline completed');
          }
        }
      } catch (advanceError) {
        // Non-fatal: stage completed successfully, auto-advance just failed
        console.error(`[JOB] Auto-advance error (non-fatal):`, advanceError);
      }
    }

    console.log(`[JOB] Ralph stage job completed in ${executionTimeMs}ms`);

    const jobResult: RalphStageJobResult = {
      taskId: payload.taskId,
      stageName: payload.stageName,
      iteration: payload.iteration,
      output,
      executionTimeMs,
    };
    if (parsedQuestions) {
      jobResult.questions = parsedQuestions;
    }
    return jobResult;
  } catch (error) {
    const executionTimeMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[JOB] Ralph stage job failed:`, errorMessage);

    // Always update task state on failure: record error in executionError,
    // stop auto-loop if active, and keep activeJobId so the UI can fetch
    // the failed job's status (shows "Job failed" instead of "Starting...")
    try {
      const { getRalphTask: getTask, updateRalphTask: updateTask } = await import(
        '@/lib/managers/ralph-task-manager'
      );
      const currentTask = await getTask(payload.taskId);
      if (currentTask.success) {
        const currentStageOutput = currentTask.data.stageOutputs?.[payload.stageName];
        const taskUpdates: Record<string, unknown> = {
          executionError: errorMessage,
        };

        if (currentStageOutput) {
          taskUpdates.stageOutputs = {
            ...currentTask.data.stageOutputs,
            [payload.stageName]: {
              ...currentStageOutput,
              autoLoopActive: payload.autoLoop ? false : currentStageOutput.autoLoopActive,
              completionReason: 'error' as const,
              lastUpdated: new Date().toISOString(),
              // Keep activeJobId — the failed job record still exists in the queue,
              // and the UI enrichment uses it to show "Job failed" with the error message
            },
          };
        }

        await updateTask(payload.taskId, taskUpdates);
      }
    } catch (updateError) {
      console.error(`[JOB] Failed to update task error state:`, updateError);
    }

    return {
      taskId: payload.taskId,
      stageName: payload.stageName,
      iteration: payload.iteration,
      output: '',
      executionTimeMs,
      error: errorMessage,
    };
  }
}
