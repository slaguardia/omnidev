/**
 * Git workflow initialization utilities
 */

import { initializeGitWorkflow as initializeGitWorkflowFunction, GitInitResult, loadAllWorkspacesFromStorage } from '@/lib/managers/RepositoryManager';
import { initializeWorkspaceManager } from '@/lib/managers/WorkspaceManager';
import type { AsyncResult, WorkspaceId } from '@/lib/types/index';

/**
 * Initialize git workflow for a workspace
 */
export async function initializeGitWorkflow(workspaceId: WorkspaceId, sourceBranch: string, taskId: string): Promise<AsyncResult<GitInitResult>> {
  try {
    // Initialize workspace manager
    const initResult = await initializeWorkspaceManager();
    if (!initResult.success) {
      return {
        success: false,
        error: new Error(`Failed to initialize workspace manager: ${initResult.error?.message}`)
      };
    }

    // Load workspaces from storage
    const loadResult = await loadAllWorkspacesFromStorage();
    if (!loadResult.success) {
      return {
        success: false,
        error: new Error(`Failed to load workspaces: ${loadResult.error?.message}`)
      };
    }

    // Initialize git workflow
    console.log('[GIT WORKFLOW] Initializing git workflow for workspace:', workspaceId);
    return await initializeGitWorkflowFunction(workspaceId, sourceBranch, taskId);
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to initialize git workflow: ${error}`)
    };
  }
} 