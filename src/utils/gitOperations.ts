/**
 * Git operations utilities
 */

import { simpleGit, SimpleGit, CleanOptions } from 'simple-git';
import { resolve, join } from 'path';
import { mkdir, rmdir, stat } from 'fs/promises';
import type { GitUrl, FilePath, CommitHash, AsyncResult } from '@/types/index';

export interface GitCloneOptions {
  branch?: string;
  depth?: number;
  singleBranch?: boolean;
  bare?: boolean;
}

export interface GitCommitInfo {
  hash: CommitHash;
  message: string;
  author: string;
  date: Date;
}

export interface GitBranchInfo {
  name: string;
  isRemote: boolean;
  isCurrent: boolean;
  commitHash: CommitHash;
}

/**
 * Git operations manager
 */
export class GitOperations {
  private git: SimpleGit;

  constructor(workingDirectory?: string) {
    this.git = simpleGit(workingDirectory || process.cwd());
  }

  /**
   * Clone a repository to a local directory
   */
  async cloneRepository(
    repoUrl: GitUrl, 
    targetPath: FilePath,
    options: GitCloneOptions = {}
  ): Promise<AsyncResult<void>> {
    try {
      // Ensure target directory exists
      await this.ensureDirectoryExists(targetPath);

      const cloneOptions: string[] = [];

      if (options.depth) {
        cloneOptions.push('--depth', options.depth.toString());
      }

      if (options.singleBranch) {
        cloneOptions.push('--single-branch');
      }

      if (options.branch) {
        cloneOptions.push('--branch', options.branch);
      }

      if (options.bare) {
        cloneOptions.push('--bare');
      }

      await this.git.clone(repoUrl, targetPath, cloneOptions);

      // Add to Git safe directories to prevent ownership issues
      await this.addToSafeDirectory(targetPath);

      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: new Error(`Failed to clone repository: ${error}`)
      };
    }
  }

  /**
   * Get current commit hash
   */
  async getCurrentCommitHash(workspacePath: FilePath): Promise<AsyncResult<CommitHash>> {
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
   * Get current branch name
   */
  async getCurrentBranch(workspacePath: FilePath): Promise<AsyncResult<string>> {
    try {
      const git = simpleGit(workspacePath);
      
      // Try to add to safe directory first if we get an ownership error
      try {
        const status = await git.status();
        const currentBranch = status.current;

        if (!currentBranch) {
          return {
            success: false,
            error: new Error('No current branch found (detached HEAD?)')
          };
        }

        return { success: true, data: currentBranch };
      } catch (error) {
        // If it's an ownership error, try adding to safe directory and retry
        if (String(error).includes('dubious ownership')) {
          await this.addToSafeDirectory(workspacePath);
          
          // Retry after adding to safe directory
          const status = await git.status();
          const currentBranch = status.current;

          if (!currentBranch) {
            return {
              success: false,
              error: new Error('No current branch found (detached HEAD?)')
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
        error: new Error(`Failed to get current branch: ${error}`)
      };
    }
  }

  /**
   * Get commit information
   */
  async getCommitInfo(workspacePath: FilePath, commitHash?: CommitHash): Promise<AsyncResult<GitCommitInfo>> {
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
   * Get all branches
   */
  async getBranches(workspacePath: FilePath): Promise<AsyncResult<GitBranchInfo[]>> {
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
          commitHash: branchData.commit as CommitHash
        });
      }

      return { success: true, data: branchInfo };
    } catch (error) {
      return {
        success: false,
        error: new Error(`Failed to get branches: ${error}`)
      };
    }
  }

  /**
   * Switch to a different branch
   */
  async switchBranch(workspacePath: FilePath, branchName: string): Promise<AsyncResult<void>> {
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
        error: new Error(`Failed to switch branch: ${error}`)
      };
    }
  }

  /**
   * Pull latest changes from remote
   */
  async pullChanges(workspacePath: FilePath): Promise<AsyncResult<void>> {
    try {
      const git = simpleGit(workspacePath);
      await git.pull();

      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: new Error(`Failed to pull changes: ${error}`)
      };
    }
  }

  /**
   * Check if directory is a Git repository
   */
  async isGitRepository(directoryPath: FilePath): Promise<boolean> {
    try {
      const git = simpleGit(directoryPath);
      await git.status();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get repository status
   */
  async getStatus(workspacePath: FilePath): Promise<AsyncResult<{
    isClean: boolean;
    staged: string[];
    modified: string[];
    untracked: string[];
  }>> {
    try {
      const git = simpleGit(workspacePath);
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
  async getRemoteUrl(workspacePath: FilePath, remoteName = 'origin'): Promise<AsyncResult<GitUrl>> {
    try {
      const git = simpleGit(workspacePath);
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
   * Clean workspace (remove untracked files and directories)
   */
  async cleanWorkspace(workspacePath: FilePath, force = false): Promise<AsyncResult<void>> {
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
  async resetWorkspace(workspacePath: FilePath, hard = false): Promise<AsyncResult<void>> {
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

  /**
   * Ensure directory exists
   */
  private async ensureDirectoryExists(directoryPath: FilePath): Promise<void> {
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
  static validateGitUrl(url: string): boolean {
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
  static extractRepoName(url: GitUrl): string {
    const urlStr = url.toString();
    const parts = urlStr.split('/');
    const lastPart = parts[parts.length - 1] || '';
    
    // Remove .git extension if present
    return lastPart.replace(/\.git$/, '') || 'unknown-repo';
  }

  /**
   * Generate safe directory name from repository URL
   */
  static generateSafeDirName(url: GitUrl, branch?: string): string {
    const repoName = GitOperations.extractRepoName(url);
    const safeName = repoName.replace(/[^a-zA-Z0-9-_]/g, '-');
    
    if (branch && branch !== 'main' && branch !== 'master') {
      return `${safeName}-${branch.replace(/[^a-zA-Z0-9-_]/g, '-')}`;
    }
    
    return safeName;
  }

  /**
   * Add directory to Git safe directories to prevent ownership issues
   */
  private async addToSafeDirectory(directoryPath: FilePath): Promise<void> {
    try {
      await this.git.raw(['config', '--global', '--add', 'safe.directory', directoryPath]);
    } catch (error) {
      // Non-fatal error - log but don't fail the operation
      console.warn(`Warning: Could not add ${directoryPath} to Git safe directories:`, error);
    }
  }
} 