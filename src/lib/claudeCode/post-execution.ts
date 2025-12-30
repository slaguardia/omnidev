'use server';

/**
 * Post-execution handling for Claude Code operations
 */

import { hasUncommittedChanges, addAllFiles, commitChanges } from '@/lib/git/commits';
import { pushChanges } from '@/lib/git/remotes';
import { detectProviderFromUrl } from '@/lib/git/provider-detection';
import { createMergeRequest } from '@/lib/gitlab/merge-requests';
import { extractProjectIdFromUrl } from '@/lib/gitlab/api';
import { createPullRequest, formatPullRequestDescription } from '@/lib/github/pull-requests';
import { extractOwnerRepoFromUrl } from '@/lib/github/api';
import { GitInitResult } from '@/lib/managers/repository-manager';
import type { AsyncResult, FilePath, GitUrl, GitProvider } from '@/lib/types/index';
import type { PostExecutionResult } from './types';

/**
 * Handle post-Claude Code execution git operations
 * This function runs after Claude Code completes and handles:
 * - Checking for changes
 * - Committing changes
 * - Creating merge/pull requests or pushing changes
 *
 * @param workspacePath - Path to the workspace directory
 * @param gitInitResult - Result from git workflow initialization
 * @param repoUrl - Repository URL (optional, for PR/MR creation)
 * @param provider - Git provider ('gitlab' | 'github' | 'other'), auto-detected from URL if not provided
 */
export async function handlePostClaudeCodeExecution(
  workspacePath: FilePath,
  gitInitResult: GitInitResult,
  repoUrl?: GitUrl,
  provider?: GitProvider
): Promise<AsyncResult<PostExecutionResult>> {
  try {
    // Check if there are any changes to commit
    const changesResult = await hasUncommittedChanges(workspacePath);
    if (!changesResult.success) {
      return {
        success: false,
        error: new Error(`Failed to check for changes: ${changesResult.error?.message}`),
      };
    }

    // If no changes, return early
    if (!changesResult.data) {
      return {
        success: true,
        data: {
          hasChanges: false,
        },
      };
    }

    // Add all files to staging
    const addResult = await addAllFiles(workspacePath);
    if (!addResult.success) {
      return {
        success: false,
        error: new Error(`Failed to add files: ${addResult.error?.message}`),
      };
    }

    // Commit changes
    const defaultCommitMessage = `Automated changes via Claude Code - ${new Date().toISOString()}`;
    const commitResult = await commitChanges(workspacePath, defaultCommitMessage);
    if (!commitResult.success) {
      return {
        success: false,
        error: new Error(`Failed to commit changes: ${commitResult.error?.message}`),
      };
    }

    const result: PostExecutionResult = {
      hasChanges: true,
      commitHash: commitResult.data,
    };

    // Handle merge request vs direct push
    if (gitInitResult.mergeRequestRequired) {
      // Push source branch to remote
      const pushResult = await pushChanges(workspacePath, gitInitResult.sourceBranch);
      if (!pushResult.success) {
        return {
          success: false,
          error: new Error(`Failed to push changes: ${pushResult.error?.message}`),
        };
      }

      // Create PR/MR if repo URL is provided
      if (repoUrl) {
        // Determine provider from parameter or detect from URL
        const effectiveProvider = provider || detectProviderFromUrl(repoUrl);
        console.log(`[POST-EXECUTION] Creating PR/MR for provider: ${effectiveProvider}`);

        if (effectiveProvider === 'github') {
          // Create GitHub Pull Request
          const ownerRepo = extractOwnerRepoFromUrl(repoUrl);
          if (ownerRepo) {
            const prResult = await createPullRequest({
              owner: ownerRepo.owner,
              repo: ownerRepo.repo,
              head: gitInitResult.sourceBranch,
              base: gitInitResult.targetBranch,
              title: `Automated changes from Claude Code`,
              body: await formatPullRequestDescription(commitResult.data),
            });

            if (prResult.success) {
              result.mergeRequestUrl = prResult.data.htmlUrl;
              console.log('Pull request created successfully:', prResult.data.htmlUrl);
            } else {
              console.warn('Failed to create pull request:', prResult.error?.message);
            }
          } else {
            console.warn('Could not extract owner/repo from repository URL:', repoUrl);
          }
        } else if (effectiveProvider === 'gitlab') {
          // Create GitLab Merge Request
          const projectId = extractProjectIdFromUrl(repoUrl);
          if (projectId) {
            const mrResult = await createMergeRequest({
              projectId,
              sourceBranch: gitInitResult.sourceBranch,
              targetBranch: gitInitResult.targetBranch,
              title: `Automated changes from Claude Code`,
              description: `This merge request contains automated changes made by Claude Code.\n\nCommit: ${commitResult.data}\nTimestamp: ${new Date().toISOString()}`,
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
          console.warn(`Unknown provider '${effectiveProvider}', skipping PR/MR creation`);
        }
      }
    } else {
      // Push directly to source branch (no merge request needed)
      const pushResult = await pushChanges(workspacePath, gitInitResult.sourceBranch);
      if (!pushResult.success) {
        return {
          success: false,
          error: new Error(`Failed to push changes: ${pushResult.error?.message}`),
        };
      }

      result.pushedBranch = gitInitResult.sourceBranch;
    }

    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Post-execution processing failed: ${error}`),
    };
  }
}
