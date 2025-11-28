'use server';

/**
 * Git branch operations - creating, switching, deleting, listing branches
 */

import { simpleGit } from 'simple-git';
import type { FilePath, AsyncResult, CommitHash } from '@/lib/common/types';
import type { GitBranchInfo } from '@/lib/git/types';

/**
 * Add directory to Git safe directories to prevent ownership issues
 */
async function addToSafeDirectory(directoryPath: FilePath): Promise<void> {
  try {
    const git = simpleGit();
    await git.raw(['config', '--global', '--add', 'safe.directory', directoryPath]);
  } catch (error) {
    // Non-fatal error - log but don't fail the operation
    console.warn(`Warning: Could not add ${directoryPath} to Git safe directories:`, error);
  }
}

/**
 * Get current branch name
 */
export async function getCurrentBranch(workspacePath: FilePath): Promise<AsyncResult<string>> {
  try {
    const git = simpleGit(workspacePath);

    // Try to add to safe directory first if we get an ownership error
    try {
      const status = await git.status();
      const currentBranch = status.current;

      if (!currentBranch) {
        return {
          success: false,
          error: new Error('No current branch found (detached HEAD?)'),
        };
      }

      return { success: true, data: currentBranch };
    } catch (error) {
      // If it's an ownership error, try adding to safe directory and retry
      if (String(error).includes('dubious ownership')) {
        await addToSafeDirectory(workspacePath);

        // Retry after adding to safe directory
        const status = await git.status();
        const currentBranch = status.current;

        if (!currentBranch) {
          return {
            success: false,
            error: new Error('No current branch found (detached HEAD?)'),
          };
        }

        return { success: true, data: currentBranch };
      }

      // Re-throw if it's not an ownership error
      throw error;
    }
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to get current branch: ${error}`),
    };
  }
}

/**
 * Get all local branches
 */
export async function getBranches(workspacePath: FilePath): Promise<AsyncResult<GitBranchInfo[]>> {
  try {
    const git = simpleGit(workspacePath);
    const branches = await git.branch(['--all']);

    const branchInfo: GitBranchInfo[] = [];

    for (const [branchName, branchData] of Object.entries(branches.branches)) {
      if (branchName === 'HEAD') continue;

      branchInfo.push({
        name: branchName,
        isRemote: branchName.startsWith('remotes/'),
        isCurrent: branchData.current,
        commitHash: branchData.commit as CommitHash,
      });
    }

    return { success: true, data: branchInfo };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to get branches: ${error}`),
    };
  }
}

/**
 * Get the default branch
 */
export async function getDefaultBranch(workspacePath: FilePath): Promise<AsyncResult<string>> {
  try {
    const git = simpleGit(workspacePath);

    // Use git remote show origin (most reliable method)
    try {
      const remoteOutput = await git.raw(['remote', 'show', 'origin']);
      const headBranchMatch = remoteOutput.match(/HEAD branch:\s*(.+)/);
      if (headBranchMatch && headBranchMatch[1]) {
        return { success: true, data: headBranchMatch[1].trim() };
      }
    } catch {
      // Fallback to common defaults
    }

    // Simple fallback: check for main or master
    const branches = await git.raw(['ls-remote', '--heads', 'origin']);
    if (branches.includes('refs/heads/main')) {
      return { success: true, data: 'main' };
    }
    if (branches.includes('refs/heads/master')) {
      return { success: true, data: 'master' };
    }

    return {
      success: false,
      error: new Error('Could not determine default branch'),
    };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to get default branch: ${error}`),
    };
  }
}

/**
 * Get local branches only
 */
export async function getLocalBranches(workspacePath: FilePath): Promise<AsyncResult<string[]>> {
  try {
    const git = simpleGit(workspacePath);
    const branches = await git.branch();

    const localBranches = Object.keys(branches.branches)
      .filter((branchName) => !branchName.startsWith('remotes/'))
      .map((branchName) => branchName.trim());

    return { success: true, data: localBranches };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to get local branches: ${error}`),
    };
  }
}

/**
 * Get all remote branches for branch selection UI
 */
export async function getAllRemoteBranches(
  workspacePath: FilePath
): Promise<AsyncResult<string[]>> {
  try {
    const git = simpleGit(workspacePath);

    // Get remote branches using ls-remote
    const remoteBranchesOutput = await git.raw(['ls-remote', '--heads', 'origin']);
    const remoteBranchNames = remoteBranchesOutput
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        // Extract branch name from "hash refs/heads/branch-name"
        const match = line.match(/refs\/heads\/(.+)$/);
        return match ? match[1] : null;
      })
      .filter((branch): branch is string => branch !== null);

    // Deduplicate branches
    const uniqueBranches = Array.from(new Set(remoteBranchNames));

    return { success: true, data: uniqueBranches };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to get all branches: ${error}`),
    };
  }
}

/**
 * Delete a local branch
 */
export async function deleteBranch(
  workspacePath: FilePath,
  branchName: string,
  force = false
): Promise<AsyncResult<void>> {
  try {
    const git = simpleGit(workspacePath);

    // Use -D for force delete, -d for normal delete
    const deleteFlag = force ? '-D' : '-d';
    await git.branch([deleteFlag, branchName]);

    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to delete branch ${branchName}: ${error}`),
    };
  }
}

/**
 * Switch to a different branch
 */
export async function switchBranch(
  workspacePath: FilePath,
  branchName: string
): Promise<AsyncResult<void>> {
  try {
    const git = simpleGit(workspacePath);

    // Check if branch exists locally
    const branches = await git.branch();
    const localBranches = Object.keys(branches.branches);

    if (localBranches.includes(branchName)) {
      // Switch to existing local branch
      await git.checkout(branchName);
    } else {
      // Create and switch to new branch from remote
      await git.checkoutLocalBranch(branchName);
    }

    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to switch branch: ${error}`),
    };
  }
}

/**
 * Cleanup branches (remove merged branches and local branches that are not remote)
 * Note: this function is called when the code is on the target branch
 */
export async function cleanBranches(
  workspacePath: FilePath,
  targetBranch: string
): Promise<AsyncResult<void>> {
  try {
    console.log('[GIT WORKFLOW] Cleaning branches...');
    const git = simpleGit(workspacePath);

    // Get current branch to avoid deleting it
    const currentBranch = await git.revparse(['--abbrev-ref', 'HEAD']);

    const localBranches = await git.branch();
    const remoteBranches = await getAllRemoteBranches(workspacePath);
    // Only proceed if we can get remote branches
    if (!remoteBranches.success) {
      return { success: false, error: remoteBranches.error };
    }

    // Helper function to parse branch name from remote reference
    const parseBranchName = (branchName: string): string => {
      // Remove remotes/origin/ prefix if present
      return branchName.replace(/^remotes\/origin\//, '');
    };

    // Create set of protected branch names (parsed)
    const protectedBranchNames = new Set([
      currentBranch,
      targetBranch,
      ...remoteBranches.data.map(parseBranchName),
    ]);

    // Delete safe branches that meet criteria
    for (const branchName of Object.keys(localBranches.branches || {})) {
      const branch = localBranches.branches?.[branchName];

      // Skip remote tracking branches (can't be deleted with git branch -D)
      if (branchName.startsWith('remotes/')) {
        console.log(`[GIT WORKFLOW] Skipping remote tracking branch: ${branchName}`);
        continue;
      }

      // Parse the actual branch name and check protection
      const parsedBranchName = parseBranchName(branchName);
      const isProtected = branch?.current || protectedBranchNames.has(parsedBranchName);

      // Skip if protected
      if (isProtected) {
        console.log(
          `[GIT WORKFLOW] Branch ${branchName} (${parsedBranchName}) is protected, skipping...`
        );
        continue;
      }

      // Delete branch if it's not protected
      console.log(
        `[GIT WORKFLOW] Local branch ${branchName} (${parsedBranchName}) is not protected, deleting...`
      );
      await deleteBranch(workspacePath, branchName, true);
    }

    return { success: true, data: undefined };
  } catch (error) {
    return { success: false, error: new Error(`Failed to clean branches: ${error}`) };
  }
}

/**
 * Check if a branch is merged into target branch
 */
export async function isBranchMerged(
  workspacePath: FilePath,
  branchName: string,
  targetBranch: string
): Promise<AsyncResult<boolean>> {
  try {
    const git = simpleGit(workspacePath);
    // Check if branch is merged into target
    const mergedBranches = await git.raw(['branch', '--merged', targetBranch]);
    const isMerged = mergedBranches
      .split('\n')
      .map((line) => line.trim().replace(/^\*\s*/, ''))
      .includes(branchName);

    return { success: true, data: isMerged };
  } catch (error) {
    return { success: false, error: new Error(`Failed to check if branch is merged: ${error}`) };
  }
}
