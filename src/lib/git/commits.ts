'use server';

/**
 * Git commit operations - committing, getting commit info, staging files
 */

import { simpleGit } from 'simple-git';
import type { FilePath, AsyncResult, CommitHash } from '@/lib/types/index';
import type { GitCommitInfo } from '@/lib/git/types';

/**
 * Get current commit hash
 */
export async function getCurrentCommitHash(workspacePath: FilePath): Promise<AsyncResult<CommitHash>> {
  try {
    const git = simpleGit(workspacePath);
    const log = await git.log(['-1', '--format=%H']);
    const hash = log.latest?.hash;

    if (!hash) {
      return {
        success: false,
        error: new Error('No commits found in repository')
      };
    }

    return { success: true, data: hash as CommitHash };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to get commit hash: ${error}`)
    };
  }
}

/**
 * Get commit information
 */
export async function getCommitInfo(workspacePath: FilePath, commitHash?: CommitHash): Promise<AsyncResult<GitCommitInfo>> {
  try {
    const git = simpleGit(workspacePath);
    const log = await git.log(['-1', commitHash || 'HEAD']);
    const commit = log.latest;

    if (!commit) {
      return {
        success: false,
        error: new Error('Commit not found')
      };
    }

    const info: GitCommitInfo = {
      hash: commit.hash as CommitHash,
      message: commit.message,
      author: `${commit.author_name} <${commit.author_email}>`,
      date: new Date(commit.date)
    };

    return { success: true, data: info };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to get commit info: ${error}`)
    };
  }
}

/**
 * Check if there are uncommitted changes (git diff)
 */
export async function hasUncommittedChanges(workspacePath: FilePath): Promise<AsyncResult<boolean>> {
  try {
    const git = simpleGit(workspacePath);
    const status = await git.status();
    
    // Check if there are any modified, added, deleted, or untracked files
    const hasChanges = !status.isClean();
    
    return { success: true, data: hasChanges };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to check for changes: ${error}`)
    };
  }
}

/**
 * Add all files to staging area
 */
export async function addAllFiles(workspacePath: FilePath): Promise<AsyncResult<void>> {
  try {
    const git = simpleGit(workspacePath);
    await git.add('.');
    
    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to add files: ${error}`)
    };
  }
}

/**
 * Commit changes with a message
 */
export async function commitChanges(workspacePath: FilePath, message: string): Promise<AsyncResult<CommitHash>> {
  try {
    const git = simpleGit(workspacePath);
    const commitResult = await git.commit(message);
    
    if (!commitResult.commit) {
      return {
        success: false,
        error: new Error('No commit hash returned')
      };
    }
    
    return { success: true, data: commitResult.commit as CommitHash };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to commit changes: ${error}`)
    };
  }
} 