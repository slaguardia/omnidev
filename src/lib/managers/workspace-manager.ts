'use server';

/**
 * Workspace Manager - Persistent workspace management
 *
 * Uses SQLite storage (via workspace-db.ts) instead of JSON file I/O.
 * All public functions maintain the same async signatures for API compatibility.
 */

import { join } from 'node:path';
import { getDataDir } from '@/lib/config/server-actions';
import type { Workspace, WorkspaceId, FilePath, AsyncResult } from '@/lib/types/index';
import {
  dbInitWorkspaces,
  dbSaveWorkspace,
  dbGetWorkspace,
  dbTouchWorkspace,
  dbDeleteWorkspace,
  dbWorkspaceExists,
  dbGetAllWorkspaces,
} from './workspace-db';

/**
 * Initialize workspace manager and create necessary directories
 */
export async function initializeWorkspaceManager(): Promise<AsyncResult<void>> {
  console.log('[WORKSPACE MANAGER] Starting initializeWorkspaceManager');

  try {
    dbInitWorkspaces();
    const count = dbGetAllWorkspaces().length;
    console.log('[WORKSPACE MANAGER] Workspace DB initialized, current count:', count);

    return { success: true, data: undefined };
  } catch (error) {
    console.error('[WORKSPACE MANAGER] Error in initializeWorkspaceManager:', error);
    return {
      success: false,
      error: new Error(`Failed to initialize workspace manager: ${error}`),
    };
  }
}

/**
 * Save workspace to persistent storage
 */
export async function saveWorkspace(workspace: Workspace): Promise<AsyncResult<void>> {
  try {
    dbSaveWorkspace(workspace);
    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to save workspace: ${error}`),
    };
  }
}

/**
 * Load workspace from persistent storage
 */
export async function loadWorkspace(workspaceId: WorkspaceId): Promise<AsyncResult<Workspace>> {
  try {
    const workspace = dbGetWorkspace(workspaceId);
    if (!workspace) {
      return {
        success: false,
        error: new Error(`Workspace ${workspaceId} not found`),
      };
    }

    // Update last accessed time
    dbTouchWorkspace(workspaceId, workspace);

    return { success: true, data: workspace };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to load workspace: ${error}`),
    };
  }
}

/**
 * Load workspace from persistent storage (read-only, no lastAccessed update)
 */
export async function getWorkspaceReadonly(
  workspaceId: WorkspaceId
): Promise<AsyncResult<Workspace>> {
  try {
    const workspace = dbGetWorkspace(workspaceId);
    if (!workspace) {
      return {
        success: false,
        error: new Error(`Workspace ${workspaceId} not found`),
      };
    }

    return { success: true, data: workspace };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to load workspace: ${error}`),
    };
  }
}

/**
 * Get all workspaces from the index
 */
export async function getAllWorkspaces(): Promise<AsyncResult<Workspace[]>> {
  try {
    const workspaces = dbGetAllWorkspaces();
    console.log(
      '[WORKSPACE MANAGER] Returning',
      workspaces.length,
      'workspaces sorted by last access'
    );

    return { success: true, data: workspaces };
  } catch (error) {
    console.error('[WORKSPACE MANAGER] Error in getAllWorkspaces:', error);
    return {
      success: false,
      error: new Error(`Failed to get all workspaces: ${error}`),
    };
  }
}

/**
 * Delete workspace from persistent storage
 */
export async function deleteWorkspace(workspaceId: WorkspaceId): Promise<AsyncResult<void>> {
  try {
    dbDeleteWorkspace(workspaceId);
    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to delete workspace: ${error}`),
    };
  }
}

/**
 * Update workspace in persistent storage
 */
export async function updateWorkspace(workspace: Workspace): Promise<AsyncResult<void>> {
  try {
    if (!dbWorkspaceExists(workspace.id)) {
      return {
        success: false,
        error: new Error(`Workspace ${workspace.id} not found`),
      };
    }

    dbSaveWorkspace(workspace);
    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to update workspace: ${error}`),
    };
  }
}

/**
 * Check if workspace exists in storage
 */
export async function workspaceExists(workspaceId: WorkspaceId): Promise<boolean> {
  try {
    return dbWorkspaceExists(workspaceId);
  } catch {
    return false;
  }
}

/**
 * Get workspace statistics
 */
export async function getWorkspaceManagerStats(): Promise<
  AsyncResult<{
    total: number;
    active: number;
    inactive: number;
    totalSize: number;
    oldestAccess: Date | null;
    newestAccess: Date | null;
  }>
> {
  try {
    const result = await getAllWorkspaces();
    if (!result.success) {
      return result;
    }

    const workspaces = result.data;
    const active = workspaces.filter((ws) => ws.metadata?.isActive);
    const totalSize = workspaces.reduce((sum, ws) => sum + (ws.metadata?.size || 0), 0);

    const accessTimes = workspaces.map((ws) => new Date(ws.lastAccessed));
    const oldestAccess =
      accessTimes.length > 0 ? new Date(Math.min(...accessTimes.map((d) => d.getTime()))) : null;
    const newestAccess =
      accessTimes.length > 0 ? new Date(Math.max(...accessTimes.map((d) => d.getTime()))) : null;

    return {
      success: true,
      data: {
        total: workspaces.length,
        active: active.length,
        inactive: workspaces.length - active.length,
        totalSize,
        oldestAccess,
        newestAccess,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to get workspace stats: ${error}`),
    };
  }
}

/**
 * Cleanup old workspaces (mark as inactive or delete)
 */
export async function cleanupOldWorkspaces(
  maxAgeHours: number = 24 * 7
): Promise<AsyncResult<number>> {
  try {
    const result = await getAllWorkspaces();
    if (!result.success) {
      return result;
    }

    const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
    let cleanedCount = 0;

    for (const workspace of result.data) {
      if (new Date(workspace.lastAccessed) < cutoffTime && workspace.metadata?.isActive) {
        workspace.metadata.isActive = false;
        dbSaveWorkspace(workspace);
        cleanedCount++;
      }
    }

    return { success: true, data: cleanedCount };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to cleanup old workspaces: ${error}`),
    };
  }
}

/**
 * Get workspace index file path (legacy — kept for backwards compatibility)
 */
export async function getIndexPath(): Promise<FilePath> {
  const dataDir = await getDataDir();
  return join(dataDir, '.workspace-index.json') as FilePath;
}
