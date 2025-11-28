'use server';

import { GitOperations } from '@/lib/git';
import { getWorkspace, updateWorkspace } from './repository';
import { initializeWorkspaceStorage } from './storage';
import type { WorkspaceId } from '@/lib/common/types';

export interface GitConfig {
  userEmail?: string;
  userName?: string;
  signingKey?: string;
}

/**
 * Set git configuration for a workspace
 */
export async function setWorkspaceGitConfig(
  workspaceId: WorkspaceId,
  gitConfig: GitConfig
): Promise<{ success: boolean; message: string }> {
  try {
    // Initialize workspace storage first
    const initResult = await initializeWorkspaceStorage();
    if (!initResult.success) {
      throw new Error(`Failed to initialize workspace storage: ${initResult.error?.message}`);
    }

    const workspace = await getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    // Set git config in the repository
    const gitOps = new GitOperations();
    const setConfigResult = await gitOps.setWorkspaceGitConfig(workspace.path, gitConfig);
    if (!setConfigResult.success) {
      throw new Error(setConfigResult.error.message);
    }

    // Update workspace metadata
    const updatedMetadata = {
      ...workspace.metadata,
      gitConfig: {
        ...workspace.metadata?.gitConfig,
        ...gitConfig,
      },
    };

    const updateResult = await updateWorkspace(workspaceId, { metadata: updatedMetadata });
    if (!updateResult.success) {
      throw new Error(updateResult.error.message);
    }

    return { success: true, message: 'Git configuration updated successfully' };
  } catch (error) {
    throw new Error(
      `Failed to set workspace git config: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Get git configuration for a workspace
 */
export async function getWorkspaceGitConfig(workspaceId: WorkspaceId): Promise<GitConfig> {
  try {
    // Initialize workspace storage first
    const initResult = await initializeWorkspaceStorage();
    if (!initResult.success) {
      throw new Error(`Failed to initialize workspace storage: ${initResult.error?.message}`);
    }

    const workspace = await getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    // Get git config from the repository (this is the source of truth)
    const gitOps = new GitOperations();
    const getConfigResult = await gitOps.getWorkspaceGitConfig(workspace.path);
    if (!getConfigResult.success) {
      throw new Error(getConfigResult.error.message);
    }

    // Update workspace metadata with current config if it's different
    if (JSON.stringify(workspace.metadata?.gitConfig) !== JSON.stringify(getConfigResult.data)) {
      const updatedMetadata = {
        ...workspace.metadata,
        gitConfig: getConfigResult.data,
      };

      const updateResult = await updateWorkspace(workspaceId, { metadata: updatedMetadata });
      if (!updateResult.success) {
        console.error('Failed to update workspace metadata with git config:', updateResult.error);
      }
    }

    return getConfigResult.data;
  } catch (error) {
    throw new Error(
      `Failed to get workspace git config: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Remove git configuration for a workspace
 */
export async function unsetWorkspaceGitConfig(
  workspaceId: WorkspaceId,
  keys: ('userEmail' | 'userName' | 'signingKey')[]
): Promise<{ success: boolean; message: string }> {
  try {
    // Initialize workspace storage first
    const initResult = await initializeWorkspaceStorage();
    if (!initResult.success) {
      throw new Error(`Failed to initialize workspace storage: ${initResult.error?.message}`);
    }

    const workspace = await getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    // Remove git config from the repository
    const gitOps = new GitOperations();
    const unsetConfigResult = await gitOps.unsetWorkspaceGitConfig(workspace.path, keys);
    if (!unsetConfigResult.success) {
      throw new Error(unsetConfigResult.error.message);
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

    const updateResult = await updateWorkspace(workspaceId, { metadata: updatedMetadata });
    if (!updateResult.success) {
      throw new Error(updateResult.error.message);
    }

    return { success: true, message: 'Git configuration removed successfully' };
  } catch (error) {
    throw new Error(
      `Failed to unset workspace git config: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
