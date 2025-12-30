'use server';

/**
 * Git workspace preparation - ensures a clean, synced state before edit operations
 *
 * This utility should be called before any edit workflow to ensure:
 * 1. All uncommitted changes are discarded
 * 2. All untracked files are removed
 * 3. Workspace is on the target/default branch
 * 4. Target branch is synced with remote
 * 5. All local-only branches are deleted
 */

import { CleanOptions } from 'simple-git';
import type { FilePath, AsyncResult } from '@/lib/common/types';
import { createSandboxedGit } from '@/lib/git/sandbox';
import { getDefaultBranch, getLocalBranches, deleteBranch } from '@/lib/git/branches';

export interface PrepareWorkspaceResult {
  targetBranch: string;
  deletedBranches: string[];
  hadUncommittedChanges: boolean;
  hadUntrackedFiles: boolean;
}

/**
 * Prepare workspace for edit operations by ensuring a clean, synced state
 *
 * This is a destructive operation that:
 * - Discards ALL uncommitted changes (staged and unstaged)
 * - Removes ALL untracked files and directories
 * - Switches to and syncs with the target/default branch
 * - Deletes ALL local branches except the target branch
 *
 * @param workspacePath - Path to the git workspace
 * @param targetBranch - Optional target branch (defaults to remote default branch)
 */
export async function prepareWorkspaceForEdit(
  workspacePath: FilePath,
  targetBranch?: string
): Promise<AsyncResult<PrepareWorkspaceResult>> {
  try {
    const git = createSandboxedGit(workspacePath);
    const result: PrepareWorkspaceResult = {
      targetBranch: '',
      deletedBranches: [],
      hadUncommittedChanges: false,
      hadUntrackedFiles: false,
    };

    console.log(`[GIT PREPARE] Starting workspace preparation for: ${workspacePath}`);

    // Step 1: Determine target branch
    let effectiveTargetBranch = targetBranch;
    if (!effectiveTargetBranch) {
      const defaultBranchResult = await getDefaultBranch(workspacePath);
      if (!defaultBranchResult.success) {
        return {
          success: false,
          error: new Error(
            `Failed to determine default branch: ${defaultBranchResult.error?.message}`
          ),
        };
      }
      effectiveTargetBranch = defaultBranchResult.data;
    }
    result.targetBranch = effectiveTargetBranch;
    console.log(`[GIT PREPARE] Target branch: ${effectiveTargetBranch}`);

    // Step 2: Check for uncommitted changes before discarding
    try {
      const status = await git.status();
      result.hadUncommittedChanges =
        status.modified.length > 0 ||
        status.staged.length > 0 ||
        status.deleted.length > 0 ||
        status.renamed.length > 0;
      result.hadUntrackedFiles = status.not_added.length > 0;

      if (result.hadUncommittedChanges) {
        console.log(
          `[GIT PREPARE] Found uncommitted changes: ${status.modified.length} modified, ${status.staged.length} staged, ${status.deleted.length} deleted`
        );
      }
      if (result.hadUntrackedFiles) {
        console.log(`[GIT PREPARE] Found ${status.not_added.length} untracked files`);
      }
    } catch (error) {
      console.warn(`[GIT PREPARE] Could not check status: ${error}`);
    }

    // Step 3: Hard reset to discard all uncommitted changes
    console.log(`[GIT PREPARE] Discarding all uncommitted changes...`);
    await git.reset(['--hard', 'HEAD']);

    // Step 4: Clean all untracked files and directories
    console.log(`[GIT PREPARE] Removing all untracked files...`);
    await git.clean(CleanOptions.FORCE + CleanOptions.RECURSIVE + CleanOptions.IGNORED_INCLUDED);

    // Step 5: Fetch all remotes
    console.log(`[GIT PREPARE] Fetching from remote...`);
    await git.fetch(['--all', '--prune']);

    // Step 6: Checkout target branch (create from remote if needed)
    console.log(`[GIT PREPARE] Switching to target branch: ${effectiveTargetBranch}`);
    try {
      // First try to checkout existing branch
      await git.checkout(effectiveTargetBranch);
    } catch {
      // If that fails, try to create from remote
      try {
        await git.checkout(['-b', effectiveTargetBranch, `origin/${effectiveTargetBranch}`]);
      } catch (error) {
        return {
          success: false,
          error: new Error(`Failed to checkout target branch ${effectiveTargetBranch}: ${error}`),
        };
      }
    }

    // Step 7: Reset target branch to match remote exactly
    console.log(`[GIT PREPARE] Syncing with origin/${effectiveTargetBranch}...`);
    try {
      await git.reset(['--hard', `origin/${effectiveTargetBranch}`]);
    } catch (error) {
      console.warn(`[GIT PREPARE] Could not reset to origin/${effectiveTargetBranch}: ${error}`);
      // Continue anyway - we're on the target branch at least
    }

    // Step 8: Delete all local branches except target
    console.log(`[GIT PREPARE] Cleaning up local branches...`);
    const localBranchesResult = await getLocalBranches(workspacePath);
    if (localBranchesResult.success) {
      for (const branchName of localBranchesResult.data) {
        // Skip the target branch
        if (branchName === effectiveTargetBranch) {
          continue;
        }

        // Skip if it's the current branch (shouldn't happen but safety check)
        if (branchName.startsWith('*')) {
          continue;
        }

        console.log(`[GIT PREPARE] Deleting local branch: ${branchName}`);
        const deleteResult = await deleteBranch(workspacePath, branchName, true);
        if (deleteResult.success) {
          result.deletedBranches.push(branchName);
        } else {
          console.warn(
            `[GIT PREPARE] Failed to delete branch ${branchName}: ${deleteResult.error?.message}`
          );
        }
      }
    }

    console.log(
      `[GIT PREPARE] Workspace prepared successfully. Deleted ${result.deletedBranches.length} branches.`
    );

    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to prepare workspace: ${error}`),
    };
  }
}
