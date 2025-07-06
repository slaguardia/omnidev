'use server';

import { writeFile, readFile, access, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { getWorkspaceBaseDir } from '@/lib/config/server-actions';
import type {
  WorkspaceId,
  FilePath,
  AsyncResult
} from '@/lib/common/types';
import type { Workspace } from './types';

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
    const workspaceBaseDir = await getWorkspaceBaseDir();
    workspaceIndexPath = join(workspaceBaseDir, '.workspace-index.json') as FilePath;
  }
  return workspaceIndexPath;
}

/**
 * Initialize workspace storage and create necessary directories
 */
export async function initializeWorkspaceStorage(): Promise<AsyncResult<void>> {
  try {
    const indexPath = await getWorkspaceIndexPath();
    
    // Ensure the directory exists
    const indexDir = dirname(indexPath);
    await mkdir(indexDir, { recursive: true });
    
    // Load or create the workspace index
    await loadWorkspaceIndex();
    
    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to initialize workspace storage: ${error}`)
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
 * Get all workspaces from storage
 */
export async function getAllWorkspaces(): Promise<AsyncResult<Workspace[]>> {
  try {
    await loadWorkspaceIndex();
    
    const workspaces = Object.values(workspaceIndex.workspaces)
      .sort((a, b) => new Date(b.lastAccessed).getTime() - new Date(a.lastAccessed).getTime());
    
    return { success: true, data: workspaces };
  } catch (error) {
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
 * Load workspace index from disk
 */
async function loadWorkspaceIndex(): Promise<void> {
  try {
    const indexPath = await getWorkspaceIndexPath();
    
    try {
      await access(indexPath);
      const indexContent = await readFile(indexPath, 'utf-8');
      
      if (indexContent.trim()) {
        const indexData = JSON.parse(indexContent);
        
        // Clear existing index
        workspaceIndex.workspaces = {};
        
        // Handle both old object format and new array format
        if (Array.isArray(indexData)) {
          // New array format
          for (const workspace of indexData) {
            workspaceIndex.workspaces[workspace.id] = {
              ...workspace,
              createdAt: new Date(workspace.createdAt),
              lastAccessed: new Date(workspace.lastAccessed)
            };
          }
        } else if (indexData.workspaces && typeof indexData.workspaces === 'object') {
          // Old object format with workspaces property
          for (const [workspaceId, workspace] of Object.entries(indexData.workspaces)) {
            const workspaceData = workspace as Workspace;
            workspaceIndex.workspaces[workspaceId as WorkspaceId] = {
              ...workspaceData,
              createdAt: new Date(workspaceData.createdAt),
              lastAccessed: new Date(workspaceData.lastAccessed)
            };
          }
        }
      }
    } catch {
      // Index file doesn't exist, initialize empty index
      workspaceIndex.workspaces = {};
      await saveWorkspaceIndex();
    }
  } catch (error) {
    throw new Error(`Failed to load workspace index: ${error}`);
  }
}

/**
 * Save workspace index to disk
 */
async function saveWorkspaceIndex(): Promise<void> {
  try {
    const indexPath = await getWorkspaceIndexPath();
    const workspaces = Object.values(workspaceIndex.workspaces);
    
    const indexContent = JSON.stringify(workspaces, null, 2);
    await writeFile(indexPath, indexContent, 'utf-8');
  } catch (error) {
    throw new Error(`Failed to save workspace index: ${error}`);
  }
} 