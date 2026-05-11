/**
 * Pre-edit git workflow initialization.
 *
 * Used by executeAgentRun (agent-runner.ts) and the legacy queue handler
 * (queue/job-handlers.ts) to prepare a workspace for an agent edit run —
 * ensures the workspace manager is initialized, resolves the source branch,
 * and decides whether the run should create an MR/PR on completion.
 *
 * Lives in lib/agent/ because its only consumers are the agent execution
 * orchestrators. Was previously under lib/claudeCode/ before the Claude
 * Code CLI decommission.
 */

import {
  initializeGitWorkflow as initializeGitWorkflowFunction,
  loadAllWorkspacesFromStorage,
  GitInitResult,
} from '@/lib/managers/repository-manager';
import { initializeWorkspaceManager } from '@/lib/managers/workspace-manager';
import type { AsyncResult, WorkspaceId } from '@/lib/types/index';

export type { GitInitResult };
export type GitBranchWorkflowResult = GitInitResult;

export interface GitWorkflowOptions {
  workspaceId: WorkspaceId;
  /** Optional. If omitted, the workflow uses the workspace targetBranch as the base. */
  sourceBranch?: string;
  /**
   * Whether to create a merge/pull request when the agent finishes.
   * If false and sourceBranch === targetBranch, commits directly to that branch.
   */
  createMR?: boolean;
}

/**
 * Initialize git workflow for a workspace. Boots the workspace manager,
 * loads persisted workspaces, then delegates to the repository manager's
 * branch-setup routine.
 */
export async function initializeGitWorkflow(
  options: GitWorkflowOptions
): Promise<AsyncResult<GitInitResult>> {
  const { workspaceId, sourceBranch, createMR } = options;

  try {
    const initResult = await initializeWorkspaceManager();
    if (!initResult.success) {
      return {
        success: false,
        error: new Error(`Failed to initialize workspace manager: ${initResult.error?.message}`),
      };
    }

    const loadResult = await loadAllWorkspacesFromStorage();
    if (!loadResult.success) {
      return {
        success: false,
        error: new Error(`Failed to load workspaces: ${loadResult.error?.message}`),
      };
    }

    console.log('[GIT WORKFLOW] Initializing git workflow for workspace:', workspaceId);
    return await initializeGitWorkflowFunction(workspaceId, sourceBranch, createMR);
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to initialize git workflow: ${error}`),
    };
  }
}
