'use server';

import type { Workspace, GitUrl, GitCredentials } from '@/lib/types/index';
import { validateGitUrl, extractRepoName } from '@/lib/git/core';
import { initializeWorkspaceManager } from '@/lib/managers/workspace-manager';
import { listWorkspaces } from '@/lib/managers/repository-manager';
import { loadAllWorkspacesFromStorage } from '@/lib/managers/repository-manager';
import { cloneRepository } from '@/lib/managers/repository-manager';

export async function getWorkspaces(): Promise<Workspace[]> {
  console.log('[WORKSPACE ACTIONS] Starting getWorkspaces()');
  
  try {
    // Initialize workspace manager first
    console.log('[WORKSPACE ACTIONS] Initializing workspace manager...');
    const initResult = await initializeWorkspaceManager();
    
    if (!initResult.success) {
      console.error('[WORKSPACE ACTIONS] Failed to initialize workspace manager:', initResult.error);
      return [];
    }
    console.log('[WORKSPACE ACTIONS] Workspace manager initialized successfully');

    // Load workspaces from storage
    console.log('[WORKSPACE ACTIONS] Loading workspaces from storage...');
    const loadResult = await loadAllWorkspacesFromStorage();
    
    if (!loadResult.success) {
      console.error('[WORKSPACE ACTIONS] Failed to load workspaces from storage:', loadResult.error);
      return [];
    }
    console.log('[WORKSPACE ACTIONS] Workspaces loaded from storage successfully');

    // Get the workspace list
    console.log('[WORKSPACE ACTIONS] Getting workspace list...');
    const workspaceList = await listWorkspaces();
    console.log(`[WORKSPACE ACTIONS] Found ${workspaceList.length} workspaces:`, workspaceList.map(ws => ({
      id: ws.id,
      repoUrl: ws.repoUrl,
      targetBranch: ws.targetBranch,
      path: ws.path,
      isActive: ws.metadata?.isActive
    })));
    
    return workspaceList;
  } catch (error) {
    console.error('[WORKSPACE ACTIONS] Error fetching workspaces:', error);
    return [];
  }
}


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
  console.log('[WORKSPACE ACTIONS] Starting cloneRepositoryAction');
  console.log('[WORKSPACE ACTIONS] Repo URL:', repoUrl);
  console.log('[WORKSPACE ACTIONS] Branch:', branch);
  
  try {
    // Validate repository URL
    console.log('[WORKSPACE ACTIONS] Validating Git URL...');
    if (!(await validateGitUrl(repoUrl as GitUrl))) {
      console.error('[WORKSPACE ACTIONS] Invalid Git URL:', repoUrl);
      return {
        success: false,
        message: 'Invalid Git repository URL'
      };
    }
    console.log('[WORKSPACE ACTIONS] Git URL is valid');

    // Initialize workspace manager
    console.log('[WORKSPACE ACTIONS] Initializing workspace manager...');
    const initResult = await initializeWorkspaceManager();
    if (!initResult.success) {
      console.error('[WORKSPACE ACTIONS] Failed to initialize workspace manager:', initResult.error);
      return {
        success: false,
        message: `Failed to initialize workspace manager: ${initResult.error?.message}`
      };
    }
    console.log('[WORKSPACE ACTIONS] Workspace manager initialized successfully');

    // Use the repository manager to clone
    console.log('[WORKSPACE ACTIONS] Cloning repository...');
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
      console.error('[WORKSPACE ACTIONS] Clone failed:', cloneResult.error);
      return {
        success: false,
        message: cloneResult.error?.message || 'Failed to clone repository',
        error: cloneResult.error
      };
    }

    const workspace = cloneResult.data;
    console.log('[WORKSPACE ACTIONS] Repository cloned successfully:', {
      id: workspace.id,
      repoUrl: workspace.repoUrl,
      path: workspace.path
    });

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
    console.error('[WORKSPACE ACTIONS] Error in cloneRepositoryAction:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Clone failed',
      error
    };
  }
} 