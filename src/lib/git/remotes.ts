'use server';

/**
 * Git remote operations - pulling, pushing changes
 */

import type { FilePath, AsyncResult } from '@/lib/common/types';
import { createSandboxedGit } from '@/lib/git/sandbox';

/**
 * Pull latest changes from remote
 *
 * Uses reset --hard to handle divergent branches by discarding local changes.
 * This ensures the workspace always matches the remote state exactly.
 */
export async function pullChanges(workspacePath: FilePath): Promise<AsyncResult<void>> {
  try {
    const git = createSandboxedGit(workspacePath);

    // Fetch all remotes and prune deleted remote branches
    await git.fetch(['--all', '--prune']);

    // Get current branch name
    const currentBranch = await git.revparse(['--abbrev-ref', 'HEAD']);
    const branchName = currentBranch.trim();

    // Check if the remote tracking branch exists
    try {
      await git.revparse([`origin/${branchName}`]);
    } catch {
      // Remote branch doesn't exist, nothing to pull
      console.log(`[GIT] Remote branch origin/${branchName} does not exist, skipping pull`);
      return { success: true, data: undefined };
    }

    // Reset to remote state to handle divergent branches
    // This discards any local commits/changes and matches remote exactly
    console.log(`[GIT] Resetting to origin/${branchName} to sync with remote`);
    await git.reset(['--hard', `origin/${branchName}`]);

    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to pull changes: ${error}`),
    };
  }
}

/**
 * Push changes to remote repository
 */
export async function pushChanges(
  workspacePath: FilePath,
  branch?: string
): Promise<AsyncResult<void>> {
  try {
    const git = createSandboxedGit(workspacePath);

    if (branch) {
      // Push specific branch
      await git.push('origin', branch);
    } else {
      // Push current branch
      await git.push();
    }

    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to push changes: ${error}`),
    };
  }
}
