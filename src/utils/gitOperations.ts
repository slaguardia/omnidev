/**
 * Git operations utilities
 */

import { simpleGit, SimpleGit, CleanOptions } from 'simple-git';
import { resolve, join } from 'path';
import { mkdir, rmdir, stat } from 'fs/promises';
import type { GitUrl, FilePath, CommitHash, AsyncResult, WorkspaceId } from '@/types/index';

export interface GitCloneOptions {
  targetBranch?: string;
  depth?: number;
  singleBranch?: boolean;
  bare?: boolean;
  credentials?: {
    username: string;
    password: string;
  };
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

      if (options.targetBranch) {
        cloneOptions.push('--branch', options.targetBranch);
      }

      if (options.bare) {
        cloneOptions.push('--bare');
      }

      // Prepare authenticated URL if credentials are provided
      let authenticatedUrl = repoUrl;
      if (options.credentials && options.credentials.username && options.credentials.password) {
        authenticatedUrl = this.createAuthenticatedUrl(repoUrl, options.credentials);
      }

      await this.git.clone(authenticatedUrl, targetPath, cloneOptions);

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
   * Get all local branches
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
   * Get the default branch
   */
  async getDefaultBranch(workspacePath: FilePath): Promise<AsyncResult<string>> {
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
        error: new Error('Could not determine default branch')
      };
      
    } catch (error) {
      return {
        success: false,
        error: new Error(`Failed to get default branch: ${error}`)
      };
    }
  }

  /**
   * Get local branches only
   */
  async getLocalBranches(workspacePath: FilePath): Promise<AsyncResult<string[]>> {
    try {
      const git = simpleGit(workspacePath);
      const branches = await git.branch();

      const localBranches = Object.keys(branches.branches)
        .filter(branchName => !branchName.startsWith('remotes/'))
        .map(branchName => branchName.trim());

      return { success: true, data: localBranches };
    } catch (error) {
      return {
        success: false,
        error: new Error(`Failed to get local branches: ${error}`)
      };
    }
  }

  /**
   * Get all remote branches for branch selection UI
   */
  async getAllRemoteBranches(workspacePath: FilePath): Promise<AsyncResult<string[]>> {
    try {
      const git = simpleGit(workspacePath);

      // Get remote branches using ls-remote
      const remoteBranchesOutput = await git.raw(['ls-remote', '--heads', 'origin']);
      const remoteBranchNames = remoteBranchesOutput
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
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
        error: new Error(`Failed to get all branches: ${error}`)
      };
    }
  }

  /**
   * Delete a local branch
   */
  async deleteBranch(workspacePath: FilePath, branchName: string, force = false): Promise<AsyncResult<void>> {
    try {
      const git = simpleGit(workspacePath);
      
      // Use -D for force delete, -d for normal delete
      const deleteFlag = force ? '-D' : '-d';
      await git.branch([deleteFlag, branchName]);

      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: new Error(`Failed to delete branch ${branchName}: ${error}`)
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
      
      // Fetch all remotes and prune deleted remote branches
      await git.fetch(['--all', '--prune']);
      
      // Pull latest changes from current branch
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
   * Cleanup branches (remove merged branches and local branches that are not remote) note: this function is called when the code is on the target branch
   */
  async cleanBranches(workspacePath: FilePath, targetBranch: string): Promise<AsyncResult<void>> {
    try {
      console.log('[GIT WORKFLOW] Cleaning branches...');
      const git = simpleGit(workspacePath);
      
      // Get current branch to avoid deleting it
      const currentBranch = await git.revparse(['--abbrev-ref', 'HEAD']);
      
      const localBranches = await git.branch();
      const remoteBranches = await this.getAllRemoteBranches(workspacePath);
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
        ...remoteBranches.data.map(parseBranchName)
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
          console.log(`[GIT WORKFLOW] Branch ${branchName} (${parsedBranchName}) is protected, skipping...`);
          continue;
        }

        // Delete branch if it's not protected
        console.log(`[GIT WORKFLOW] Local branch ${branchName} (${parsedBranchName}) is not protected, deleting...`);
        await this.deleteBranch(workspacePath, branchName, true);
      }
      
      return { success: true, data: undefined };
    } catch (error) {
      return { success: false, error: new Error(`Failed to clean branches: ${error}`) };
    }
  }

  /**
   * Check if a branch is merged into target branch
   */
  private async isBranchMerged(workspacePath: FilePath, branchName: string, targetBranch: string): Promise<AsyncResult<boolean>> {
    try {
      const git = simpleGit(workspacePath);
      // Check if branch is merged into target
      const mergedBranches = await git.raw(['branch', '--merged', targetBranch]);
      const isMerged = mergedBranches.split('\n')
        .map(line => line.trim().replace(/^\*\s*/, ''))
        .includes(branchName);
      
      return { success: true, data: isMerged };
    } catch (error) {
      return { success: false, error: new Error(`Failed to check if branch is merged: ${error}`) };
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
   * Create an authenticated URL for git operations
   */
  private createAuthenticatedUrl(repoUrl: GitUrl, credentials: { username: string; password: string }): GitUrl {
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
  private async addToSafeDirectory(directoryPath: FilePath): Promise<void> {
    try {
      await this.git.raw(['config', '--global', '--add', 'safe.directory', directoryPath]);
    } catch (error) {
      // Non-fatal error - log but don't fail the operation
      console.warn(`Warning: Could not add ${directoryPath} to Git safe directories:`, error);
    }
  }

  /**
   * Set local git configuration for the workspace
   */
  async setWorkspaceGitConfig(
    workspacePath: FilePath,
    config: { userEmail?: string; userName?: string; signingKey?: string }
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
   * Check if there are uncommitted changes (git diff)
   */
  async hasUncommittedChanges(workspacePath: FilePath): Promise<AsyncResult<boolean>> {
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
  async addAllFiles(workspacePath: FilePath): Promise<AsyncResult<void>> {
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
  async commitChanges(workspacePath: FilePath, message: string): Promise<AsyncResult<CommitHash>> {
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

  /**
   * Push changes to remote repository
   */
  async pushChanges(workspacePath: FilePath, branch?: string): Promise<AsyncResult<void>> {
    try {
      const git = simpleGit(workspacePath);
      
      if (branch) {
        // Push specific branch
        await git.push('origin', branch);
      } else {
        // Push current branch
        await git.push();
      }
      
      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: new Error(`Failed to push changes: ${error}`)
      };
    }
  }

  /**
   * Get local git configuration for the workspace
   */
  async getWorkspaceGitConfig(workspacePath: FilePath): Promise<AsyncResult<{
    userEmail?: string;
    userName?: string;
    signingKey?: string;
  }>> {
    try {
      const git = simpleGit(workspacePath);
      const config: { userEmail?: string; userName?: string; signingKey?: string } = {};
      
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
  async unsetWorkspaceGitConfig(
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
} 