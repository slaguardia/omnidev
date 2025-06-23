'use server';

/**
 * Post-execution handling for Claude Code operations
 */

import { hasUncommittedChanges, addAllFiles, commitChanges } from '@/lib/git/commits';
import { pushChanges } from '@/lib/git/remotes';
import { createGitLabAPI, createMergeRequest, GitLabAPI } from '@/lib/gitlab';
import { GitInitResult } from '@/lib/managers/RepositoryManager';
import type { AsyncResult, FilePath, GitUrl } from '@/lib/types/index';
import type { PostExecutionResult } from './types';

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
): Promise<AsyncResult<PostExecutionResult>> {
  try {
    // Check if there are any changes to commit
    const changesResult = await hasUncommittedChanges(workspacePath);
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
    const addResult = await addAllFiles(workspacePath);
    if (!addResult.success) {
      return {
        success: false,
        error: new Error(`Failed to add files: ${addResult.error?.message}`)
      };
    }

    // Commit changes
    const defaultCommitMessage = `Automated changes via Claude Code - ${new Date().toISOString()}`;
    const commitResult = await commitChanges(workspacePath, defaultCommitMessage);
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
      const pushResult = await pushChanges(workspacePath, gitInitResult.sourceBranch);
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
            const mrResult = await createMergeRequest({
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
      const pushResult = await pushChanges(workspacePath, gitInitResult.sourceBranch);
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