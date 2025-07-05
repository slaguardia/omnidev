import { GitBranchWorkflowResult, loadAllWorkspacesFromStorage, getWorkspace } from '@/lib/managers/repository-manager';
import { initializeWorkspaceManager } from '@/lib/managers/workspace-manager';
import type { AsyncResult, WorkspaceId } from '@/lib/types/index';
import { GitOperations } from '../git';


/**
 * Initialize git workflow - clean up local branches and pull latest changes
 * This should be called at the start of any development workflow
 * If the source branch and target branch are the same, checkout the target branch, pull latest, run cleanup, checkout new branch, then ask the question
 */
export interface GitBranchWorkflowOptions {
  workspaceId: WorkspaceId;
  sourceBranch: string;
  taskId: string | null;
  newBranchName: string | null;
  createMR: boolean;
}

export async function initializeGitBranchWorkflow(params: GitBranchWorkflowOptions): Promise<AsyncResult<GitBranchWorkflowResult>> {
  try {
    // Get the workspace
    const workspace = await getWorkspace(params.workspaceId);
    console.log('Getting workspace:', workspace);
    if (!workspace) {
      return {
        success: false,
        error: new Error(`Workspace ${params.workspaceId} not found`)
      };
    }

    const gitOps = new GitOperations();

    // Get the configured target branch for this workspace
    let targetBranch = workspace.targetBranch; // This is the configured target branch
    console.log('Getting target branch:', targetBranch);
    if (!targetBranch) {
      console.log('Target branch not found for workspace', params.workspaceId, 'getting default branch...');
      const defaultBranchResult = await gitOps.getDefaultBranch(workspace.path);
      if (defaultBranchResult.success) {
        targetBranch = defaultBranchResult.data;
      } else {
        return {
          success: false,
          error: new Error(`Failed to get default branch for workspace ${params.workspaceId}: ${defaultBranchResult.error.message}`)
        };
      }
    }
    // Check if the source branch is the same as the target branch
    if (params.sourceBranch === targetBranch) {
      console.log('[GIT WORKFLOW] Source branch is the same as the target branch, checking out target branch...');
      // Checkout the target branch
      const checkoutResult = await gitOps.switchBranch(workspace.path, targetBranch);
      if (!checkoutResult.success) {
        return {
          success: false,
          error: new Error(`Failed to checkout target branch ${targetBranch}: ${checkoutResult.error.message}`)
        };
      }

      // Pull latest changes from the target branch
      const defaultPullResult = await gitOps.pullChanges(workspace.path);
      if (!defaultPullResult.success) {
        return {
          success: false,
          error: new Error(`Failed to pull latest changes from target branch: ${defaultPullResult.error.message}`)
        };
      }

      // Run cleanup
      console.log('[GIT WORKFLOW] Running cleanup...');
      const cleanupResult = await gitOps.cleanBranches(workspace.path, targetBranch);
      if (!cleanupResult.success) {
        return {
          success: false,
          error: new Error(`Failed to clean branches: ${cleanupResult.error.message}`)
        };
      }

      // Create a new branch with a unique name
      // If createMR is false, we are committing to the source branch
      let uniqueBranchName;
      if (params.newBranchName && params.newBranchName.trim() !== '' && params.taskId && params.taskId.trim() !== '') {
        uniqueBranchName = `${params.taskId}-${params.newBranchName}`;
      } else if (params.taskId && params.taskId.trim() !== '') {
        uniqueBranchName = `${params.taskId}-${Date.now()}`;
      } else {
        uniqueBranchName = `${params.sourceBranch}-${Date.now()}`;
      }
      if (params.createMR) {
        const createBranchResult = await gitOps.switchBranch(workspace.path, uniqueBranchName);
        if (!createBranchResult.success) {
          return {
            success: false,
            error: new Error(`Failed to create and switch to new branch ${uniqueBranchName}: ${createBranchResult.error.message}`)
          };
        }
      }

      return { success: true, data: { mergeRequestRequired: params.createMR, sourceBranch: params.createMR ? uniqueBranchName : params.sourceBranch, targetBranch: targetBranch } };
    } 
    
    // If the source branch is different from the target branch
    else {
      // Switch to the source branch
      const switchResult = await gitOps.switchBranch(workspace.path, params.sourceBranch);
      if (!switchResult.success) {
        return {
          success: false,
          error: new Error(`Failed to switch to source branch ${params.sourceBranch}: ${switchResult.error.message}`)
        };
      }

      // Pull latest changes from the source branch
      const pullResult = await gitOps.pullChanges(workspace.path);
      if (!pullResult.success) {
        return {
          success: false,
          error: new Error(`Failed to pull latest changes from source branch: ${pullResult.error.message}`)
        };
      }

      return { success: true, data: { mergeRequestRequired: false, sourceBranch: params.sourceBranch, targetBranch: targetBranch } };
    }
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to initialize git workflow: ${error}`)
    };
  }
}

export interface GitWorkflowOptions {
  workspaceId: WorkspaceId;
  sourceBranch: string;
  taskId: string | null;
  newBranchName: string | null;
  createMR: boolean;
}

/**
 * Initialize git workflow for a workspace
 */
export async function initializeGitWorkflow(params: GitWorkflowOptions): Promise<AsyncResult<GitBranchWorkflowResult>> {
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
    console.log('[GIT WORKFLOW] Initializing git workflow for workspace:', params.workspaceId);
    return await initializeGitBranchWorkflow(params);
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to initialize git workflow: ${error}`)
    };
  }
}