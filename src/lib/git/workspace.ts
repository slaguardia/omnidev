'use server';

/**
 * Git workspace operations - cleaning, resetting workspace
 */

import { simpleGit, CleanOptions } from 'simple-git';
import type { FilePath, AsyncResult } from '@/lib/common/types';

/**
 * Clean workspace (remove untracked files and directories)
 */
export async function cleanWorkspace(workspacePath: FilePath, force = false): Promise<AsyncResult<void>> {
  try {
    const git = simpleGit(workspacePath);
    
    if (force) {
      await git.clean(CleanOptions.FORCE + CleanOptions.RECURSIVE);
    } else {
      await git.clean(CleanOptions.DRY_RUN + CleanOptions.RECURSIVE);
    }

    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to clean workspace: ${error}`)
    };
  }
}

/**
 * Reset workspace to last commit
 */
export async function resetWorkspace(workspacePath: FilePath, hard = false): Promise<AsyncResult<void>> {
  try {
    const git = simpleGit(workspacePath);
    
    if (hard) {
      await git.reset(['--hard', 'HEAD']);
    } else {
      await git.reset(['HEAD']);
    }

    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to reset workspace: ${error}`)
    };
  }
} 