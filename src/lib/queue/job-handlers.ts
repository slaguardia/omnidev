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
import type {
  ClaudeCodeJobPayload,
  ClaudeCodeJobResult,
  GitPushJobPayload,
  GitMRJobPayload,
  WorkspaceCleanupJobPayload,
} from './types';
import type { FilePath, GitUrl } from '@/lib/types/index';

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
  if (isEditJob) {
    console.log(`[JOB] 🔄 Initializing git workflow for edit job...`);
    const gitInitStart = Date.now();

    const initResult = await initializeGitWorkflow({
      workspaceId: payload.workspaceId,
      ...(payload.sourceBranch ? { sourceBranch: payload.sourceBranch } : {}),
    });

    const gitInitTime = Date.now() - gitInitStart;

    if (!initResult.success) {
      console.warn(
        `[JOB] ⚠️ Git workflow initialization failed in ${gitInitTime}ms:`,
        initResult.error?.message
      );
      // Best-effort: continue without git automation.
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
