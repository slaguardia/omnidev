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

    const currentBranch = branch || (await git.revparse(['--abbrev-ref', 'HEAD'])).trim();

    // Fresh fetch before push to ensure we have the latest remote state
    // This prevents "non-fast-forward" errors due to stale local refs
    console.log(`[GIT PUSH] Fetching latest state of origin/${currentBranch}...`);
    try {
      await git.fetch(['origin', currentBranch]);
    } catch (fetchError) {
      console.warn(`[GIT PUSH] Could not fetch origin/${currentBranch}: ${fetchError}`);
      // Continue anyway - branch might be new
    }

    // Diagnostic logging before push
    const localHead = await git.raw(['rev-parse', 'HEAD']);
    const localShort = localHead.trim().substring(0, 7);

    let remoteShort = 'N/A';
    let isBehind = false;
    let behind = 0;
    let ahead = 0;
    try {
      const remoteHead = await git.raw(['rev-parse', `origin/${currentBranch}`]);
      remoteShort = remoteHead.trim().substring(0, 7);

      // Check if we're ahead/behind
      const aheadBehind = await git.raw([
        'rev-list',
        '--left-right',
        '--count',
        `origin/${currentBranch}...HEAD`,
      ]);
      const parts = aheadBehind.trim().split(/\s+/).map(Number);
      behind = parts[0] ?? 0;
      ahead = parts[1] ?? 0;
      isBehind = behind > 0;

      console.log(
        `[GIT PUSH] Branch ${currentBranch}: local=${localShort}, origin=${remoteShort}, ahead=${ahead}, behind=${behind}`
      );

      if (isBehind) {
        console.warn(
          `[GIT PUSH] ⚠️ Local branch is ${behind} commit(s) behind remote - push will likely fail!`
        );
        console.warn(
          `[GIT PUSH] Remote has commits that local doesn't have. Consider rebasing or using createMR=true.`
        );
      }
    } catch {
      console.log(
        `[GIT PUSH] Branch ${currentBranch}: local=${localShort}, origin=${remoteShort} (remote ref not found or new branch)`
      );
    }

    if (branch) {
      // Push specific branch
      await git.push('origin', branch);
    } else {
      // Push current branch
      await git.push();
    }

    console.log(`[GIT PUSH] ✅ Successfully pushed ${currentBranch} to origin`);
    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to push changes: ${error}`),
    };
  }
}
