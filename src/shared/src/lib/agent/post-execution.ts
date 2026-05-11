'use server';

/**
 * Post-edit git operations: stage, commit, push, open MR/PR.
 *
 * Runs after the AgentRunner stream completes for edit-mode stages. Handles
 * leftover uncommitted changes (the agent often commits itself, but anything
 * unstaged at the end gets a sweep-up commit), pushes the feature branch,
 * and creates a PR/MR on the appropriate provider when configured.
 *
 * Lives in lib/agent/ because its only consumers are the agent execution
 * orchestrators (agent-runner.ts and queue/job-handlers.ts). Was previously
 * under lib/claudeCode/ before the Claude Code CLI decommission.
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

export interface PostExecutionResult {
  hasChanges: boolean;
  commitHash?: string;
  mergeRequestUrl?: string;
  pushedBranch?: string;
}

/**
 * Task context for generating semantic commit messages.
 *
 * Represents a **user story** or **simple task**, not a parent feature.
 * Each story is executed independently and gets its own commit with this context.
 *
 * @example
 * // User story within a feature
 * { id: "US-028", title: "Manual state override with audit trail" }
 *
 * // Simple standalone task
 * { id: "TASK-001", title: "Fix login redirect bug" }
 */
export interface TaskContext {
  /** Story or task identifier (e.g., "US-001", "TASK-123") — not the parent feature ID */
  id: string;
  /** Human-readable story/task title */
  title: string;
}

/**
 * Generate a commit message from task context, or a generic fallback.
 *
 * With task context:
 * ```
 * feat: [US-028] Manual state override with audit trail
 *
 * Co-Authored-By: Omnidev <noreply@omnidev.dev>
 * ```
 *
 * Without (jobs from /api/ask or /api/edit that don't carry a task id):
 * ```
 * Automated changes via Omnidev — 2026-01-23T12:00:00.000Z
 * ```
 */
function generateCommitMessage(taskContext?: TaskContext): string {
  if (taskContext) {
    return `feat: [${taskContext.id}] ${taskContext.title}\n\nCo-Authored-By: Omnidev <noreply@omnidev.dev>`;
  }
  return `Automated changes via Omnidev — ${new Date().toISOString()}`;
}

/**
 * Post-edit git operations:
 * - Stages and commits anything the agent left uncommitted
 * - Pushes the branch (even if the agent already committed — there may be
 *   unpushed commits)
 * - Creates an MR/PR on the appropriate provider when configured
 *
 * @param workspacePath - Path to the workspace directory
 * @param gitInitResult - Result from initializeGitWorkflow
 * @param repoUrl - Repository URL (optional, for PR/MR creation)
 * @param provider - 'gitlab' | 'github' | 'other' (auto-detected from URL when omitted)
 * @param taskContext - Optional task context for semantic commit messages
 */
export async function handlePostExecution(
  workspacePath: FilePath,
  gitInitResult: GitInitResult,
  repoUrl?: GitUrl,
  provider?: GitProvider,
  taskContext?: TaskContext
): Promise<AsyncResult<PostExecutionResult>> {
  try {
    const changesResult = await hasUncommittedChanges(workspacePath);
    if (!changesResult.success) {
      return {
        success: false,
        error: new Error(`Failed to check for changes: ${changesResult.error?.message}`),
      };
    }

    const result: PostExecutionResult = {
      hasChanges: false,
    };

    // If there are uncommitted changes, stage and commit them. The agent
    // is typically instructed to commit itself, so often there are no
    // uncommitted changes — but there ARE unpushed commits on the branch.
    if (changesResult.data) {
      const addResult = await addAllFiles(workspacePath);
      if (!addResult.success) {
        console.warn(`[POST-EXECUTION] Failed to stage files: ${addResult.error?.message}`);
        // Continue to push — the agent's commits are more important than leftovers
      } else {
        const commitMessage = generateCommitMessage(taskContext);
        const commitResult = await commitChanges(workspacePath, commitMessage);
        if (!commitResult.success) {
          console.warn(
            `[POST-EXECUTION] Failed to commit leftover changes: ${commitResult.error?.message}. Continuing to push existing commits.`
          );
        } else {
          result.hasChanges = true;
          result.commitHash = commitResult.data;
        }
      }
    }

    // Push the branch regardless of whether we committed above — the agent
    // may have committed directly, leaving unpushed commits.
    console.log(`[POST-EXECUTION] Push decision:`, {
      mergeRequestRequired: gitInitResult.mergeRequestRequired,
      sourceBranch: gitInitResult.sourceBranch,
      targetBranch: gitInitResult.targetBranch,
      hasChanges: result.hasChanges,
    });
    if (gitInitResult.mergeRequestRequired) {
      const pushResult = await pushChanges(workspacePath, gitInitResult.sourceBranch);
      if (!pushResult.success) {
        return {
          success: false,
          error: new Error(`Failed to push changes: ${pushResult.error?.message}`),
        };
      }

      if (repoUrl) {
        const effectiveProvider = provider || detectProviderFromUrl(repoUrl);
        console.log(`[POST-EXECUTION] Creating PR/MR for provider: ${effectiveProvider}`);

        if (effectiveProvider === 'github') {
          const ownerRepo = extractOwnerRepoFromUrl(repoUrl);
          if (ownerRepo) {
            const prTitle = taskContext
              ? `[${taskContext.id}] ${taskContext.title}`
              : 'Automated changes from Omnidev';
            const prResult = await createPullRequest({
              owner: ownerRepo.owner,
              repo: ownerRepo.repo,
              head: gitInitResult.sourceBranch,
              base: gitInitResult.targetBranch,
              title: prTitle,
              body: await formatPullRequestDescription(result.commitHash ?? 'unknown'),
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
          const projectId = extractProjectIdFromUrl(repoUrl);
          if (projectId) {
            const mrTitle = taskContext
              ? `[${taskContext.id}] ${taskContext.title}`
              : 'Automated changes from Omnidev';
            const mrResult = await createMergeRequest({
              projectId,
              sourceBranch: gitInitResult.sourceBranch,
              targetBranch: gitInitResult.targetBranch,
              title: mrTitle,
              description: `This merge request contains automated changes made by Omnidev.\n\nCommit: ${result.commitHash ?? 'unknown'}\nTimestamp: ${new Date().toISOString()}`,
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
      console.log(
        `[POST-EXECUTION] Pushing branch '${gitInitResult.sourceBranch}' to remote (no MR)...`
      );
      const pushResult = await pushChanges(workspacePath, gitInitResult.sourceBranch);
      if (!pushResult.success) {
        console.warn(
          `[POST-EXECUTION] Push failed for branch '${gitInitResult.sourceBranch}':`,
          pushResult.error?.message
        );
        return {
          success: false,
          error: new Error(`Failed to push changes: ${pushResult.error?.message}`),
        };
      }

      result.pushedBranch = gitInitResult.sourceBranch;
      console.log(`[POST-EXECUTION] ✅ Pushed branch '${gitInitResult.sourceBranch}' to remote`);
    }

    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Post-execution processing failed: ${error}`),
    };
  }
}
