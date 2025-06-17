/**
 * Workspace Manager - Persistent workspace management
 */

import { writeFile, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { getWorkspaceBaseDir } from '@/config/settings';
import type {
  Workspace,
  WorkspaceId,
  FilePath,
  AsyncResult
} from '@/types/index';

interface WorkspaceIndex {
  workspaces: Record<WorkspaceId, Workspace>;
  lastUpdated: string;
  version: string;
}

/**
 * Manages workspace persistence and state
 */
export class WorkspaceManager {
  private readonly workspaceIndexPath: FilePath;
  private workspaceIndex: WorkspaceIndex;

  constructor() {
    const workspaceBaseDir = getWorkspaceBaseDir();
    this.workspaceIndexPath = join(workspaceBaseDir, '.workspace-index.json') as FilePath;
    this.workspaceIndex = {
      workspaces: {},
      lastUpdated: new Date().toISOString(),
      version: '1.0.0'
    };
  }

  /**
   * Initialize workspace manager (load existing workspaces)
   */
  async initialize(): Promise<AsyncResult<void>> {
    try {
      await this.loadWorkspaceIndex();
      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: new Error(`Failed to initialize workspace manager: ${error}`)
      };
    }
  }

  /**
   * Save workspace to persistent storage
   */
  async saveWorkspace(workspace: Workspace): Promise<AsyncResult<void>> {
    try {
      this.workspaceIndex.workspaces[workspace.id] = workspace;
      this.workspaceIndex.lastUpdated = new Date().toISOString();
      
      await this.saveWorkspaceIndex();
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
  async loadWorkspace(workspaceId: WorkspaceId): Promise<AsyncResult<Workspace>> {
    try {
      await this.loadWorkspaceIndex();
      
      const workspace = this.workspaceIndex.workspaces[workspaceId];
      if (!workspace) {
        return {
          success: false,
          error: new Error(`Workspace ${workspaceId} not found`)
        };
      }

      // Update last accessed time
      workspace.lastAccessed = new Date();
      await this.saveWorkspace(workspace);

      return { success: true, data: workspace };
    } catch (error) {
      return {
        success: false,
        error: new Error(`Failed to load workspace: ${error}`)
      };
    }
  }

  /**
   * Get all workspaces from persistent storage
   */
  async getAllWorkspaces(): Promise<AsyncResult<Workspace[]>> {
    try {
      await this.loadWorkspaceIndex();
      
      const workspaces = Object.values(this.workspaceIndex.workspaces)
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
  async deleteWorkspace(workspaceId: WorkspaceId): Promise<AsyncResult<void>> {
    try {
      delete this.workspaceIndex.workspaces[workspaceId];
      this.workspaceIndex.lastUpdated = new Date().toISOString();
      
      await this.saveWorkspaceIndex();
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
  async updateWorkspace(workspace: Workspace): Promise<AsyncResult<void>> {
    try {
      if (!this.workspaceIndex.workspaces[workspace.id]) {
        return {
          success: false,
          error: new Error(`Workspace ${workspace.id} not found`)
        };
      }

      return await this.saveWorkspace(workspace);
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
  async workspaceExists(workspaceId: WorkspaceId): Promise<boolean> {
    try {
      await this.loadWorkspaceIndex();
      return workspaceId in this.workspaceIndex.workspaces;
    } catch {
      return false;
    }
  }

  /**
   * Get workspace statistics
   */
  async getWorkspaceStats(): Promise<AsyncResult<{
    total: number;
    active: number;
    inactive: number;
    totalSize: number;
    oldestAccess: Date | null;
    newestAccess: Date | null;
  }>> {
    try {
      const result = await this.getAllWorkspaces();
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
  async cleanupOldWorkspaces(maxAgeHours: number = 24 * 7): Promise<AsyncResult<number>> {
    try {
      const result = await this.getAllWorkspaces();
      if (!result.success) {
        return result;
      }

      const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
      let cleanedCount = 0;

      for (const workspace of result.data) {
        if (new Date(workspace.lastAccessed) < cutoffTime && workspace.metadata?.isActive) {
          workspace.metadata.isActive = false;
          await this.saveWorkspace(workspace);
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
  private async loadWorkspaceIndex(): Promise<void> {
    try {
      await stat(this.workspaceIndexPath);
      const content = await readFile(this.workspaceIndexPath, 'utf-8');
      this.workspaceIndex = JSON.parse(content);
      
      // Convert date strings back to Date objects
      Object.values(this.workspaceIndex.workspaces).forEach(workspace => {
        workspace.createdAt = new Date(workspace.createdAt);
        workspace.lastAccessed = new Date(workspace.lastAccessed);
      });
    } catch {
      // File doesn't exist or is corrupted, start with empty index
      this.workspaceIndex = {
        workspaces: {},
        lastUpdated: new Date().toISOString(),
        version: '1.0.0'
      };
    }
  }

  /**
   * Save workspace index to disk
   */
  private async saveWorkspaceIndex(): Promise<void> {
    const content = JSON.stringify(this.workspaceIndex, null, 2);
    await writeFile(this.workspaceIndexPath, content, 'utf-8');
  }

  /**
   * Get workspace index file path
   */
  getIndexPath(): FilePath {
    return this.workspaceIndexPath;
  }
} 