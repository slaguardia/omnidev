/**
 * Git Operations - Main exports
 */

// Export types
export type {
  GitCloneOptions,
  GitCommitInfo,
  GitBranchInfo,
  GitStatus,
  GitConfig,
} from '@/lib/git/types';

// Export provider detection utilities
export {
  detectProviderFromUrl,
  extractGitHubOwnerRepo,
  isGitHubUrl,
  isGitLabUrl,
} from '@/lib/git/provider-detection';

import {
  getCurrentBranch,
  getBranches,
  getDefaultBranch,
  getLocalBranches,
  getAllRemoteBranches,
  deleteBranch,
  switchBranch,
  cleanBranches,
} from '@/lib/git/branches';
import {
  getCurrentCommitHash,
  getCommitInfo,
  hasUncommittedChanges,
  addAllFiles,
  commitChanges,
} from '@/lib/git/commits';
import { pullChanges, pushChanges } from '@/lib/git/remotes';
import { cleanWorkspace, resetWorkspace } from '@/lib/git/workspace';
import {
  setWorkspaceGitConfig,
  getWorkspaceGitConfig,
  unsetWorkspaceGitConfig,
} from '@/lib/git/config';
import { prepareWorkspaceForEdit } from '@/lib/git/prepare';

// Export prepare types and function
export type { PrepareWorkspaceResult } from '@/lib/git/prepare';
export { prepareWorkspaceForEdit };

/**
 * Main Git operations class that provides access to all git operations
 * This maintains backward compatibility with the original monolithic class
 */
export class GitOperations {
  // Branch operations
  async getCurrentBranch(...args: Parameters<typeof getCurrentBranch>) {
    return getCurrentBranch(...args);
  }

  async getBranches(...args: Parameters<typeof getBranches>) {
    return getBranches(...args);
  }

  async getDefaultBranch(...args: Parameters<typeof getDefaultBranch>) {
    return getDefaultBranch(...args);
  }

  async getLocalBranches(...args: Parameters<typeof getLocalBranches>) {
    return getLocalBranches(...args);
  }

  async getAllRemoteBranches(...args: Parameters<typeof getAllRemoteBranches>) {
    return getAllRemoteBranches(...args);
  }

  async deleteBranch(...args: Parameters<typeof deleteBranch>) {
    return deleteBranch(...args);
  }

  async switchBranch(...args: Parameters<typeof switchBranch>) {
    return switchBranch(...args);
  }

  async cleanBranches(...args: Parameters<typeof cleanBranches>) {
    return cleanBranches(...args);
  }

  // Commit operations
  async getCurrentCommitHash(...args: Parameters<typeof getCurrentCommitHash>) {
    return getCurrentCommitHash(...args);
  }

  async getCommitInfo(...args: Parameters<typeof getCommitInfo>) {
    return getCommitInfo(...args);
  }

  async hasUncommittedChanges(...args: Parameters<typeof hasUncommittedChanges>) {
    return hasUncommittedChanges(...args);
  }

  async addAllFiles(...args: Parameters<typeof addAllFiles>) {
    return addAllFiles(...args);
  }

  async commitChanges(...args: Parameters<typeof commitChanges>) {
    return commitChanges(...args);
  }

  // Remote operations
  async pullChanges(...args: Parameters<typeof pullChanges>) {
    return pullChanges(...args);
  }

  async pushChanges(...args: Parameters<typeof pushChanges>) {
    return pushChanges(...args);
  }

  // Workspace operations
  async cleanWorkspace(...args: Parameters<typeof cleanWorkspace>) {
    return cleanWorkspace(...args);
  }

  async resetWorkspace(...args: Parameters<typeof resetWorkspace>) {
    return resetWorkspace(...args);
  }

  // Configuration operations
  async setWorkspaceGitConfig(...args: Parameters<typeof setWorkspaceGitConfig>) {
    return setWorkspaceGitConfig(...args);
  }

  async getWorkspaceGitConfig(...args: Parameters<typeof getWorkspaceGitConfig>) {
    return getWorkspaceGitConfig(...args);
  }

  async unsetWorkspaceGitConfig(...args: Parameters<typeof unsetWorkspaceGitConfig>) {
    return unsetWorkspaceGitConfig(...args);
  }

  // Preparation operations
  async prepareWorkspaceForEdit(...args: Parameters<typeof prepareWorkspaceForEdit>) {
    return prepareWorkspaceForEdit(...args);
  }
}
