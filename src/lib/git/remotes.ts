'use server';

/**
 * Git remote operations - pulling, pushing changes
 */

import type { FilePath, AsyncResult } from '@/lib/common/types';
import { createSandboxedGit } from '@/lib/git/sandbox';
import { ensureFreshRemoteRef, verifySyncState } from '@/lib/git/ref-sync';

/**
 * Pull latest changes from remote
 *
 * Uses reset --hard to handle divergent branches by discarding local changes.
 * This ensures the workspace always matches the remote state exactly.
 *
 * Includes ls-remote verification to detect and fix stale local refs that
 * can occur when the remote is updated externally.
 */
export async function pullChanges(workspacePath: FilePath): Promise<AsyncResult<void>> {
  try {
    const git = createSandboxedGit(workspacePath);

    // Get current branch name first
    const currentBranch = await git.revparse(['--abbrev-ref', 'HEAD']);
    const branchName = currentBranch.trim();

    console.log(`[GIT PULL] Fetching latest for branch: ${branchName}`);

    // Fetch all remotes and prune deleted remote branches
    await git.fetch(['--all', '--prune', '--force']);

    // Ensure remote ref is fresh and handle non-existent branches
    const refSync = await ensureFreshRemoteRef(git, branchName, '[GIT PULL]');
    if (!refSync.branchExists) {
      // Try local ref as fallback
      try {
        await git.revparse([`origin/${branchName}`]);
      } catch {
        console.log(`[GIT PULL] Remote branch origin/${branchName} does not exist, skipping pull`);
        return { success: true, data: undefined };
      }
    }

    // Reset to remote state to handle divergent branches
    // This discards any local commits/changes and matches remote exactly
    console.log(`[GIT PULL] Resetting to origin/${branchName} to sync with remote`);
    await git.reset(['--hard', `origin/${branchName}`]);

    // Verify sync was successful
    await verifySyncState(git, branchName, '[GIT PULL]');

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
 *
 * Includes ls-remote verification to ensure accurate ahead/behind diagnostics
 * before push, detecting stale local refs that could cause failed pushes.
 */
export async function pushChanges(
  workspacePath: FilePath,
  branch?: string
): Promise<AsyncResult<void>> {
  try {
    const git = createSandboxedGit(workspacePath);

    const currentBranch = branch || (await git.revparse(['--abbrev-ref', 'HEAD'])).trim();

    // Fresh fetch before push to ensure we have the latest remote state
    console.log(`[GIT PUSH] Fetching latest state of origin/${currentBranch}...`);

    // Ensure remote ref is fresh (for existing branches) and detect new branches
    const refSync = await ensureFreshRemoteRef(git, currentBranch, '[GIT PUSH]');
    const isNewBranch = !refSync.branchExists;
    if (isNewBranch) {
      console.log(`[GIT PUSH] Branch ${currentBranch} does not exist on remote (new branch)`);
    }

    // Diagnostic logging before push
    const localHead = await git.raw(['rev-parse', 'HEAD']);
    const localShort = localHead.trim().substring(0, 7);

    let remoteShort = 'N/A';
    let isBehind = false;
    let behind = 0;
    let ahead = 0;

    if (!isNewBranch) {
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
          `[GIT PUSH] Branch ${currentBranch}: local=${localShort}, origin=${remoteShort} (remote ref not found)`
        );
      }
    } else {
      console.log(
        `[GIT PUSH] Branch ${currentBranch}: local=${localShort} (new branch, no remote)`
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
