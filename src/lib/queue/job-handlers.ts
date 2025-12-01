/**
 * Job Handlers - Execution logic for each job type
 *
 * These handlers wrap existing functionality from the codebase
 * to be called by the queue worker.
 */

import { askClaudeCode, handlePostClaudeCodeExecution } from '@/lib/claudeCode';
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

  // Build options, only including defined properties
  const options: Parameters<typeof askClaudeCode>[0] = {
    question: payload.question,
    workingDirectory: payload.workspacePath as FilePath,
    workspaceId: payload.workspaceId,
  };

  if (payload.context) {
    options.context = payload.context;
  }

  if (payload.sourceBranch) {
    options.sourceBranch = payload.sourceBranch;
  }

  const result = await askClaudeCode(options);

  const executionTimeMs = Date.now() - startTime;

  if (!result.success) {
    throw new Error(result.error?.message || 'Claude Code execution failed');
  }

  console.log(`[JOB] Claude Code job completed in ${executionTimeMs}ms`);

  // Handle post-execution git operations if needed
  if (result.data?.gitInitResult && payload.repoUrl) {
    console.log(`[JOB] Processing post-execution git operations...`);

    try {
      const postResult = await handlePostClaudeCodeExecution(
        payload.workspacePath as FilePath,
        result.data.gitInitResult,
        payload.repoUrl as GitUrl
      );

      if (postResult.success) {
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

  if (result.data?.gitInitResult) {
    jobResult.gitInitResult = result.data.gitInitResult;
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
