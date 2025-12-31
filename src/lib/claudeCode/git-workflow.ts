/**
 * Git workflow initialization utilities
 */

import {
  initializeGitWorkflow as initializeGitWorkflowFunction,
  loadAllWorkspacesFromStorage,
  GitInitResult,
} from '@/lib/managers/repository-manager';
import { initializeWorkspaceManager } from '@/lib/managers/workspace-manager';
import type { AsyncResult } from '@/lib/types/index';
import type { GitWorkflowOptions } from '@/lib/claudeCode/types';

// Re-export for convenience (GitBranchWorkflowResult is the same type)
export type { GitInitResult };
export type GitBranchWorkflowResult = GitInitResult;

/**
 * Initialize git workflow for a workspace
 */
export async function initializeGitWorkflow(
  options: GitWorkflowOptions
): Promise<AsyncResult<GitInitResult>> {
  const { workspaceId, sourceBranch, createMR } = options;

  try {
    // Initialize workspace manager
    const initResult = await initializeWorkspaceManager();
    if (!initResult.success) {
      return {
        success: false,
        error: new Error(`Failed to initialize workspace manager: ${initResult.error?.message}`),
      };
    }

    // Load workspaces from storage
    const loadResult = await loadAllWorkspacesFromStorage();
    if (!loadResult.success) {
      return {
        success: false,
        error: new Error(`Failed to load workspaces: ${loadResult.error?.message}`),
      };
    }

    // Initialize git workflow
    console.log('[GIT WORKFLOW] Initializing git workflow for workspace:', workspaceId);
    return await initializeGitWorkflowFunction(workspaceId, sourceBranch, createMR);
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to initialize git workflow: ${error}`),
    };
  }
}
