'use server';

import { cleanupWorkspaceFiles } from './repository';
import { getAllWorkspaces, deleteWorkspace } from './storage';
import type { WorkspaceId } from '@/lib/common/types';

export interface CleanupResult {
  success: boolean;
  message: string;
  cleanedWorkspaces: number;
  totalWorkspaces?: number;
  errors?: string[];
}

/**
 * Clean up a single workspace (files and storage)
 */
export async function cleanupWorkspace(workspaceId: WorkspaceId): Promise<CleanupResult> {
  try {
    // Clean workspace repository and files
    const cleanResult = await cleanupWorkspaceFiles(workspaceId);
    if (!cleanResult.success) {
      return {
        success: false,
        message: `Failed to clean workspace: ${cleanResult.error?.message}`,
        cleanedWorkspaces: 0
      };
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
  } catch (error) {
    return {
      success: false,
      message: `Failed to clean workspace: ${error instanceof Error ? error.message : String(error)}`,
      cleanedWorkspaces: 0
    };
  }
}

/**
 * Clean up all workspaces
 */
export async function cleanupAllWorkspaces(force: boolean = false): Promise<CleanupResult> {
  if (!force) {
    return {
      success: false,
      message: 'Force flag is required for bulk cleanup operations',
      cleanedWorkspaces: 0
    };
  }

  try {
    // Get all workspaces
    const workspacesResult = await getAllWorkspaces();
    if (!workspacesResult.success) {
      return {
        success: false,
        message: `Failed to get workspaces: ${workspacesResult.error?.message}`,
        cleanedWorkspaces: 0
      };
    }

    const allWorkspaces = workspacesResult.data;
    let cleanedCount = 0;
    const errors: string[] = [];

    // Clean each workspace
    for (const workspace of allWorkspaces) {
      try {
        const cleanResult = await cleanupWorkspace(workspace.id);
        if (cleanResult.success) {
          cleanedCount++;
        } else {
          errors.push(`Failed to clean ${workspace.id}: ${cleanResult.message}`);
        }
      } catch (error) {
        errors.push(`Error cleaning ${workspace.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const result: CleanupResult = {
      success: true,
      message: `Cleaned ${cleanedCount}/${allWorkspaces.length} workspaces`,
      cleanedWorkspaces: cleanedCount,
      totalWorkspaces: allWorkspaces.length,
    };

    if (errors.length > 0) {
      result.errors = errors;
    }

    return result;
  } catch (error) {
    return {
      success: false,
      message: `Failed to cleanup workspaces: ${error instanceof Error ? error.message : String(error)}`,
      cleanedWorkspaces: 0
    };
  }
}