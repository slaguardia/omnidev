'use server';

/**
 * Workspace Manager - Persistent workspace management
 */

import { writeFile, readFile, stat, access, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { getWorkspaceBaseDir } from '@/config/settings';
import type {
  Workspace,
  WorkspaceId,
  FilePath,
  AsyncResult
} from '@/lib/types/index';

interface WorkspaceIndex {
  workspaces: Record<WorkspaceId, Workspace>;
  lastUpdated: string;
  version: string;
}

// Module-level workspace index and path
let workspaceIndex: WorkspaceIndex = {
  workspaces: {},
  lastUpdated: new Date().toISOString(),
  version: '1.0.0'
};

let workspaceIndexPath: FilePath | null = null;

/**
 * Get the workspace index file path
 */
async function getWorkspaceIndexPath(): Promise<FilePath> {
  if (!workspaceIndexPath) {
    const workspaceBaseDir = getWorkspaceBaseDir();
    workspaceIndexPath = join(workspaceBaseDir, '.workspace-index.json') as FilePath;
  }
  return workspaceIndexPath;
}

/**
 * Initialize workspace manager and create necessary directories
 */
export async function initializeWorkspaceManager(): Promise<AsyncResult<void>> {
  console.log('[WORKSPACE MANAGER] Starting initializeWorkspaceManager');
  
  try {
    const indexPath = await getWorkspaceIndexPath();
    console.log('[WORKSPACE MANAGER] Workspace index path:', indexPath);
    
    // Ensure the directory exists
    const indexDir = dirname(indexPath);
    console.log('[WORKSPACE MANAGER] Creating index directory:', indexDir);
    await mkdir(indexDir, { recursive: true });
    
    // Load or create the workspace index
    console.log('[WORKSPACE MANAGER] Loading workspace index...');
    await loadWorkspaceIndex();
         console.log('[WORKSPACE MANAGER] Workspace index loaded, current count:', Object.keys(workspaceIndex.workspaces).length);
    
    return { success: true, data: undefined };
  } catch (error) {
    console.error('[WORKSPACE MANAGER] Error in initializeWorkspaceManager:', error);
    return {
      success: false,
      error: new Error(`Failed to initialize workspace manager: ${error}`)
    };
  }
}

/**
 * Save workspace to persistent storage
 */
export async function saveWorkspace(workspace: Workspace): Promise<AsyncResult<void>> {
  try {
    workspaceIndex.workspaces[workspace.id] = workspace;
    workspaceIndex.lastUpdated = new Date().toISOString();
    
    await saveWorkspaceIndex();
    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to save workspace: ${error}`)
    };
  }
}

/**
 * Load workspace from persistent storage
 */
export async function loadWorkspace(workspaceId: WorkspaceId): Promise<AsyncResult<Workspace>> {
  try {
    await loadWorkspaceIndex();
    
    const workspace = workspaceIndex.workspaces[workspaceId];
    if (!workspace) {
      return {
        success: false,
        error: new Error(`Workspace ${workspaceId} not found`)
      };
    }

    // Update last accessed time
    workspace.lastAccessed = new Date();
    await saveWorkspace(workspace);

    return { success: true, data: workspace };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to load workspace: ${error}`)
    };
  }
}

/**
 * Get all workspaces from the index
 */
export async function getAllWorkspaces(): Promise<AsyncResult<Workspace[]>> {
  console.log('[WORKSPACE MANAGER] Starting getAllWorkspaces');
     console.log('[WORKSPACE MANAGER] Current workspace index size:', Object.keys(workspaceIndex.workspaces).length);
   
   try {
     // Ensure we have the latest index
     await loadWorkspaceIndex();
     console.log('[WORKSPACE MANAGER] Workspace index reloaded, size:', Object.keys(workspaceIndex.workspaces).length);
    
    const workspaces = Object.values(workspaceIndex.workspaces)
      .sort((a, b) => new Date(b.lastAccessed).getTime() - new Date(a.lastAccessed).getTime());
    console.log('[WORKSPACE MANAGER] Returning workspaces:', workspaces.map(ws => ({
      id: ws.id,
      repoUrl: ws.repoUrl,
      targetBranch: ws.targetBranch,
      path: ws.path,
      createdAt: ws.createdAt,
      lastAccessed: ws.lastAccessed
    })));
    
    return { success: true, data: workspaces };
  } catch (error) {
    console.error('[WORKSPACE MANAGER] Error in getAllWorkspaces:', error);
    return {
      success: false,
      error: new Error(`Failed to get all workspaces: ${error}`)
    };
  }
}

/**
 * Delete workspace from persistent storage
 */
export async function deleteWorkspace(workspaceId: WorkspaceId): Promise<AsyncResult<void>> {
  try {
    delete workspaceIndex.workspaces[workspaceId];
    workspaceIndex.lastUpdated = new Date().toISOString();
    
    await saveWorkspaceIndex();
    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to delete workspace: ${error}`)
    };
  }
}

/**
 * Update workspace in persistent storage
 */
export async function updateWorkspace(workspace: Workspace): Promise<AsyncResult<void>> {
  try {
    if (!workspaceIndex.workspaces[workspace.id]) {
      return {
        success: false,
        error: new Error(`Workspace ${workspace.id} not found`)
      };
    }

    return await saveWorkspace(workspace);
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to update workspace: ${error}`)
    };
  }
}

/**
 * Check if workspace exists in storage
 */
export async function workspaceExists(workspaceId: WorkspaceId): Promise<boolean> {
  try {
    await loadWorkspaceIndex();
    return workspaceId in workspaceIndex.workspaces;
  } catch {
    return false;
  }
}

/**
 * Get workspace statistics
 */
export async function getWorkspaceManagerStats(): Promise<AsyncResult<{
  total: number;
  active: number;
  inactive: number;
  totalSize: number;
  oldestAccess: Date | null;
  newestAccess: Date | null;
}>> {
  try {
    const result = await getAllWorkspaces();
    if (!result.success) {
      return result;
    }

    const workspaces = result.data;
    const active = workspaces.filter(ws => ws.metadata?.isActive);
    const totalSize = workspaces.reduce((sum, ws) => sum + (ws.metadata?.size || 0), 0);
    
    const accessTimes = workspaces.map(ws => new Date(ws.lastAccessed));
    const oldestAccess = accessTimes.length > 0 ? new Date(Math.min(...accessTimes.map(d => d.getTime()))) : null;
    const newestAccess = accessTimes.length > 0 ? new Date(Math.max(...accessTimes.map(d => d.getTime()))) : null;

    return {
      success: true,
      data: {
        total: workspaces.length,
        active: active.length,
        inactive: workspaces.length - active.length,
        totalSize,
        oldestAccess,
        newestAccess
      }
    };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to get workspace stats: ${error}`)
    };
  }
}

/**
 * Cleanup old workspaces (mark as inactive or delete)
 */
export async function cleanupOldWorkspaces(maxAgeHours: number = 24 * 7): Promise<AsyncResult<number>> {
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
        await saveWorkspace(workspace);
        cleanedCount++;
      }
    }

    return { success: true, data: cleanedCount };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to cleanup old workspaces: ${error}`)
    };
  }
}

/**
 * Load workspace index from disk
 */
async function loadWorkspaceIndex(): Promise<void> {
  console.log('[WORKSPACE MANAGER] Loading workspace index from disk');
  
  try {
    const indexPath = await getWorkspaceIndexPath();
    console.log('[WORKSPACE MANAGER] Index file path:', indexPath);
    
    try {
      await access(indexPath);
      console.log('[WORKSPACE MANAGER] Index file exists, reading...');
      
      const indexContent = await readFile(indexPath, 'utf-8');
      console.log('[WORKSPACE MANAGER] Index file content length:', indexContent.length);
      
      if (indexContent.trim()) {
        const indexData = JSON.parse(indexContent);
        console.log('[WORKSPACE MANAGER] Parsed index data:', {
          type: typeof indexData,
          isArray: Array.isArray(indexData),
          hasWorkspacesProperty: !!indexData.workspaces,
          keys: Object.keys(indexData)
        });
        
        // Clear existing index
        workspaceIndex.workspaces = {};
        
        // Handle both old object format and new array format
        if (Array.isArray(indexData)) {
          // New array format
          console.log('[WORKSPACE MANAGER] Loading from new array format');
          for (const workspace of indexData) {
            console.log(`[WORKSPACE MANAGER] Loading workspace from index: ${workspace.id}`);
            workspaceIndex.workspaces[workspace.id] = {
              ...workspace,
              createdAt: new Date(workspace.createdAt),
              lastAccessed: new Date(workspace.lastAccessed)
            };
          }
        } else if (indexData.workspaces && typeof indexData.workspaces === 'object') {
          // Old object format with workspaces property
          console.log('[WORKSPACE MANAGER] Loading from old object format');
          for (const [workspaceId, workspace] of Object.entries(indexData.workspaces)) {
            console.log(`[WORKSPACE MANAGER] Loading workspace from index: ${workspaceId}`);
            workspaceIndex.workspaces[workspaceId as WorkspaceId] = {
              ...workspace as any,
              createdAt: new Date((workspace as any).createdAt),
              lastAccessed: new Date((workspace as any).lastAccessed)
            };
          }
        } else {
          console.warn('[WORKSPACE MANAGER] Unknown index format, treating as empty');
        }
        
        console.log(`[WORKSPACE MANAGER] Loaded ${Object.keys(workspaceIndex.workspaces).length} workspaces from index`);
      } else {
        console.log('[WORKSPACE MANAGER] Index file is empty');
      }
    } catch (accessError) {
      console.log('[WORKSPACE MANAGER] Index file does not exist, creating empty index');
      workspaceIndex.workspaces = {};
      await saveWorkspaceIndex();
    }
  } catch (error) {
    console.error('[WORKSPACE MANAGER] Error loading workspace index:', error);
    throw error;
  }
}

/**
 * Save workspace index to disk
 */
async function saveWorkspaceIndex(): Promise<void> {
  console.log('[WORKSPACE MANAGER] Saving workspace index to disk');
  console.log('[WORKSPACE MANAGER] Current index size:', Object.keys(workspaceIndex.workspaces).length);
  
  try {
    const indexPath = await getWorkspaceIndexPath();
    const workspaces = Object.values(workspaceIndex.workspaces);
    
    console.log('[WORKSPACE MANAGER] Serializing workspaces:', workspaces.map(ws => ({
      id: ws.id,
      repoUrl: ws.repoUrl,
      path: ws.path
    })));
    
    const indexContent = JSON.stringify(workspaces, null, 2);
    console.log('[WORKSPACE MANAGER] Serialized content length:', indexContent.length);
    
    await writeFile(indexPath, indexContent, 'utf-8');
    console.log('[WORKSPACE MANAGER] Workspace index saved successfully');
  } catch (error) {
    console.error('[WORKSPACE MANAGER] Error saving workspace index:', error);
    throw error;
  }
}

/**
 * Get workspace index file path
 */
export async function getIndexPath(): Promise<FilePath> {
  return getWorkspaceIndexPath();
} 