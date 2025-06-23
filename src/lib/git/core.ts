'use server';

/**
 * Core Git operations - repository management, cloning, status, and utilities
 */

import { simpleGit, SimpleGit } from 'simple-git';
import { mkdir, stat } from 'fs/promises';
import type { GitUrl, FilePath, AsyncResult } from '@/lib/types/index';
import type { GitCloneOptions, GitStatus } from '@/lib/git/types';

/**
 * Create a SimpleGit instance for a specific directory
 */
function createGitInstance(workingDirectory?: string): SimpleGit {
  return simpleGit(workingDirectory || process.cwd());
}

/**
 * Clone a repository to a local directory
 */
export async function cloneRepository(
  repoUrl: GitUrl, 
  targetPath: FilePath,
  options: GitCloneOptions = {}
): Promise<AsyncResult<void>> {
  try {
    const git = createGitInstance();
    
    // Ensure target directory exists
    await ensureDirectoryExists(targetPath);

    const cloneOptions: string[] = [];

    if (options.depth) {
      cloneOptions.push('--depth', options.depth.toString());
    }

    if (options.singleBranch) {
      cloneOptions.push('--single-branch');
    }

    if (options.targetBranch) {
      cloneOptions.push('--branch', options.targetBranch);
    }

    if (options.bare) {
      cloneOptions.push('--bare');
    }

    // Prepare authenticated URL if credentials are provided
    let authenticatedUrl = repoUrl;
    if (options.credentials && options.credentials.username && options.credentials.password) {
      authenticatedUrl = await createAuthenticatedUrl(repoUrl, options.credentials);
    }

    await git.clone(authenticatedUrl, targetPath, cloneOptions);

    // Add to Git safe directories to prevent ownership issues
    await addToSafeDirectory(targetPath);

    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to clone repository: ${error}`)
    };
  }
}

/**
 * Check if directory is a Git repository
 */
export async function isGitRepository(directoryPath: FilePath): Promise<boolean> {
  try {
    const git = createGitInstance(directoryPath);
    await git.status();
    return true;
  } catch {
    return false;
  }
}

/**
 * Get repository status
 */
export async function getStatus(workspacePath: FilePath): Promise<AsyncResult<GitStatus>> {
  try {
    const git = createGitInstance(workspacePath);
    const status = await git.status();

    return {
      success: true,
      data: {
        isClean: status.isClean(),
        staged: status.staged,
        modified: status.modified,
        untracked: status.not_added
      }
    };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to get status: ${error}`)
    };
  }
}

/**
 * Get repository remote URL
 */
export async function getRemoteUrl(workspacePath: FilePath, remoteName = 'origin'): Promise<AsyncResult<GitUrl>> {
  try {
    const git = createGitInstance(workspacePath);
    const remotes = await git.getRemotes(true);
    const remote = remotes.find(r => r.name === remoteName);

    if (!remote?.refs?.fetch) {
      return {
        success: false,
        error: new Error(`Remote '${remoteName}' not found`)
      };
    }

    return { success: true, data: remote.refs.fetch as GitUrl };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to get remote URL: ${error}`)
    };
  }
}

/**
 * Ensure directory exists
 */
async function ensureDirectoryExists(directoryPath: FilePath): Promise<void> {
  try {
    await stat(directoryPath);
  } catch {
    // Directory doesn't exist, create it
    await mkdir(directoryPath, { recursive: true });
  }
}

/**
 * Validate Git URL format
 */
export async function validateGitUrl(url: string): Promise<boolean> {
  // Basic Git URL validation
  const gitUrlPatterns = [
    /^https?:\/\/.+\.git$/i,                    // HTTPS
    /^git@.+:.+\.git$/i,                        // SSH
    /^ssh:\/\/git@.+\/.+\.git$/i,              // SSH with protocol
    /^https?:\/\/.+\/.+$/i                      // HTTPS without .git
  ];

  return gitUrlPatterns.some(pattern => pattern.test(url));
}

/**
 * Extract repository name from URL
 */
export async function extractRepoName(url: GitUrl): Promise<string> {
  const urlStr = url.toString();
  const parts = urlStr.split('/');
  const lastPart = parts[parts.length - 1] || '';
  
  // Remove .git extension if present
  return lastPart.replace(/\.git$/, '') || 'unknown-repo';
}

/**
 * Generate safe directory name from repository URL
 */
export async function generateSafeDirName(url: GitUrl, branch?: string): Promise<string> {
  const repoName = await extractRepoName(url);
  const safeName = repoName.replace(/[^a-zA-Z0-9-_]/g, '-');
  
  if (branch && branch !== 'main' && branch !== 'master') {
    return `${safeName}-${branch.replace(/[^a-zA-Z0-9-_]/g, '-')}`;
  }
  
  return safeName;
}

/**
 * Create an authenticated URL for git operations
 */
async function createAuthenticatedUrl(repoUrl: GitUrl, credentials: { username: string; password: string }): Promise<GitUrl> {
  try {
    const url = new URL(repoUrl);
    
    // URL encode the credentials to handle special characters
    const encodedUsername = encodeURIComponent(credentials.username);
    const encodedPassword = encodeURIComponent(credentials.password);
    
    // Create authenticated URL format: https://username:password@host/path
    url.username = encodedUsername;
    url.password = encodedPassword;
    
    return url.toString() as GitUrl;
  } catch (error) {
    // If URL parsing fails, return original URL
    console.warn('Failed to create authenticated URL, using original:', error);
    return repoUrl;
  }
}

/**
 * Add directory to Git safe directories to prevent ownership issues
 */
async function addToSafeDirectory(directoryPath: FilePath): Promise<void> {
  try {
    const git = createGitInstance();
    await git.raw(['config', '--global', '--add', 'safe.directory', directoryPath]);
  } catch (error) {
    // Non-fatal error - log but don't fail the operation
    console.warn(`Warning: Could not add ${directoryPath} to Git safe directories:`, error);
  }
} 