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
    const { workspaceId } = await request.json();

    if (!workspaceId) {
      return NextResponse.json(
        { error: 'Workspace ID is required' },
        { status: 400 }
      );
    }

    // Initialize workspace manager
    const initResult = await workspaceManager.initialize();
    if (!initResult.success) {
      return NextResponse.json(
        { error: 'Failed to initialize workspace manager', details: initResult.error?.message },
        { status: 500 }
      );
    }

    // Get workspace
    const workspaceResult = await workspaceManager.loadWorkspace(workspaceId as WorkspaceId);
    if (!workspaceResult.success) {
      return NextResponse.json(
        { error: 'Failed to load workspace', details: workspaceResult.error?.message },
        { status: 404 }
      );
    }

    const workspace = workspaceResult.data;

    // Check cache status
    const cacheResult = await cacheManager.getCache(workspace.path);
    if (!cacheResult.success) {
      return NextResponse.json(
        { error: 'Failed to check cache status', details: cacheResult.error?.message },
        { status: 500 }
      );
    }

    const cacheData = cacheResult.data;

    if (!cacheData) {
      return NextResponse.json({
        success: true,
        cacheExists: false,
        message: 'No cache found for this workspace'
      });
    }

    // Check if cache is outdated
    let isOutdated = false;
    const currentCommitResult = await repositoryManager.getGitOperations(workspace.path).getCurrentCommitHash(workspace.path);
    if (currentCommitResult.success && currentCommitResult.data !== cacheData.lastCommitHash) {
      isOutdated = true;
    }

    return NextResponse.json({
      success: true,
      cacheExists: true,
      cache: {
        lastUpdated: cacheData.lastUpdated,
        version: cacheData.version,
        lastCommitHash: cacheData.lastCommitHash,
        directoryHash: cacheData.directoryHash,
        fileCount: cacheData.analysis?.fileCount,
        languages: cacheData.analysis?.languages,
        aiSummary: cacheData.analysis?.aiSummary?.slice(0, 200),
        isOutdated
      },
      workspace: {
        id: workspace.id,
        path: workspace.path
      }
    });

  } catch (error) {
    console.error('Error in cache-status API:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 