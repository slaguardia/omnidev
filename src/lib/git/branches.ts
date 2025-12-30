'use server';

/**
 * Git branch operations - creating, switching, deleting, listing branches
 */

import type { FilePath, AsyncResult, CommitHash } from '@/lib/common/types';
import type { GitBranchInfo } from '@/lib/git/types';
import { createSandboxedGit } from '@/lib/git/sandbox';

/**
 * Add directory to Git safe directories to prevent ownership issues
 */
async function addToSafeDirectory(directoryPath: FilePath): Promise<void> {
  try {
    const git = createSandboxedGit();
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
    const git = createSandboxedGit(workspacePath);

    // Add to safe directory first to avoid ownership issues
    await addToSafeDirectory(workspacePath);

    // Try git status first (works for normal checkouts)
    try {
      const status = await git.status();
      if (status.current) {
        return { success: true, data: status.current };
      }
    } catch {
      // Continue to fallback methods
    }

    // Fallback: use rev-parse to get branch name
    try {
      const branch = await git.raw(['rev-parse', '--abbrev-ref', 'HEAD']);
      const branchName = branch.trim();

      // If not detached HEAD, return the branch
      if (branchName && branchName !== 'HEAD') {
        return { success: true, data: branchName };
      }
    } catch {
      // Continue to next fallback
    }

    // Fallback for detached HEAD: check what remote branch we're tracking
    try {
      // Get the commit we're on
      const commit = await git.raw(['rev-parse', 'HEAD']);
      const commitHash = commit.trim();

      // Check which remote branches contain this commit
      const remoteBranches = await git.raw(['branch', '-r', '--contains', commitHash]);
      const branches = remoteBranches
        .split('\n')
        .map((b) => b.trim())
        .filter((b) => b && !b.includes('HEAD'));

      const firstBranch = branches[0];
      if (firstBranch) {
        // Get the first branch, remove 'origin/' prefix
        const remoteBranch = firstBranch.replace(/^origin\//, '');
        console.log('[GIT] Detached HEAD detected, inferred branch from remote:', remoteBranch);

        // Checkout the branch properly to fix detached HEAD
        await git.checkout(remoteBranch);
        return { success: true, data: remoteBranch };
      }
    } catch {
      // Continue to final fallback
    }

    // Final fallback: try to get default branch
    try {
      const defaultBranchResult = await getDefaultBranch(workspacePath);
      if (defaultBranchResult.success) {
        console.log('[GIT] Using default branch as fallback:', defaultBranchResult.data);
        await git.checkout(defaultBranchResult.data);
        return { success: true, data: defaultBranchResult.data };
      }
    } catch {
      // Give up
    }

    return {
      success: false,
      error: new Error('Could not determine current branch'),
    };
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
    const git = createSandboxedGit(workspacePath);
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
    const git = createSandboxedGit(workspacePath);

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
    const git = createSandboxedGit(workspacePath);
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
    const git = createSandboxedGit(workspacePath);

    // Add to safe directory first to avoid ownership issues
    await addToSafeDirectory(workspacePath);

    // Determine whether an 'origin' remote exists. Some workspaces may be local-only.
    let hasOriginRemote = false;
    try {
      const remotesOutput = await git.raw(['remote']);
      const remotes = remotesOutput
        .split('\n')
        .map((r) => r.trim())
        .filter(Boolean);
      hasOriginRemote = remotes.includes('origin');
    } catch {
      // If remote listing fails, we may not even be in a git repo. We'll fall back below.
    }

    // If no origin remote, fall back to local branches instead of hard failing.
    if (!hasOriginRemote) {
      const localBranches = await getLocalBranches(workspacePath);
      if (localBranches.success) {
        const uniqueBranches = Array.from(new Set(localBranches.data)).filter(Boolean);
        return { success: true, data: uniqueBranches };
      }
      // If local branch listing fails too, propagate a clearer error.
      return {
        success: false,
        error: new Error(
          `Failed to get branches: workspace has no 'origin' remote and local branch listing failed: ${localBranches.error}`
        ),
      };
    }

    // Get remote branches using ls-remote (fast, no need to fetch).
    try {
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

      const uniqueBranches = Array.from(new Set(remoteBranchNames)).filter(Boolean);
      if (uniqueBranches.length > 0) {
        return { success: true, data: uniqueBranches };
      }
    } catch (error) {
      // Fall back to local branches below.
      console.warn(
        '[GIT] Failed to list remote branches from origin; falling back to local:',
        error
      );
    }

    // Fallback: local branches (covers cases where origin exists but is temporarily unreachable)
    const localBranches = await getLocalBranches(workspacePath);
    if (localBranches.success) {
      const uniqueBranches = Array.from(new Set(localBranches.data)).filter(Boolean);
      return { success: true, data: uniqueBranches };
    }

    return {
      success: false,
      error: new Error(
        `Failed to get all branches (origin unreachable and local listing failed): ${localBranches.error}`
      ),
    };
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
    const git = createSandboxedGit(workspacePath);

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
 * Switch to a different branch and sync with remote
 *
 * If the branch exists locally, switches to it and syncs with remote (if remote exists).
 * If not, attempts to create it tracking the remote branch (origin/branchName).
 * Falls back to creating from HEAD if remote doesn't exist.
 *
 * Always fetches and syncs to avoid divergence issues.
 */
export async function switchBranch(
  workspacePath: FilePath,
  branchName: string
): Promise<AsyncResult<void>> {
  try {
    const git = createSandboxedGit(workspacePath);

    // Fetch latest from remote first to ensure we have up-to-date refs
    console.log(`[GIT] Fetching latest from remote...`);
    await git.fetch(['--all', '--prune']);

    // Check if branch exists locally
    const branches = await git.branch();
    const localBranches = Object.keys(branches.branches);

    if (localBranches.includes(branchName)) {
      // Switch to existing local branch
      console.log(`[GIT] Switching to existing local branch: ${branchName}`);
      await git.checkout(branchName);

      // Sync with remote if it exists (reset to avoid divergence)
      try {
        await git.raw(['rev-parse', `origin/${branchName}`]);
        console.log(`[GIT] Syncing with origin/${branchName}...`);
        await git.reset(['--hard', `origin/${branchName}`]);
        console.log(`[GIT] ✅ Branch ${branchName} synced with remote`);
      } catch {
        // Remote doesn't exist for this branch, that's okay
        console.log(`[GIT] No remote tracking branch origin/${branchName}, keeping local state`);
      }
    } else {
      // Branch doesn't exist locally - try to create from remote tracking branch
      console.log(`[GIT] Branch ${branchName} not found locally, checking remote...`);

      // First, try to create tracking branch from origin
      try {
        await git.checkout(['-b', branchName, `origin/${branchName}`]);
        console.log(`[GIT] Created local branch ${branchName} tracking origin/${branchName}`);
      } catch {
        // Remote branch doesn't exist, create from HEAD as fallback
        console.log(`[GIT] Remote origin/${branchName} not found, creating from current HEAD`);
        await git.checkoutLocalBranch(branchName);
      }
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
    const git = createSandboxedGit(workspacePath);

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
    const git = createSandboxedGit(workspacePath);
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
