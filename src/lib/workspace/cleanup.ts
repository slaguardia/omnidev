'use server';

import type { WorkspaceId } from '@/lib/types/index';
import { initializeWorkspaceManager, deleteWorkspace, getAllWorkspaces } from '@/lib/managers/workspace-manager';
import { cleanupWorkspace as cleanupWorkspaceRepo } from '@/lib/managers/repository-manager';

export async function cleanupWorkspace(workspaceId: WorkspaceId) {
  // Initialize workspace manager
  const initResult = await initializeWorkspaceManager();
  if (!initResult.success) {
    throw new Error(`Failed to initialize workspace manager: ${initResult.error.message}`);
  }

  // Clean specific workspace
  const cleanResult = await cleanupWorkspaceRepo(workspaceId);
  if (!cleanResult.success) {
    throw new Error(`Failed to clean workspace: ${cleanResult.error?.message}`);
  }

  // Remove from persistent storage
  const deleteResult = await deleteWorkspace(workspaceId);
  if (!deleteResult.success) {
    console.warn('Warning: Failed to remove workspace from persistent storage');
  }

  return {
    success: true,
    message: `Workspace ${workspaceId} cleaned successfully`,
    cleanedWorkspaces: 1
  };
}

export async function cleanupAllWorkspaces(force: boolean = false) {
  if (!force) {
    throw new Error('Force flag is required for bulk cleanup operations');
  }

  // Initialize workspace manager
  const initResult = await initializeWorkspaceManager();
  if (!initResult.success) {
    throw new Error(`Failed to initialize workspace manager: ${initResult.error?.message}`);
  }

  // Get all workspaces
  const workspacesResult = await getAllWorkspaces();
  if (!workspacesResult.success) {
    throw new Error(`Failed to get workspaces: ${workspacesResult.error?.message}`);
  }

  const allWorkspaces = workspacesResult.data;
  let cleanedCount = 0;
  const errors: string[] = [];

  // Clean each workspace
  for (const workspace of allWorkspaces) {
    try {
      const cleanResult = await cleanupWorkspaceRepo(workspace.id);
      if (cleanResult.success) {
        await deleteWorkspace(workspace.id);
        cleanedCount++;
      } else {
        errors.push(`Failed to clean ${workspace.id}: ${cleanResult.error?.message}`);
      }
    } catch (error) {
      errors.push(`Error cleaning ${workspace.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    success: true,
    message: `Cleaned ${cleanedCount}/${allWorkspaces.length} workspaces`,
    cleanedWorkspaces: cleanedCount,
    totalWorkspaces: allWorkspaces.length,
    errors: errors.length > 0 ? errors : undefined
  };
} 