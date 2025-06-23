'use server';

/**
 * Git configuration operations - managing git config settings
 */

import { simpleGit } from 'simple-git';
import type { FilePath, AsyncResult } from '@/lib/types/index';
import type { GitConfig } from '@/lib/git/types';

/**
 * Set local git configuration for the workspace
 */
export async function setWorkspaceGitConfig(
  workspacePath: FilePath,
  config: GitConfig
): Promise<AsyncResult<void>> {
  try {
    const git = simpleGit(workspacePath);
    
    // Set user.email if provided
    if (config.userEmail) {
      await git.raw(['config', 'user.email', config.userEmail]);
    }
    
    // Set user.name if provided
    if (config.userName) {
      await git.raw(['config', 'user.name', config.userName]);
    }
    
    // Set signing key if provided
    if (config.signingKey) {
      await git.raw(['config', 'user.signingkey', config.signingKey]);
    }
    
    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to set git config: ${error}`)
    };
  }
}

/**
 * Get local git configuration for the workspace
 */
export async function getWorkspaceGitConfig(workspacePath: FilePath): Promise<AsyncResult<GitConfig>> {
  try {
    const git = simpleGit(workspacePath);
    const config: GitConfig = {};
    
    // Get user.email
    try {
      const email = await git.raw(['config', '--get', 'user.email']);
      if (email.trim()) {
        config.userEmail = email.trim();
      }
    } catch {
      // Config not set, that's fine
    }
    
    // Get user.name
    try {
      const name = await git.raw(['config', '--get', 'user.name']);
      if (name.trim()) {
        config.userName = name.trim();
      }
    } catch {
      // Config not set, that's fine
    }
    
    // Get signing key
    try {
      const signingKey = await git.raw(['config', '--get', 'user.signingkey']);
      if (signingKey.trim()) {
        config.signingKey = signingKey.trim();
      }
    } catch {
      // Config not set, that's fine
    }
    
    return { success: true, data: config };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to get git config: ${error}`)
    };
  }
}

/**
 * Remove local git configuration for the workspace
 */
export async function unsetWorkspaceGitConfig(
  workspacePath: FilePath,
  keys: ('userEmail' | 'userName' | 'signingKey')[]
): Promise<AsyncResult<void>> {
  try {
    const git = simpleGit(workspacePath);
    
    for (const key of keys) {
      try {
        switch (key) {
          case 'userEmail':
            await git.raw(['config', '--unset', 'user.email']);
            break;
          case 'userName':
            await git.raw(['config', '--unset', 'user.name']);
            break;
          case 'signingKey':
            await git.raw(['config', '--unset', 'user.signingkey']);
            break;
        }
      } catch {
        // Config might not exist, that's fine
      }
    }
    
    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to unset git config: ${error}`)
    };
  }
} 