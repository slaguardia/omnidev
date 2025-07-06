'use server';

import { nanoid } from 'nanoid';
import { join } from 'node:path';
import { mkdir, rm, access } from 'node:fs/promises';
import { 
  cloneRepository as gitCloneRepository, 
  validateGitUrl,
  extractRepoName
} from '@/lib/git/core';
import { getCurrentBranch } from '@/lib/git/branches';
import { getCurrentCommitHash } from '@/lib/git/commits';
import { type GitCloneOptions } from '@/lib/git/types';
import { getWorkspaceBaseDir } from '@/lib/config/server-actions';
import { 
  saveWorkspace, 
  getAllWorkspaces as getStoredWorkspaces,
  loadWorkspace as loadStoredWorkspace,
  initializeWorkspaceStorage
} from './storage';
import type {
  WorkspaceId,
  GitUrl,
  FilePath,
  AsyncResult,
} from '@/lib/common/types';
import type { Workspace, WorkspaceMetadata } from '@/lib/workspace/types';
import type { GitCredentials } from '@/lib/git/types';

export interface GitBranchWorkflowResult {
  mergeRequestRequired: boolean;
  sourceBranch: string;
  targetBranch: string;
}

export interface CloneRepositoryOptions extends GitCloneOptions {
  workspaceId?: WorkspaceId;
  tags?: string[];
}

// In-memory workspace storage for quick access
const workspaces = new Map<WorkspaceId, Workspace>();

/**
 * Get all workspaces (with initialization)
 */
export async function getWorkspaces(): Promise<Workspace[]> {
  try {
    // Initialize workspace storage first
    const initResult = await initializeWorkspaceStorage();
    
    if (!initResult.success) {
      console.error('Failed to initialize workspace storage:', initResult.error);
      return [];
    }

    // Load workspaces from storage
    const loadResult = await loadAllWorkspacesFromStorage();
    
    if (!loadResult.success) {
      console.error('Failed to load workspaces from storage:', loadResult.error);
      return [];
    }

    // Get the workspace list
    const workspaceList = await listWorkspaces();
    
    return workspaceList;
  } catch (error) {
    console.error('Error fetching workspaces:', error);
    return [];
  }
}

/**
 * Clone repository action with full initialization and error handling
 */
export async function cloneRepositoryAction(
  repoUrl: string,
  branch?: string,
  depth: number = 1,
  singleBranch: boolean = true,
  credentials?: { username: string; password: string }
): Promise<{
  success: boolean;
  message: string;
  data?: {
    repoName: string;
    targetPath: string;
    workspaceId: string;
  };
  error?: unknown;
}> {
  try {
    // Validate repository URL
    if (!(await validateGitUrl(repoUrl as GitUrl))) {
      return {
        success: false,
        message: 'Invalid Git repository URL'
      };
    }

    // Initialize workspace storage
    const initResult = await initializeWorkspaceStorage();
    if (!initResult.success) {
      return {
        success: false,
        message: `Failed to initialize workspace storage: ${initResult.error?.message}`
      };
    }

    // Use the repository manager to clone
    const cloneOptions: {
      depth: number;
      singleBranch: boolean;
      targetBranch?: string;
      credentials?: GitCredentials;
    } = {
      depth,
      singleBranch,
      ...(credentials && { credentials })
    };
    
    if (branch) {
      cloneOptions.targetBranch = branch;
    }
    
    const cloneResult = await cloneRepository(
      repoUrl as GitUrl,
      cloneOptions
    );

    if (!cloneResult.success) {
      return {
        success: false,
        message: cloneResult.error?.message || 'Failed to clone repository',
        error: cloneResult.error
      };
    }

    const workspace = cloneResult.data;

    // Extract repo name for display
    const repoName = await extractRepoName(repoUrl as GitUrl);

    return {
      success: true,
      message: 'Repository cloned successfully!',
      data: {
        repoName,
        targetPath: workspace.path,
        workspaceId: workspace.id
      }
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Clone failed',
      error
    };
  }
}

/**
 * Clone a repository to a new workspace
 */
export async function cloneRepository(
  repoUrl: GitUrl,
  options: CloneRepositoryOptions = {}
): Promise<AsyncResult<Workspace>> {
  try {
    // Check for existing workspace with same repo and branch
    const duplicateCheck = await checkForDuplicateWorkspace(repoUrl, options.targetBranch);
    if (duplicateCheck.success && duplicateCheck.data) {
      return {
        success: false,
        error: new Error(`Workspace already exists for ${repoUrl} on branch ${duplicateCheck.data.targetBranch} (ID: ${duplicateCheck.data.id}). Use existing workspace or clean it first.`)
      };
    }
    
    // Generate workspace ID
    const workspaceId = options.workspaceId || (nanoid(10) as WorkspaceId);
    
    // Create workspace directory
    const workspaceBaseDir = await getWorkspaceBaseDir();
    const workspacePath = join(workspaceBaseDir, `workspace-${workspaceId}`) as FilePath;
    
    // Ensure base directory exists
    await mkdir(workspaceBaseDir, { recursive: true });
    
    // Validate Git URL
    if (!(await validateGitUrl(repoUrl))) {
      return {
        success: false,
        error: new Error(`Invalid Git URL: ${repoUrl}`)
      };
    }

    // Clone repository
    const cloneResult = await gitCloneRepository(repoUrl, workspacePath, {
      ...(options.targetBranch && { targetBranch: options.targetBranch }),
      depth: options.depth || 1,
      singleBranch: options.singleBranch !== false,
      ...(options.credentials && { credentials: options.credentials })
    });

    if (!cloneResult.success) {
      return cloneResult;
    }

    // Get actual current branch (in case Git auto-selected default branch)
    const currentBranchResult = await getCurrentBranch(workspacePath);
    if (!currentBranchResult.success) {
      return {
        success: false,
        error: new Error(`Failed to get current branch: ${currentBranchResult.error.message}`)
      };
    }
    const actualBranch = currentBranchResult.data;

    // Get commit hash
    const commitResult = await getCurrentCommitHash(workspacePath);
    if (!commitResult.success) {
      return {
        success: false,
        error: new Error(`Failed to get commit hash: ${commitResult.error.message}`)
      };
    }

    // Create workspace object
    const workspace: Workspace = {
      id: workspaceId,
      path: workspacePath,
      repoUrl,
      targetBranch: actualBranch,
      createdAt: new Date(),
      lastAccessed: new Date(),
      metadata: {
        size: 0, // Simplified size calculation
        commitHash: commitResult.data,
        isActive: true,
        ...(options.tags && { tags: options.tags })
      }
    };

    // Store workspace in memory
    workspaces.set(workspaceId, workspace);

    // Save to persistent storage
    const saveResult = await saveWorkspace(workspace);
    if (!saveResult.success) {
      console.error('Failed to save workspace to persistent storage:', saveResult.error);
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
export async function getWorkspace(workspaceId: WorkspaceId): Promise<Workspace | null> {
  // Check in-memory first
  let workspace = workspaces.get(workspaceId);
  
  if (!workspace) {
    // Try to load from persistent storage
    const loadResult = await loadStoredWorkspace(workspaceId);
    if (loadResult.success) {
      workspace = loadResult.data;
      workspaces.set(workspaceId, workspace);
    }
  }
  
  if (workspace) {
    // Update last accessed time
    workspace.lastAccessed = new Date();
    workspaces.set(workspaceId, workspace);
  }
  
  return workspace || null;
}

/**
 * List all workspaces
 */
export async function listWorkspaces(): Promise<Workspace[]> {
  const workspaceArray = Array.from(workspaces.values()).sort(
    (a, b) => b.lastAccessed.getTime() - a.lastAccessed.getTime()
  );
  
  return workspaceArray;
}

/**
 * Load all workspaces from persistent storage into memory
 */
export async function loadAllWorkspacesFromStorage(): Promise<AsyncResult<void>> {
  try {
    const allWorkspacesResult = await getStoredWorkspaces();
    if (!allWorkspacesResult.success) {
      return allWorkspacesResult;
    }

    // Load all workspaces into memory
    for (const workspace of allWorkspacesResult.data) {
      workspaces.set(workspace.id, workspace);
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
 * Clean up workspace files and directories
 */
export async function cleanupWorkspaceFiles(workspaceId: WorkspaceId): Promise<AsyncResult<void>> {
  try {
    let workspace = workspaces.get(workspaceId);
    
    // If not in memory, try to load from storage
    if (!workspace) {
      const loadResult = await loadStoredWorkspace(workspaceId);
      if (loadResult.success) {
        workspace = loadResult.data;
      }
    }
    
    // If still not found, try to construct path based on workspace ID
    if (!workspace) {
      const workspaceBaseDir = await getWorkspaceBaseDir();
      const workspacePath = join(workspaceBaseDir, `workspace-${workspaceId}`) as FilePath;
      
      // Check if directory exists
      try {
        await access(workspacePath);
        // Directory exists, create a minimal workspace object for cleanup
        workspace = {
          id: workspaceId,
          path: workspacePath,
          repoUrl: 'unknown' as GitUrl,
          targetBranch: 'unknown',
          createdAt: new Date(),
          lastAccessed: new Date()
        };
      } catch {
        return {
          success: false,
          error: new Error(`Workspace ${workspaceId} not found`)
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

    // Remove from memory
    workspaces.delete(workspaceId);

    return { success: true, data: undefined };

  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to cleanup workspace: ${error}`)
    };
  }
}

/**
 * Update workspace metadata
 */
export async function updateWorkspace(
  workspaceId: WorkspaceId,
  updates: Partial<Pick<Workspace, 'targetBranch'>> & {
    metadata?: Partial<WorkspaceMetadata>;
  }
): Promise<AsyncResult<Workspace>> {
  try {
    const workspace = workspaces.get(workspaceId);
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

    workspaces.set(workspaceId, updatedWorkspace);
    
    // Save to persistent storage
    const saveResult = await saveWorkspace(updatedWorkspace);
    if (!saveResult.success) {
      console.error('Failed to save updated workspace:', saveResult.error);
    }

    return { success: true, data: updatedWorkspace };

  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to update workspace: ${error}`)
    };
  }
}

/**
 * Check for existing workspace with same repository and branch
 */
async function checkForDuplicateWorkspace(
  repoUrl: GitUrl, 
  targetBranch?: string
): Promise<AsyncResult<Workspace | null>> {
  try {
    const existingWorkspacesResult = await getStoredWorkspaces();
    if (!existingWorkspacesResult.success) {
      return existingWorkspacesResult;
    }
    
    const existingWorkspaces = existingWorkspacesResult.data;
    
    // Find duplicate workspace
    for (const workspace of existingWorkspaces) {
      // Check if same repository URL
      if (workspace.repoUrl === repoUrl) {
        // If no target branch specified, skip duplicate check
        if (!targetBranch) {
          continue;
        }
        
        // Check if same branch
        if (workspace.targetBranch === targetBranch) {
          return { success: true, data: workspace };
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