/**
 * Repository Manager - Core repository operations and workspace management
 */

import { nanoid } from 'nanoid';
import { join } from 'node:path';
import { mkdir, rm, access } from 'node:fs/promises';
import { GitOperations, type GitCloneOptions } from '@/utils/gitOperations.js';
import { CacheManager } from '@/managers/CacheManager.js';
import type { WorkspaceManager } from '@/managers/WorkspaceManager.js';
import { getWorkspaceBaseDir } from '@/config/settings.js';
import type {
  Workspace,
  WorkspaceId,
  GitUrl,
  FilePath,
  AsyncResult,
  WorkspaceMetadata,
  CommitHash
} from '@/types/index.js';

export interface CloneRepositoryOptions extends GitCloneOptions {
  workspaceId?: WorkspaceId;
  tags?: string[];
}

/**
 * Manages repository operations and workspace lifecycle
 */
export class RepositoryManager {
  private workspaces = new Map<WorkspaceId, Workspace>();
  private gitOps: GitOperations;

  constructor(
    private cacheManager: CacheManager,
    private workspaceManager?: WorkspaceManager // Will be injected from index.ts
  ) {
    this.gitOps = new GitOperations();
  }

  /**
   * Clone a repository to a new workspace
   */
  async cloneRepository(
    repoUrl: GitUrl,
    options: CloneRepositoryOptions = {}
  ): Promise<AsyncResult<Workspace>> {
    try {
      // Check for existing workspace with same repo and branch
      const duplicateCheck = await this.checkForDuplicateWorkspace(repoUrl, options.branch);
      if (duplicateCheck.success && duplicateCheck.data) {
        return {
          success: false,
          error: new Error(`Workspace already exists for ${repoUrl} on branch ${duplicateCheck.data.branch} (ID: ${duplicateCheck.data.id}). Use existing workspace or clean it first.`)
        };
      }
      
      // Generate workspace ID
      const workspaceId = options.workspaceId || (nanoid(10) as WorkspaceId);
      
      // Create workspace directory
      const workspaceBaseDir = getWorkspaceBaseDir();
      const workspacePath = join(workspaceBaseDir, `workspace-${workspaceId}`) as FilePath;
      
      // Ensure base directory exists
      await mkdir(workspaceBaseDir, { recursive: true });
      
      // Validate Git URL
      if (!GitOperations.validateGitUrl(repoUrl)) {
        return {
          success: false,
          error: new Error(`Invalid Git URL: ${repoUrl}`)
        };
      }

      // Clone repository
      const cloneResult = await this.gitOps.cloneRepository(repoUrl, workspacePath, {
        ...(options.branch && { branch: options.branch }),
        depth: options.depth || 1,
        singleBranch: options.singleBranch !== false
      });

      if (!cloneResult.success) {
        return cloneResult;
      }

      // Get actual current branch (in case Git auto-selected default branch)
      const currentBranchResult = await this.gitOps.getCurrentBranch(workspacePath);
      if (!currentBranchResult.success) {
        return {
          success: false,
          error: new Error(`Failed to get current branch: ${currentBranchResult.error.message}`)
        };
      }
      const actualBranch = currentBranchResult.data;

      // Get commit hash
      const commitResult = await this.gitOps.getCurrentCommitHash(workspacePath);
      if (!commitResult.success) {
        return {
          success: false,
          error: new Error(`Failed to get commit hash: ${commitResult.error.message}`)
        };
      }

      // Calculate workspace size
      const size = await this.calculateWorkspaceSize(workspacePath);

      // Create workspace object
      const workspace: Workspace = {
        id: workspaceId,
        path: workspacePath,
        repoUrl,
        branch: actualBranch, // Use the actual current branch
        createdAt: new Date(),
        lastAccessed: new Date(),
        metadata: {
          size,
          commitHash: commitResult.data,
          isActive: true,
          ...(options.tags && { tags: options.tags })
        }
      };

      // Store workspace
      this.workspaces.set(workspaceId, workspace);

      // Perform initial directory analysis and cache it
      const analysisResult = await this.cacheManager.analyzeDirectory(workspacePath);
      if (analysisResult.success) {
        await this.cacheManager.setCache(
          workspacePath,
          analysisResult.data,
          commitResult.data
        );
      }

      return { success: true, data: workspace };

    } catch (error) {
      return {
        success: false,
        error: new Error(`Failed to clone repository: ${error}`)
      };
    }
  }

  /**
   * Get workspace by ID
   */
  getWorkspace(workspaceId: WorkspaceId): Workspace | null {
    const workspace = this.workspaces.get(workspaceId);
    if (workspace) {
      // Update last accessed time
      workspace.lastAccessed = new Date();
      this.workspaces.set(workspaceId, workspace);
    }
    return workspace || null;
  }

  /**
   * List all workspaces
   */
  listWorkspaces(): Workspace[] {
    return Array.from(this.workspaces.values()).sort(
      (a, b) => b.lastAccessed.getTime() - a.lastAccessed.getTime()
    );
  }

  /**
   * Load all workspaces from persistent storage into memory
   */
  async loadAllWorkspacesFromStorage(): Promise<AsyncResult<void>> {
    try {
      if (!this.workspaceManager) {
        return { success: true, data: undefined };
      }

      const allWorkspacesResult = await this.workspaceManager.getAllWorkspaces();
      if (!allWorkspacesResult.success) {
        return allWorkspacesResult;
      }

      // Load all workspaces into memory
      for (const workspace of allWorkspacesResult.data) {
        this.workspaces.set(workspace.id, workspace);
      }

      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: new Error(`Failed to load workspaces from storage: ${error}`)
      };
    }
  }

  /**
   * Get active workspaces only
   */
  getActiveWorkspaces(): Workspace[] {
    return this.listWorkspaces().filter(ws => ws.metadata?.isActive);
  }

  /**
   * Update workspace metadata
   */
  async updateWorkspace(
    workspaceId: WorkspaceId,
    updates: Partial<Pick<Workspace, 'branch'>> & {
      metadata?: Partial<WorkspaceMetadata>;
    }
  ): Promise<AsyncResult<Workspace>> {
    try {
      const workspace = this.workspaces.get(workspaceId);
      if (!workspace) {
        return {
          success: false,
          error: new Error(`Workspace ${workspaceId} not found`)
        };
      }

      // Update workspace
      const updatedWorkspace: Workspace = {
        ...workspace,
        ...updates,
        lastAccessed: new Date(),
        metadata: {
          ...workspace.metadata,
          ...updates.metadata
        } as WorkspaceMetadata
      };

      this.workspaces.set(workspaceId, updatedWorkspace);
      return { success: true, data: updatedWorkspace };

    } catch (error) {
      return {
        success: false,
        error: new Error(`Failed to update workspace: ${error}`)
      };
    }
  }

  /**
   * Switch to a different branch
   */
  async switchBranch(
    workspaceId: WorkspaceId,
    branchName: string
  ): Promise<AsyncResult<void>> {
    try {
      const workspace = this.getWorkspace(workspaceId);
      if (!workspace) {
        return {
          success: false,
          error: new Error(`Workspace ${workspaceId} not found`)
        };
      }

      // Switch branch using git operations
      const switchResult = await this.gitOps.switchBranch(workspace.path, branchName);
      if (!switchResult.success) {
        return switchResult;
      }

      // Update workspace branch
      await this.updateWorkspace(workspaceId, { branch: branchName });

      // Invalidate cache since branch changed
      await this.cacheManager.invalidateCache(workspace.path);

      return { success: true, data: undefined };

    } catch (error) {
      return {
        success: false,
        error: new Error(`Failed to switch branch: ${error}`)
      };
    }
  }

  /**
   * Pull latest changes
   */
  async pullChanges(workspaceId: WorkspaceId): Promise<AsyncResult<void>> {
    try {
      const workspace = this.getWorkspace(workspaceId);
      if (!workspace) {
        return {
          success: false,
          error: new Error(`Workspace ${workspaceId} not found`)
        };
      }

      // Pull changes
      const pullResult = await this.gitOps.pullChanges(workspace.path);
      if (!pullResult.success) {
        return pullResult;
      }

      // Update commit hash
      const commitResult = await this.gitOps.getCurrentCommitHash(workspace.path);
      if (commitResult.success) {
        await this.updateWorkspace(workspaceId, {
          metadata: { commitHash: commitResult.data }
        });

        // Invalidate cache since content changed
        await this.cacheManager.invalidateCache(workspace.path);
      }

      return { success: true, data: undefined };

    } catch (error) {
      return {
        success: false,
        error: new Error(`Failed to pull changes: ${error}`)
      };
    }
  }

  /**
   * Clean up workspace
   */
  async cleanupWorkspace(workspaceId: WorkspaceId): Promise<AsyncResult<void>> {
    try {
      let workspace = this.workspaces.get(workspaceId);
      
      // If not in memory, try to load from WorkspaceManager
      if (!workspace && this.workspaceManager) {
        const loadResult = await this.workspaceManager.loadWorkspace(workspaceId);
        if (loadResult.success) {
          workspace = loadResult.data;
        }
      }
      
      // If still not found, try to construct path based on workspace ID
      if (!workspace) {
        const workspaceBaseDir = getWorkspaceBaseDir();
        const workspacePath = join(workspaceBaseDir, `workspace-${workspaceId}`) as FilePath;
        
        // Check if directory exists
        try {
          await access(workspacePath);
          // Directory exists, create a minimal workspace object for cleanup
          workspace = {
            id: workspaceId,
            path: workspacePath,
            repoUrl: 'unknown' as GitUrl,
            branch: 'unknown',
            createdAt: new Date(),
            lastAccessed: new Date()
          };
        } catch {
          return {
            success: false,
            error: new Error(`Workspace ${workspaceId} not found in memory, persistent storage, or file system`)
          };
        }
      }

      // Remove workspace directory
      try {
        await access(workspace.path);
        await rm(workspace.path, { recursive: true, force: true });
      } catch (error) {
        // Log warning but don't fail - directory might already be gone
        console.warn(`Warning: Could not remove directory ${workspace.path}:`, error);
      }

      // Remove from memory if it was there
      this.workspaces.delete(workspaceId);

      return { success: true, data: undefined };

    } catch (error) {
      return {
        success: false,
        error: new Error(`Failed to cleanup workspace: ${error}`)
      };
    }
  }

  /**
   * Clean up all inactive workspaces
   */
  async cleanupInactiveWorkspaces(): Promise<AsyncResult<number>> {
    try {
      let cleanedCount = 0;
      
      // Get workspaces from WorkspaceManager if available, otherwise use in-memory
      let workspaces: Workspace[] = [];
      
      if (this.workspaceManager) {
        const allWorkspacesResult = await this.workspaceManager.getAllWorkspaces();
        if (allWorkspacesResult.success) {
          workspaces = allWorkspacesResult.data.filter(ws => !ws.metadata?.isActive);
        } else {
          workspaces = this.listWorkspaces().filter(ws => !ws.metadata?.isActive);
        }
      } else {
        workspaces = this.listWorkspaces().filter(ws => !ws.metadata?.isActive);
      }

      for (const workspace of workspaces) {
        const result = await this.cleanupWorkspace(workspace.id);
        if (result.success) {
          cleanedCount++;
        }
      }

      return { success: true, data: cleanedCount };

    } catch (error) {
      return {
        success: false,
        error: new Error(`Failed to cleanup inactive workspaces: ${error}`)
      };
    }
  }

  /**
   * Get Git operations instance for a workspace
   */
  getGitOperations(workspacePath: FilePath): GitOperations {
    return new GitOperations(workspacePath);
  }

  /**
   * Calculate total size of workspace directory
   */
  private async calculateWorkspaceSize(directoryPath: FilePath): Promise<number> {
    try {
      const analysisResult = await this.cacheManager.analyzeDirectory(directoryPath);
      if (analysisResult.success) {
        // Estimate size based on file count (rough approximation)
        return analysisResult.data.fileCount * 1024; // 1KB average per file
      }
      return 0;
    } catch {
      return 0;
    }
  }

  /**
   * Check for existing workspace with same repository and branch
   */
  private async checkForDuplicateWorkspace(
    repoUrl: GitUrl, 
    targetBranch?: string
  ): Promise<AsyncResult<Workspace | null>> {
    try {
      // Skip duplicate check if no WorkspaceManager is available
      if (!this.workspaceManager) {
        return { success: true, data: null };
      }
      
      const existingWorkspacesResult = await this.workspaceManager.getAllWorkspaces();
      if (!existingWorkspacesResult.success) {
        return existingWorkspacesResult;
      }
      
      const existingWorkspaces = existingWorkspacesResult.data;
      
      // Find duplicate workspace
      for (const workspace of existingWorkspaces) {
        // Check if same repository URL
        if (workspace.repoUrl === repoUrl) {
          // If no target branch specified, check if we can get the default branch
          if (!targetBranch) {
            // For auto-detect case, we'll skip duplicate check since we don't know the target branch yet
            continue;
          }
          
          // Check if same branch
          if (workspace.branch === targetBranch) {
            // Additional check: see if it's the same commit (to avoid duplicate work)
            try {
              const currentCommitResult = await this.gitOps.getCurrentCommitHash(workspace.path);
              if (currentCommitResult.success && workspace.metadata?.commitHash === currentCommitResult.data) {
                return { success: true, data: workspace };
              }
            } catch {
              // If we can't check commit (e.g., directory doesn't exist), still consider it a duplicate
              return { success: true, data: workspace };
            }
          }
        }
      }
      
      return { success: true, data: null };
    } catch (error) {
      return {
        success: false,
        error: new Error(`Failed to check for duplicate workspace: ${error}`)
      };
    }
  }

  /**
   * Get workspace statistics
   */
  getWorkspaceStats(): {
    total: number;
    active: number;
    inactive: number;
    totalSize: number;
  } {
    const all = this.listWorkspaces();
    const active = all.filter(ws => ws.metadata?.isActive);
    const totalSize = all.reduce((sum, ws) => sum + (ws.metadata?.size || 0), 0);

    return {
      total: all.length,
      active: active.length,
      inactive: all.length - active.length,
      totalSize
    };
  }
} 