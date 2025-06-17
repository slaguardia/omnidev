import { NextRequest, NextResponse } from 'next/server';
import { RepositoryManager } from '@/managers/RepositoryManager';
import { WorkspaceManager } from '@/managers/WorkspaceManager';
import { CacheManager } from '@/managers/CacheManager';
import { CACHE_CONFIG } from '@/config/cache';
import type { WorkspaceId } from '@/types/index';

const cacheManager = new CacheManager(CACHE_CONFIG);
const workspaceManager = new WorkspaceManager();
const repositoryManager = new RepositoryManager(cacheManager, workspaceManager);

export async function POST(request: NextRequest) {
  try {
    const { workspaceId, all = false, force = false } = await request.json();

    // Initialize workspace manager
    const initResult = await workspaceManager.initialize();
    if (!initResult.success) {
      return NextResponse.json(
        { error: 'Failed to initialize workspace manager', details: initResult.error?.message },
        { status: 500 }
      );
    }

    if (workspaceId) {
      // Clean specific workspace
      const cleanResult = await repositoryManager.cleanupWorkspace(workspaceId as WorkspaceId);
      if (!cleanResult.success) {
        return NextResponse.json(
          { error: 'Failed to clean workspace', details: cleanResult.error?.message },
          { status: 500 }
        );
      }

      // Remove from persistent storage
      const deleteResult = await workspaceManager.deleteWorkspace(workspaceId as WorkspaceId);
      if (!deleteResult.success) {
        console.warn('Warning: Failed to remove workspace from persistent storage');
      }

      return NextResponse.json({
        success: true,
        message: `Workspace ${workspaceId} cleaned successfully`,
        cleanedWorkspaces: 1
      });

    } else if (all) {
      if (!force) {
        return NextResponse.json(
          { error: 'Force flag is required for bulk cleanup operations' },
          { status: 400 }
        );
      }

      // Get all workspaces
      const workspacesResult = await workspaceManager.getAllWorkspaces();
      if (!workspacesResult.success) {
        return NextResponse.json(
          { error: 'Failed to get workspaces', details: workspacesResult.error?.message },
          { status: 500 }
        );
      }

      const allWorkspaces = workspacesResult.data;
      let cleanedCount = 0;
      const errors: string[] = [];

      // Clean each workspace
      for (const workspace of allWorkspaces) {
        try {
          const cleanResult = await repositoryManager.cleanupWorkspace(workspace.id);
          if (cleanResult.success) {
            await workspaceManager.deleteWorkspace(workspace.id);
            cleanedCount++;
          } else {
            errors.push(`Failed to clean ${workspace.id}: ${cleanResult.error?.message}`);
          }
        } catch (error) {
          errors.push(`Error cleaning ${workspace.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      return NextResponse.json({
        success: true,
        message: `Cleaned ${cleanedCount}/${allWorkspaces.length} workspaces`,
        cleanedWorkspaces: cleanedCount,
        totalWorkspaces: allWorkspaces.length,
        errors: errors.length > 0 ? errors : undefined
      });

    } else {
      // Get workspace stats for information
      const statsResult = await workspaceManager.getWorkspaceStats();
      if (!statsResult.success) {
        return NextResponse.json(
          { error: 'Failed to get workspace stats', details: statsResult.error?.message },
          { status: 500 }
        );
      }

      const stats = statsResult.data;
      return NextResponse.json({
        success: true,
        message: 'Specify workspaceId for single cleanup or use all=true for bulk cleanup',
        stats: {
          total: stats.total,
          active: stats.active,
          inactive: stats.inactive,
          totalSizeMB: Math.round(stats.totalSize / 1024 / 1024)
        }
      });
    }

  } catch (error) {
    console.error('Error in cleanup API:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 