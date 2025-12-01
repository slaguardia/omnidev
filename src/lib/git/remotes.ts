'use server';

/**
 * Git remote operations - pulling, pushing changes
 */

import type { FilePath, AsyncResult } from '@/lib/common/types';
import { createSandboxedGit } from '@/lib/git/sandbox';

/**
 * Pull latest changes from remote
 */
export async function pullChanges(workspacePath: FilePath): Promise<AsyncResult<void>> {
  try {
    const git = createSandboxedGit(workspacePath);

    // Fetch all remotes and prune deleted remote branches
    await git.fetch(['--all', '--prune']);

    // Pull latest changes from current branch
    await git.pull();

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
