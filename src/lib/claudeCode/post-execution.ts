'use server';

/**
 * Post-execution handling for Claude Code operations
 */

import { hasUncommittedChanges, addAllFiles, commitChanges } from '@/lib/git/commits';
import { pushChanges } from '@/lib/git/remotes';
import { createMergeRequest } from '@/lib/gitlab/merge-requests';
import { extractProjectIdFromUrl } from '@/lib/gitlab/api';
import type { AsyncResult, FilePath, GitUrl } from '@/lib/common/types';
import type { PostExecutionResult } from './types';
import { GitBranchWorkflowResult } from '@/lib/workspace/repository';

interface PostExecutionParams {
  workspacePath: FilePath;
  gitBranchWorkflowResult: GitBranchWorkflowResult;
  taskName: string | null;
  taskId: string | null;
  output: string;
  repoUrl?: GitUrl;
}

/**
 * Handle post-Claude Code execution git operations
 * This function runs after Claude Code completes and handles:
 * - Checking for changes
 * - Committing changes
 * - Creating merge requests or pushing changes
 */
export async function handlePostClaudeCodeExecution(
  params: PostExecutionParams
): Promise<AsyncResult<PostExecutionResult>> {
  try {
    // Check if there are any changes to commit
    const changesResult = await hasUncommittedChanges(params.workspacePath);
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
    const addResult = await addAllFiles(params.workspacePath);
    if (!addResult.success) {
      return {
        success: false,
        error: new Error(`Failed to add files: ${addResult.error?.message}`)
      };
    }

    // Commit changes
    const defaultCommitMessage = `Automated changes via Claude Code - ${new Date().toISOString()}`;
    const commitResult = await commitChanges(params.workspacePath, defaultCommitMessage);
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
    if (params.gitBranchWorkflowResult.mergeRequestRequired) {
      // Push source branch to remote
      const pushResult = await pushChanges(params.workspacePath, params.gitBranchWorkflowResult.sourceBranch);
      if (!pushResult.success) {
        return {
          success: false,
          error: new Error(`Failed to push changes: ${pushResult.error?.message}`)
        };
      }

      let uniqueMergeRequestTitle;
      if (params.taskName && params.taskName.trim() !== '' && params.taskId && params.taskId.trim() !== '') {
        uniqueMergeRequestTitle = `${params.taskId} - ${params.taskName}`;
      } else if (params.taskName && params.taskName.trim() !== '') {
        uniqueMergeRequestTitle = params.taskName;
      } else {
        uniqueMergeRequestTitle = `Automated changes from Claude Code`;
      }

      // Create merge request if GitLab API is available and repo URL is provided
      if (params.repoUrl) {
        const projectId = extractProjectIdFromUrl(params.repoUrl);
        if (projectId) {
            const mrResult = await createMergeRequest({
              projectId,
              sourceBranch: params.gitBranchWorkflowResult.sourceBranch,
              targetBranch: params.gitBranchWorkflowResult.targetBranch,
              title: uniqueMergeRequestTitle,
              description: params.output ? `${params.output}` : `This merge request contains automated changes made by Claude Code.\n\nCommit: ${commitResult.data}\nTimestamp: ${new Date().toISOString()}`
            });

            if (mrResult.success) {
              result.mergeRequestUrl = mrResult.data.webUrl;
              console.log('Merge request created successfully:', mrResult.data.webUrl);
            } else {
              console.warn('Failed to create merge request:', mrResult.error?.message);
            }
          } else {
            console.warn('Could not extract project ID from repository URL:', params.repoUrl);
          }
      }
    } else {
      // Push directly to source branch (no merge request needed)
      const pushResult = await pushChanges(params.workspacePath, params.gitBranchWorkflowResult.sourceBranch);
      if (!pushResult.success) {
        return {
          success: false,
          error: new Error(`Failed to push changes: ${pushResult.error?.message}`)
        };
      }

      result.pushedBranch = params.gitBranchWorkflowResult.sourceBranch;
    }

    return { success: true, data: result };

  } catch (error) {
    return {
      success: false,
      error: new Error(`Post-execution processing failed: ${error}`)
    };
  }
} 