'use server';

/**
 * Git reference synchronization utilities
 *
 * Provides helpers to detect and fix stale local refs that can cause
 * push failures when the remote is updated externally.
 */

import type { SimpleGit } from 'simple-git';

export interface RefSyncResult {
  /** Whether the branch exists on remote */
  branchExists: boolean;
  /** The actual remote commit (full hash), null if branch doesn't exist */
  actualRemoteCommit: string | null;
  /** The local ref commit (full hash), null if ref doesn't exist locally */
  localRefCommit: string | null;
  /** Whether the local ref was stale and needed updating */
  wasStale: boolean;
  /** Whether the ref was successfully updated (only relevant if wasStale) */
  updateSucceeded: boolean;
}

/**
 * Ensure the local remote-tracking ref matches the actual remote state.
 *
 * This function:
 * 1. Uses ls-remote to get the actual remote commit (bypasses local cache)
 * 2. Compares with the local origin/branch ref
 * 3. Forces a ref update if they differ
 *
 * This prevents issues where git fetch fails to update refs, causing
 * stale local refs that lead to incorrect ahead/behind calculations
 * and failed pushes.
 *
 * @param git - The simple-git instance
 * @param branchName - The branch name to sync (without origin/ prefix)
 * @param logPrefix - Prefix for log messages (e.g., "[GIT PUSH]")
 */
export async function ensureFreshRemoteRef(
  git: SimpleGit,
  branchName: string,
  logPrefix: string = '[GIT]'
): Promise<RefSyncResult> {
  const result: RefSyncResult = {
    branchExists: false,
    actualRemoteCommit: null,
    localRefCommit: null,
    wasStale: false,
    updateSucceeded: false,
  };

  // Step 1: Get actual remote state using ls-remote (bypasses local cache)
  try {
    const lsRemote = await git.raw(['ls-remote', 'origin', `refs/heads/${branchName}`]);
    if (lsRemote.trim()) {
      result.branchExists = true;
      result.actualRemoteCommit = lsRemote.split(/\s+/)[0] || null;
    }
  } catch {
    // ls-remote failed, we'll check local ref as fallback
  }

  // If branch doesn't exist on remote, nothing to sync
  if (!result.branchExists) {
    return result;
  }

  // Step 2: Get local ref state
  try {
    const localRef = await git.raw(['rev-parse', `origin/${branchName}`]);
    result.localRefCommit = localRef.trim();
  } catch {
    // Local ref doesn't exist yet
    result.localRefCommit = null;
  }

  // Step 3: Compare and force update if stale
  if (result.actualRemoteCommit && result.localRefCommit !== result.actualRemoteCommit) {
    result.wasStale = true;
    const actualShort = result.actualRemoteCommit.substring(0, 7);
    const localShort = result.localRefCommit?.substring(0, 7) || 'none';

    console.log(
      `${logPrefix} Remote state: actual origin/${branchName}=${actualShort}, local ref=${localShort}`
    );
    console.warn(`${logPrefix} ⚠️ Local ref is stale! Forcing ref update...`);

    try {
      await git.fetch(['origin', `+refs/heads/${branchName}:refs/remotes/origin/${branchName}`]);

      // Verify update worked
      const updatedRef = await git.raw(['rev-parse', `origin/${branchName}`]);
      result.updateSucceeded = updatedRef.trim() === result.actualRemoteCommit;

      console.log(
        `${logPrefix} After force update: origin/${branchName}=${updatedRef.trim().substring(0, 7)} ${result.updateSucceeded ? '✅' : '❌'}`
      );
    } catch (fetchError) {
      console.warn(`${logPrefix} Failed to force update ref: ${fetchError}`);
      result.updateSucceeded = false;
    }
  } else if (result.actualRemoteCommit) {
    // Refs match, log for diagnostics
    const actualShort = result.actualRemoteCommit.substring(0, 7);
    console.log(`${logPrefix} Remote state: origin/${branchName}=${actualShort} (in sync)`);
  }

  return result;
}

/**
 * Verify that HEAD matches the expected remote ref after a sync operation.
 *
 * @param git - The simple-git instance
 * @param branchName - The branch name to verify
 * @param logPrefix - Prefix for log messages
 * @returns true if HEAD matches origin/branch
 */
export async function verifySyncState(
  git: SimpleGit,
  branchName: string,
  logPrefix: string = '[GIT]'
): Promise<boolean> {
  try {
    const localHead = await git.raw(['rev-parse', 'HEAD']);
    const remoteHead = await git.raw(['rev-parse', `origin/${branchName}`]);
    const match = localHead.trim() === remoteHead.trim();

    console.log(
      `${logPrefix} Sync check: local=${localHead.trim().substring(0, 7)}, origin/${branchName}=${remoteHead.trim().substring(0, 7)} ${match ? '✅' : '❌ MISMATCH'}`
    );

    return match;
  } catch (error) {
    console.warn(`${logPrefix} Could not verify sync state: ${error}`);
    return false;
  }
}
