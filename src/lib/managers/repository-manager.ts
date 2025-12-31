'use server';

/**
 * Repository Manager - Core repository operations and workspace management
 */

import { nanoid } from 'nanoid';
import { join } from 'node:path';
import { mkdir, rm, access } from 'node:fs/promises';
import { cloneRepository as gitCloneRepository, validateGitUrl } from '@/lib/git/core';
import { getCurrentBranch } from '@/lib/git/branches';
import { getCurrentCommitHash } from '@/lib/git/commits';
import { setWorkspaceGitConfig as setGitConfig } from '@/lib/git/config';
import { detectProviderFromUrl } from '@/lib/git/provider-detection';
import { type GitCloneOptions } from '@/lib/git/types';
import * as WorkspaceManagerFunctions from '@/lib/managers/workspace-manager';
import { getWorkspaceBaseDir, getConfig } from '@/lib/config/server-actions';
import type {
  Workspace,
  WorkspaceId,
  GitUrl,
  FilePath,
  AsyncResult,
  WorkspaceMetadata,
} from '@/lib/types/index';
import { GitOperations, prepareWorkspaceForEdit, isGitHubUrl, isGitLabUrl } from '../git';
import {
  canPushToBranch as gitlabCanPushToBranch,
  extractProjectIdFromUrl as extractGitLabProjectId,
  getGitLabConfig,
  getRepositoryPermissions as getGitLabRepositoryPermissions,
} from '@/lib/gitlab';
import {
  canPushToBranch as githubCanPushToBranch,
  extractOwnerRepoFromUrl as extractGitHubOwnerRepo,
  getGitHubConfig,
  getRepositoryPermissions as getGitHubRepositoryPermissions,
} from '@/lib/github';

// Type for workspace manager functions
type WorkspaceManager = typeof WorkspaceManagerFunctions;

export interface GitInitResult {
  mergeRequestRequired: boolean;
  sourceBranch: string;
  targetBranch: string;
}

export interface CloneRepositoryOptions extends GitCloneOptions {
  workspaceId?: WorkspaceId;
  tags?: string[];
}

// In-memory workspace storage (could be replaced with persistent storage)
const workspaces = new Map<WorkspaceId, Workspace>();

/**
 * Clone a repository to a new workspace
 */
export async function cloneRepository(
  repoUrl: GitUrl,
  options: CloneRepositoryOptions = {},
  workspaceManager?: WorkspaceManager
): Promise<AsyncResult<Workspace>> {
  console.log('[REPOSITORY MANAGER] Starting cloneRepository');
  console.log('[REPOSITORY MANAGER] Repo URL:', repoUrl);
  console.log('[REPOSITORY MANAGER] Options:', options);

  try {
    // Check for existing workspace with same repo and branch
    console.log('[REPOSITORY MANAGER] Checking for duplicate workspace...');
    const duplicateCheck = await checkForDuplicateWorkspace(
      repoUrl,
      options.targetBranch,
      workspaceManager
    );
    if (duplicateCheck.success && duplicateCheck.data) {
      console.log('[REPOSITORY MANAGER] Duplicate workspace found:', duplicateCheck.data.id);
      return {
        success: false,
        error: new Error(
          `Workspace already exists for ${repoUrl} on branch ${duplicateCheck.data.targetBranch} (ID: ${duplicateCheck.data.id}). Use existing workspace or clean it first.`
        ),
      };
    }
    console.log('[REPOSITORY MANAGER] No duplicate workspace found');

    // Generate workspace ID
    const workspaceId = options.workspaceId || (nanoid(10) as WorkspaceId);
    console.log('[REPOSITORY MANAGER] Generated workspace ID:', workspaceId);

    // Create workspace directory
    const workspaceBaseDir = await getWorkspaceBaseDir();
    const workspacePath = join(workspaceBaseDir, `workspace-${workspaceId}`) as FilePath;
    console.log('[REPOSITORY MANAGER] Workspace base dir:', workspaceBaseDir);
    console.log('[REPOSITORY MANAGER] Workspace path:', workspacePath);

    // Ensure base directory exists
    console.log('[REPOSITORY MANAGER] Creating base directory...');
    await mkdir(workspaceBaseDir, { recursive: true });

    // Validate Git URL
    console.log('[REPOSITORY MANAGER] Validating Git URL...');
    if (!(await validateGitUrl(repoUrl))) {
      console.error('[REPOSITORY MANAGER] Invalid Git URL:', repoUrl);
      return {
        success: false,
        error: new Error(`Invalid Git URL: ${repoUrl}`),
      };
    }
    console.log('[REPOSITORY MANAGER] Git URL is valid');

    // Clone repository
    console.log('[REPOSITORY MANAGER] Starting git clone...');
    const cloneResult = await gitCloneRepository(repoUrl, workspacePath, {
      ...(options.targetBranch && { targetBranch: options.targetBranch }),
      depth: options.depth || 1,
      singleBranch: options.singleBranch !== false,
      ...(options.credentials && { credentials: options.credentials }),
    });

    if (!cloneResult.success) {
      console.error('[REPOSITORY MANAGER] Git clone failed:', cloneResult.error);
      return cloneResult;
    }
    console.log('[REPOSITORY MANAGER] Git clone successful');

    // Auto-apply git config from centralized settings
    console.log('[REPOSITORY MANAGER] Applying git config from central settings...');
    const config = await getConfig();
    if (config.gitlab.commitName || config.gitlab.commitEmail) {
      const gitConfigResult = await setGitConfig(workspacePath, {
        userName: config.gitlab.commitName,
        userEmail: config.gitlab.commitEmail,
      });
      if (gitConfigResult.success) {
        console.log('[REPOSITORY MANAGER] Git config applied successfully');
      } else {
        console.warn('[REPOSITORY MANAGER] Failed to apply git config:', gitConfigResult.error);
        // Don't fail the clone, just log the warning
      }
    } else {
      console.log('[REPOSITORY MANAGER] No commit identity configured, skipping git config');
    }

    // Get actual current branch (in case Git auto-selected default branch)
    console.log('[REPOSITORY MANAGER] Getting current branch...');
    const currentBranchResult = await getCurrentBranch(workspacePath);
    if (!currentBranchResult.success) {
      console.error(
        '[REPOSITORY MANAGER] Failed to get current branch:',
        currentBranchResult.error
      );
      return {
        success: false,
        error: new Error(`Failed to get current branch: ${currentBranchResult.error.message}`),
      };
    }
    const actualBranch = currentBranchResult.data;
    console.log('[REPOSITORY MANAGER] Current branch:', actualBranch);

    // Get commit hash
    console.log('[REPOSITORY MANAGER] Getting commit hash...');
    const commitResult = await getCurrentCommitHash(workspacePath);
    if (!commitResult.success) {
      console.error('[REPOSITORY MANAGER] Failed to get commit hash:', commitResult.error);
      return {
        success: false,
        error: new Error(`Failed to get commit hash: ${commitResult.error.message}`),
      };
    }
    console.log('[REPOSITORY MANAGER] Commit hash:', commitResult.data);

    // Calculate workspace size
    console.log('[REPOSITORY MANAGER] Calculating workspace size...');
    const size = await calculateWorkspaceSize();
    console.log('[REPOSITORY MANAGER] Workspace size:', size);

    // Detect git provider from URL
    const provider = detectProviderFromUrl(repoUrl);
    console.log('[REPOSITORY MANAGER] Detected provider:', provider);

    // Create workspace object
    const workspace: Workspace = {
      id: workspaceId,
      path: workspacePath,
      repoUrl,
      targetBranch: actualBranch, // Use the actual current branch
      provider, // Store detected provider for PR/MR handling
      createdAt: new Date(),
      lastAccessed: new Date(),
      metadata: {
        size,
        commitHash: commitResult.data,
        isActive: true,
        ...(options.tags && { tags: options.tags }),
      },
    };

    // Check and cache permissions based on provider
    console.log('[REPOSITORY MANAGER] Checking repository permissions...');
    if (provider === 'gitlab' && isGitLabUrl(repoUrl)) {
      const gitlabConfig = await getGitLabConfig();
      if (gitlabConfig.token) {
        const projectId = extractGitLabProjectId(repoUrl);
        if (projectId) {
          const permResult = await getGitLabRepositoryPermissions(
            projectId,
            actualBranch,
            gitlabConfig.baseUrl,
            gitlabConfig.token
          );
          if (permResult.success) {
            workspace.metadata!.permissions = permResult.data;
            console.log('[REPOSITORY MANAGER] GitLab permissions cached:', {
              accessLevel: permResult.data.accessLevelName,
              targetBranchProtected: permResult.data.targetBranchProtected,
              canPushToProtected: permResult.data.canPushToProtected,
            });
            if (permResult.data.warning) {
              console.warn('[REPOSITORY MANAGER] ⚠️', permResult.data.warning);
            }
          } else {
            console.warn(
              '[REPOSITORY MANAGER] Could not check GitLab permissions:',
              permResult.error?.message
            );
          }
        }
      } else {
        console.log('[REPOSITORY MANAGER] No GitLab token configured, skipping permission check');
      }
    } else if (provider === 'github' && isGitHubUrl(repoUrl)) {
      const githubConfig = await getGitHubConfig();
      if (githubConfig.token) {
        const ownerRepo = extractGitHubOwnerRepo(repoUrl);
        if (ownerRepo) {
          const permResult = await getGitHubRepositoryPermissions(
            ownerRepo.owner,
            ownerRepo.repo,
            actualBranch,
            githubConfig.token
          );
          if (permResult.success) {
            workspace.metadata!.permissions = permResult.data;
            console.log('[REPOSITORY MANAGER] GitHub permissions cached:', {
              accessLevel: permResult.data.accessLevelName,
              targetBranchProtected: permResult.data.targetBranchProtected,
              canPushToProtected: permResult.data.canPushToProtected,
            });
            if (permResult.data.warning) {
              console.warn('[REPOSITORY MANAGER] ⚠️', permResult.data.warning);
            }
          } else {
            console.warn(
              '[REPOSITORY MANAGER] Could not check GitHub permissions:',
              permResult.error?.message
            );
          }
        }
      } else {
        console.log('[REPOSITORY MANAGER] No GitHub token configured, skipping permission check');
      }
    } else {
      console.log('[REPOSITORY MANAGER] Unknown provider or URL format, skipping permission check');
    }

    console.log('[REPOSITORY MANAGER] Created workspace object:', {
      id: workspace.id,
      repoUrl: workspace.repoUrl,
      targetBranch: workspace.targetBranch,
      path: workspace.path,
    });

    // Store workspace in memory
    console.log('[REPOSITORY MANAGER] Storing workspace in memory...');
    workspaces.set(workspaceId, workspace);
    console.log('[REPOSITORY MANAGER] In-memory workspace count after adding:', workspaces.size);

    // Also save to persistent storage if WorkspaceManager is available
    if (workspaceManager) {
      console.log(
        '[REPOSITORY MANAGER] Saving workspace to persistent storage via provided manager...'
      );
      const saveResult = await workspaceManager.saveWorkspace(workspace);
      if (!saveResult.success) {
        console.error(
          '[REPOSITORY MANAGER] Failed to save to persistent storage via provided manager:',
          saveResult.error
        );
      } else {
        console.log(
          '[REPOSITORY MANAGER] Workspace saved to persistent storage via provided manager'
        );
      }
    } else {
      console.log(
        '[REPOSITORY MANAGER] Saving workspace to persistent storage via WorkspaceManagerFunctions...'
      );
      const saveResult = await WorkspaceManagerFunctions.saveWorkspace(workspace);
      if (!saveResult.success) {
        console.error(
          '[REPOSITORY MANAGER] Failed to save to persistent storage via WorkspaceManagerFunctions:',
          saveResult.error
        );
      } else {
        console.log(
          '[REPOSITORY MANAGER] Workspace saved to persistent storage via WorkspaceManagerFunctions'
        );
      }
    }

    console.log('[REPOSITORY MANAGER] Clone repository completed successfully');
    return { success: true, data: workspace };
  } catch (error) {
    console.error('[REPOSITORY MANAGER] Error in cloneRepository:', error);
    return {
      success: false,
      error: new Error(`Failed to clone repository: ${error}`),
    };
  }
}

/**
 * Get workspace by ID
 */
export async function getWorkspace(workspaceId: WorkspaceId): Promise<Workspace | null> {
  const workspace = workspaces.get(workspaceId);
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
  console.log('[REPOSITORY MANAGER] listWorkspaces called');
  console.log('[REPOSITORY MANAGER] Current in-memory workspace count:', workspaces.size);

  const workspaceArray = Array.from(workspaces.values()).sort(
    (a, b) => b.lastAccessed.getTime() - a.lastAccessed.getTime()
  );

  console.log(
    '[REPOSITORY MANAGER] Returning workspaces:',
    workspaceArray.map((ws) => ({
      id: ws.id,
      repoUrl: ws.repoUrl,
      targetBranch: ws.targetBranch,
      lastAccessed: ws.lastAccessed,
    }))
  );

  return workspaceArray;
}

/**
 * Load all workspaces from persistent storage into memory
 */
export async function loadAllWorkspacesFromStorage(
  workspaceManager?: WorkspaceManager
): Promise<AsyncResult<void>> {
  console.log('[REPOSITORY MANAGER] Starting loadAllWorkspacesFromStorage');
  console.log('[REPOSITORY MANAGER] Current in-memory workspace count:', workspaces.size);

  try {
    if (!workspaceManager) {
      console.log(
        '[REPOSITORY MANAGER] No workspace manager provided, using WorkspaceManagerFunctions'
      );

      const allWorkspacesResult = await WorkspaceManagerFunctions.getAllWorkspaces();
      if (!allWorkspacesResult.success) {
        console.error(
          '[REPOSITORY MANAGER] Failed to get workspaces from WorkspaceManagerFunctions:',
          allWorkspacesResult.error
        );
        return allWorkspacesResult;
      }

      console.log(
        `[REPOSITORY MANAGER] Retrieved ${allWorkspacesResult.data.length} workspaces from persistent storage`
      );

      // Load all workspaces into memory
      for (const workspace of allWorkspacesResult.data) {
        console.log(
          `[REPOSITORY MANAGER] Loading workspace into memory: ${workspace.id} (${workspace.repoUrl})`
        );
        workspaces.set(workspace.id, workspace);
      }

      console.log('[REPOSITORY MANAGER] Final in-memory workspace count:', workspaces.size);
      return { success: true, data: undefined };
    }

    const allWorkspacesResult = await workspaceManager.getAllWorkspaces();
    if (!allWorkspacesResult.success) {
      console.error(
        '[REPOSITORY MANAGER] Failed to get workspaces from provided workspace manager:',
        allWorkspacesResult.error
      );
      return allWorkspacesResult;
    }

    console.log(
      `[REPOSITORY MANAGER] Retrieved ${allWorkspacesResult.data.length} workspaces from provided workspace manager`
    );

    // Load all workspaces into memory
    for (const workspace of allWorkspacesResult.data) {
      console.log(
        `[REPOSITORY MANAGER] Loading workspace into memory: ${workspace.id} (${workspace.repoUrl})`
      );
      workspaces.set(workspace.id, workspace);
    }

    console.log('[REPOSITORY MANAGER] Final in-memory workspace count:', workspaces.size);
    return { success: true, data: undefined };
  } catch (error) {
    console.error('[REPOSITORY MANAGER] Error in loadAllWorkspacesFromStorage:', error);
    return {
      success: false,
      error: new Error(`Failed to load workspaces from storage: ${error}`),
    };
  }
}

/**
 * Get active workspaces only
 */
export async function getActiveWorkspaces(): Promise<Workspace[]> {
  const allWorkspaces = await listWorkspaces();
  return allWorkspaces.filter((ws) => ws.metadata?.isActive);
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
        error: new Error(`Workspace ${workspaceId} not found`),
      };
    }

    // Update workspace
    const updatedWorkspace: Workspace = {
      ...workspace,
      ...updates,
      lastAccessed: new Date(),
      metadata: {
        ...workspace.metadata,
        ...updates.metadata,
      } as WorkspaceMetadata,
    };

    workspaces.set(workspaceId, updatedWorkspace);
    return { success: true, data: updatedWorkspace };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to update workspace: ${error}`),
    };
  }
}

/**
 * Switch to a different branch
 * @param workspaceId - The workspace ID
 * @param branchName - The branch to switch to
 * @param updateWorkspaceConfig - If true (default), updates the workspace's targetBranch setting.
 *                                Set to false for temporary branch switches during edit workflows.
 */
export async function switchBranch(
  workspaceId: WorkspaceId,
  branchName: string,
  updateWorkspaceConfig: boolean = true
): Promise<AsyncResult<void>> {
  try {
    const workspace = await getWorkspace(workspaceId);
    if (!workspace) {
      return {
        success: false,
        error: new Error(`Workspace ${workspaceId} not found`),
      };
    }

    // Switch branch using git operations
    const gitOps = new GitOperations();
    const switchResult = await gitOps.switchBranch(workspace.path, branchName);
    if (!switchResult.success) {
      return switchResult;
    }

    // Only update workspace config if explicitly requested (default behavior for backwards compatibility)
    if (updateWorkspaceConfig) {
      await updateWorkspace(workspaceId, { targetBranch: branchName });
    }

    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to switch branch: ${error}`),
    };
  }
}

/**
 * Pull latest changes
 */
export async function pullChanges(workspaceId: WorkspaceId): Promise<AsyncResult<void>> {
  try {
    const workspace = await getWorkspace(workspaceId);
    if (!workspace) {
      return {
        success: false,
        error: new Error(`Workspace ${workspaceId} not found`),
      };
    }

    // Pull changes
    const gitOps = new GitOperations();
    const pullResult = await gitOps.pullChanges(workspace.path);
    if (!pullResult.success) {
      return pullResult;
    }

    // Update commit hash in memory and persist to disk
    const commitResult = await gitOps.getCurrentCommitHash(workspace.path);
    if (commitResult.success) {
      const updateResult = await updateWorkspace(workspaceId, {
        metadata: { commitHash: commitResult.data },
      });

      // Persist to disk via WorkspaceManager
      if (updateResult.success) {
        await WorkspaceManagerFunctions.saveWorkspace(updateResult.data);
        console.log(
          `[REPOSITORY MANAGER] Updated commit hash to ${commitResult.data.substring(0, 7)} for workspace ${workspaceId}`
        );
      }
    }

    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to pull changes: ${error}`),
    };
  }
}

/**
 * Clean up workspace
 */
export async function cleanupWorkspace(
  workspaceId: WorkspaceId,
  workspaceManager?: WorkspaceManager
): Promise<AsyncResult<void>> {
  try {
    let workspace = workspaces.get(workspaceId);

    // If not in memory, try to load from WorkspaceManager
    if (!workspace && workspaceManager) {
      const loadResult = await workspaceManager.loadWorkspace(workspaceId);
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
          lastAccessed: new Date(),
        };
      } catch {
        return {
          success: false,
          error: new Error(
            `Workspace ${workspaceId} not found in memory, persistent storage, or file system`
          ),
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
    workspaces.delete(workspaceId);

    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to cleanup workspace: ${error}`),
    };
  }
}

/**
 * Clean up all inactive workspaces
 */
export async function cleanupInactiveWorkspaces(
  workspaceManager?: WorkspaceManager
): Promise<AsyncResult<number>> {
  try {
    let cleanedCount = 0;

    // Get workspaces from WorkspaceManager if available, otherwise use in-memory
    let allWorkspaces: Workspace[] = [];

    if (workspaceManager) {
      const allWorkspacesResult = await workspaceManager.getAllWorkspaces();
      if (allWorkspacesResult.success) {
        allWorkspaces = allWorkspacesResult.data.filter((ws: Workspace) => !ws.metadata?.isActive);
      } else {
        allWorkspaces = (await listWorkspaces()).filter((ws: Workspace) => !ws.metadata?.isActive);
      }
    } else {
      allWorkspaces = (await listWorkspaces()).filter((ws) => !ws.metadata?.isActive);
    }

    for (const workspace of allWorkspaces) {
      const result = await cleanupWorkspace(workspace.id, workspaceManager);
      if (result.success) {
        cleanedCount++;
      }
    }

    return { success: true, data: cleanedCount };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to cleanup inactive workspaces: ${error}`),
    };
  }
}

/**
 * Calculate total size of workspace directory
 */
async function calculateWorkspaceSize(): Promise<number> {
  // Simple estimation - return 0 for now since we removed caching
  return 0;
}

/**
 * Check for existing workspace with same repository and branch
 */
async function checkForDuplicateWorkspace(
  repoUrl: GitUrl,
  targetBranch?: string,
  workspaceManager?: WorkspaceManager
): Promise<AsyncResult<Workspace | null>> {
  try {
    // Skip duplicate check if no WorkspaceManager is available
    if (!workspaceManager) {
      return { success: true, data: null };
    }

    const existingWorkspacesResult = await workspaceManager.getAllWorkspaces();
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
        if (workspace.targetBranch === targetBranch) {
          // Additional check: see if it's the same commit (to avoid duplicate work)
          try {
            const gitOps = new GitOperations();
            const currentCommitResult = await gitOps.getCurrentCommitHash(workspace.path);
            if (
              currentCommitResult.success &&
              workspace.metadata?.commitHash === currentCommitResult.data
            ) {
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
      error: new Error(`Failed to check for duplicate workspace: ${error}`),
    };
  }
}

/**
 * Get workspace statistics
 */
export async function getWorkspaceStats(): Promise<{
  total: number;
  active: number;
  inactive: number;
  totalSize: number;
}> {
  const all = await listWorkspaces();
  const active = all.filter((ws) => ws.metadata?.isActive);
  const totalSize = all.reduce((sum, ws) => sum + (ws.metadata?.size || 0), 0);

  return {
    total: all.length,
    active: active.length,
    inactive: all.length - active.length,
    totalSize,
  };
}

/**
 * Set git configuration for a workspace
 */
export async function setWorkspaceGitConfig(
  workspaceId: WorkspaceId,
  gitConfig: { userEmail?: string; userName?: string; signingKey?: string },
  workspaceManager?: WorkspaceManager
): Promise<AsyncResult<void>> {
  try {
    const workspace = await getWorkspace(workspaceId);
    if (!workspace) {
      return {
        success: false,
        error: new Error(`Workspace ${workspaceId} not found`),
      };
    }

    // Set git config in the repository
    const gitOps = new GitOperations();
    const setConfigResult = await gitOps.setWorkspaceGitConfig(workspace.path, gitConfig);
    if (!setConfigResult.success) {
      return setConfigResult;
    }

    // Update workspace metadata
    const updatedMetadata = {
      ...workspace.metadata,
      gitConfig: {
        ...workspace.metadata?.gitConfig,
        ...gitConfig,
      },
    };

    await updateWorkspace(workspaceId, { metadata: updatedMetadata });

    // Persist to WorkspaceManager if available
    if (workspaceManager) {
      const updatedWorkspace = workspaces.get(workspaceId);
      if (updatedWorkspace) {
        await workspaceManager.updateWorkspace(updatedWorkspace);
      }
    }

    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to set workspace git config: ${error}`),
    };
  }
}

/**
 * Get git configuration for a workspace
 */
export async function getWorkspaceGitConfig(
  workspaceId: WorkspaceId,
  workspaceManager?: WorkspaceManager
): Promise<
  AsyncResult<{
    userEmail?: string;
    userName?: string;
    signingKey?: string;
  }>
> {
  try {
    const workspace = await getWorkspace(workspaceId);
    if (!workspace) {
      return {
        success: false,
        error: new Error(`Workspace ${workspaceId} not found`),
      };
    }

    // Get git config from the repository (this is the source of truth)
    const gitOps = new GitOperations();
    const getConfigResult = await gitOps.getWorkspaceGitConfig(workspace.path);
    if (!getConfigResult.success) {
      return getConfigResult;
    }

    // Update workspace metadata with current config
    if (JSON.stringify(workspace.metadata?.gitConfig) !== JSON.stringify(getConfigResult.data)) {
      const updatedMetadata = {
        ...workspace.metadata,
        gitConfig: getConfigResult.data,
      };
      await updateWorkspace(workspaceId, { metadata: updatedMetadata });

      // Persist to WorkspaceManager if available
      if (workspaceManager) {
        const updatedWorkspace = workspaces.get(workspaceId);
        if (updatedWorkspace) {
          await workspaceManager.updateWorkspace(updatedWorkspace);
        }
      }
    }

    return getConfigResult;
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to get workspace git config: ${error}`),
    };
  }
}

/**
 * Remove git configuration for a workspace
 */
export async function unsetWorkspaceGitConfig(
  workspaceId: WorkspaceId,
  keys: ('userEmail' | 'userName' | 'signingKey')[],
  workspaceManager?: WorkspaceManager
): Promise<AsyncResult<void>> {
  try {
    const workspace = await getWorkspace(workspaceId);
    if (!workspace) {
      return {
        success: false,
        error: new Error(`Workspace ${workspaceId} not found`),
      };
    }

    // Remove git config from the repository
    const gitOps = new GitOperations();
    const unsetConfigResult = await gitOps.unsetWorkspaceGitConfig(workspace.path, keys);
    if (!unsetConfigResult.success) {
      return unsetConfigResult;
    }

    // Update workspace metadata
    const currentGitConfig = { ...workspace.metadata?.gitConfig };
    for (const key of keys) {
      switch (key) {
        case 'userEmail':
          delete currentGitConfig.userEmail;
          break;
        case 'userName':
          delete currentGitConfig.userName;
          break;
        case 'signingKey':
          delete currentGitConfig.signingKey;
          break;
      }
    }

    const updatedMetadata = {
      ...workspace.metadata,
      gitConfig: currentGitConfig,
    };

    await updateWorkspace(workspaceId, { metadata: updatedMetadata });

    // Persist to WorkspaceManager if available
    if (workspaceManager) {
      const updatedWorkspace = workspaces.get(workspaceId);
      if (updatedWorkspace) {
        await workspaceManager.updateWorkspace(updatedWorkspace);
      }
    }

    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to unset workspace git config: ${error}`),
    };
  }
}

/**
 * Initialize git configuration for a newly cloned workspace
 */
export async function initializeWorkspaceGitConfig(
  workspaceId: WorkspaceId,
  defaultConfig?: { userEmail?: string; userName?: string },
  workspaceManager?: WorkspaceManager
): Promise<AsyncResult<void>> {
  try {
    if (!defaultConfig?.userEmail && !defaultConfig?.userName) {
      return { success: true, data: undefined };
    }

    return await setWorkspaceGitConfig(workspaceId, defaultConfig, workspaceManager);
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to initialize workspace git config: ${error}`),
    };
  }
}

export interface BranchPushPermissionCheckResult {
  canPush: boolean;
  isProtected: boolean;
  reason: string;
  provider: 'github' | 'gitlab' | 'unknown';
}

/**
 * Check if the current user can push directly to a branch
 * Unified function that detects the provider and calls the appropriate API
 */
export async function checkBranchPushPermission(
  repoUrl: GitUrl,
  branchName: string
): Promise<AsyncResult<BranchPushPermissionCheckResult>> {
  try {
    const urlString = String(repoUrl);

    if (isGitLabUrl(urlString)) {
      const config = await getGitLabConfig();
      if (!config.token) {
        console.warn('[PERMISSION CHECK] No GitLab token configured, skipping permission check');
        return {
          success: true,
          data: {
            canPush: true, // Assume can push if no token to check
            isProtected: false,
            reason: 'No GitLab token configured, cannot verify permissions',
            provider: 'gitlab',
          },
        };
      }

      const projectId = extractGitLabProjectId(repoUrl);
      if (!projectId) {
        return {
          success: false,
          error: new Error('Could not extract GitLab project ID from URL'),
        };
      }

      const result = await gitlabCanPushToBranch(projectId, branchName, config.baseUrl, config.token);
      if (!result.success) {
        return result;
      }

      return {
        success: true,
        data: {
          ...result.data,
          provider: 'gitlab',
        },
      };
    }

    if (isGitHubUrl(urlString)) {
      const config = await getGitHubConfig();
      if (!config.token) {
        console.warn('[PERMISSION CHECK] No GitHub token configured, skipping permission check');
        return {
          success: true,
          data: {
            canPush: true, // Assume can push if no token to check
            isProtected: false,
            reason: 'No GitHub token configured, cannot verify permissions',
            provider: 'github',
          },
        };
      }

      const ownerRepo = extractGitHubOwnerRepo(repoUrl);
      if (!ownerRepo) {
        return {
          success: false,
          error: new Error('Could not extract GitHub owner/repo from URL'),
        };
      }

      const result = await githubCanPushToBranch(
        ownerRepo.owner,
        ownerRepo.repo,
        branchName,
        config.token
      );
      if (!result.success) {
        return result;
      }

      return {
        success: true,
        data: {
          ...result.data,
          provider: 'github',
        },
      };
    }

    // Unknown provider - assume can push
    return {
      success: true,
      data: {
        canPush: true,
        isProtected: false,
        reason: 'Unknown git provider, cannot verify permissions',
        provider: 'unknown',
      },
    };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to check branch push permission: ${error}`),
    };
  }
}

/**
 * Initialize git workflow - prepare workspace and set up for edit operations
 *
 * This function ensures a clean, predictable state before any edit workflow:
 * 1. Prepares workspace (discards changes, syncs with remote, deletes local branches)
 * 2. If source === target: creates a new unique branch for MR
 * 3. If source !== target: switches to source branch and syncs with remote
 */
export async function initializeGitWorkflow(
  workspaceId: WorkspaceId,
  sourceBranch?: string,
  createMR?: boolean
): Promise<AsyncResult<GitInitResult>> {
  try {
    // Get the workspace
    const workspace = await getWorkspace(workspaceId);
    console.log('Getting workspace:', workspace);
    if (!workspace) {
      return {
        success: false,
        error: new Error(`Workspace ${workspaceId} not found`),
      };
    }

    const gitOps = new GitOperations();

    // Get the configured target branch for this workspace
    let targetBranch = workspace.targetBranch;
    console.log('Getting target branch:', targetBranch);
    if (!targetBranch) {
      console.log(
        'Target branch not found for workspace',
        workspaceId,
        'getting default branch...'
      );
      const defaultBranchResult = await gitOps.getDefaultBranch(workspace.path);
      if (defaultBranchResult.success) {
        targetBranch = defaultBranchResult.data;
      } else {
        return {
          success: false,
          error: new Error(
            `Failed to get default branch for workspace ${workspaceId}: ${defaultBranchResult.error.message}`
          ),
        };
      }
    }

    // Step 1: Prepare workspace - ensures clean state on target branch
    // This discards all uncommitted changes, removes untracked files,
    // syncs with remote, and deletes all local branches except target
    console.log('[GIT WORKFLOW] Preparing workspace for edit...');
    const prepareResult = await prepareWorkspaceForEdit(workspace.path, targetBranch);
    if (!prepareResult.success) {
      return {
        success: false,
        error: new Error(`Failed to prepare workspace: ${prepareResult.error?.message}`),
      };
    }

    const { deletedBranches, hadUncommittedChanges, hadUntrackedFiles } = prepareResult.data;
    if (deletedBranches.length > 0) {
      console.log(`[GIT WORKFLOW] Cleaned up ${deletedBranches.length} local branches`);
    }
    if (hadUncommittedChanges || hadUntrackedFiles) {
      console.log(
        `[GIT WORKFLOW] Cleaned up workspace: uncommitted=${hadUncommittedChanges}, untracked=${hadUntrackedFiles}`
      );
    }

    // If no sourceBranch was provided, default to the targetBranch.
    const effectiveSourceBranch = sourceBranch || targetBranch;

    // If source branch differs from target, validate it exists on remote
    // This prevents creating orphan local branches that can't be pushed
    if (effectiveSourceBranch !== targetBranch) {
      console.log(
        `[GIT WORKFLOW] Validating source branch exists on remote: origin/${effectiveSourceBranch}`
      );
      const remoteBranchesResult = await gitOps.getAllRemoteBranches(workspace.path);
      if (!remoteBranchesResult.success) {
        return {
          success: false,
          error: new Error(
            `Failed to fetch remote branches: ${remoteBranchesResult.error?.message}`
          ),
        };
      }

      const remoteBranchExists = remoteBranchesResult.data.includes(effectiveSourceBranch);
      if (!remoteBranchExists) {
        return {
          success: false,
          error: new Error(
            `Source branch '${effectiveSourceBranch}' does not exist on remote. ` +
              `Available branches: ${remoteBranchesResult.data.slice(0, 5).join(', ')}` +
              (remoteBranchesResult.data.length > 5
                ? ` and ${remoteBranchesResult.data.length - 5} more`
                : '')
          ),
        };
      }
      console.log(`[GIT WORKFLOW] ✅ Source branch exists on remote`);
    }

    // Check if the source branch is the same as the target branch
    if (effectiveSourceBranch === targetBranch) {
      // Only create a new branch if MR is explicitly requested
      if (createMR) {
        console.log(
          '[GIT WORKFLOW] Source branch is the same as target branch and MR requested, creating new branch...'
        );

        // Create a new branch with a unique name for the MR
        const uniqueBranchName = `${targetBranch}-${Date.now()}`;
        const createBranchResult = await gitOps.switchBranch(workspace.path, uniqueBranchName);
        if (!createBranchResult.success) {
          return {
            success: false,
            error: new Error(
              `Failed to create and switch to new branch ${uniqueBranchName}: ${createBranchResult.error.message}`
            ),
          };
        }

        return {
          success: true,
          data: {
            mergeRequestRequired: true,
            sourceBranch: uniqueBranchName,
            targetBranch: targetBranch,
          },
        };
      }

      // No MR requested - check if user can push directly to this branch
      console.log(
        '[GIT WORKFLOW] Source branch is the same as target branch, no MR requested. Checking push permissions...'
      );

      // Try to use cached permissions first (no API call overhead)
      const cachedPermissions = workspace.metadata?.permissions;
      if (cachedPermissions && targetBranch === workspace.targetBranch) {
        console.log('[GIT WORKFLOW] Using cached permissions (from clone time)');
        if (cachedPermissions.targetBranchProtected && !cachedPermissions.canPushToProtected) {
          console.error(
            `[GIT WORKFLOW] ❌ Cannot push directly to branch '${targetBranch}': ${cachedPermissions.warning || 'Branch is protected'}`
          );
          return {
            success: false,
            error: new Error(
              `Cannot push directly to branch '${targetBranch}': Your ${cachedPermissions.accessLevelName} access cannot push to protected branches. ` +
                `Set createMR=true to create a merge request instead.`
            ),
          };
        }
        console.log(
          `[GIT WORKFLOW] ✅ User can push to branch '${targetBranch}' (cached: ${cachedPermissions.accessLevelName} access)`
        );
      } else {
        // Fall back to API check if no cached permissions or different branch
        console.log('[GIT WORKFLOW] No cached permissions, checking via API...');
        const permissionCheck = await checkBranchPushPermission(workspace.repoUrl, targetBranch);
        if (!permissionCheck.success) {
          console.warn(
            '[GIT WORKFLOW] Could not verify push permissions:',
            permissionCheck.error?.message
          );
          // Continue anyway - let the push fail naturally if there's a permission issue
        } else if (!permissionCheck.data.canPush) {
          console.error(
            `[GIT WORKFLOW] ❌ Cannot push directly to branch '${targetBranch}': ${permissionCheck.data.reason}`
          );
          return {
            success: false,
            error: new Error(
              `Cannot push directly to branch '${targetBranch}': ${permissionCheck.data.reason}. ` +
                `Set createMR=true to create a merge request instead.`
            ),
          };
        } else {
          console.log(
            `[GIT WORKFLOW] ✅ User can push to branch '${targetBranch}': ${permissionCheck.data.reason}`
          );
        }
      }

      return {
        success: true,
        data: {
          mergeRequestRequired: false,
          sourceBranch: targetBranch,
          targetBranch: targetBranch,
        },
      };
    }

    // If the source branch is different from the target branch
    else {
      console.log(`[GIT WORKFLOW] Switching to source branch: ${effectiveSourceBranch}`);

      // Switch to the source branch (requireRemote=true since we validated it exists above)
      const switchResult = await gitOps.switchBranch(workspace.path, effectiveSourceBranch, {
        requireRemote: true,
      });
      if (!switchResult.success) {
        return {
          success: false,
          error: new Error(
            `Failed to switch to source branch ${effectiveSourceBranch}: ${switchResult.error.message}`
          ),
        };
      }

      // Note: switchBranch with requireRemote=true already syncs with remote via reset --hard
      // No need to call pullChanges separately
      console.log(`[GIT WORKFLOW] ✅ Source branch synced with remote`);

      return {
        success: true,
        data: {
          mergeRequestRequired: false,
          sourceBranch: effectiveSourceBranch,
          targetBranch: targetBranch,
        },
      };
    }
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to initialize git workflow: ${error}`),
    };
  }
}
