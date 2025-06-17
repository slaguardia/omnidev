import { NextRequest, NextResponse } from 'next/server';
import { RepositoryManager } from '@/managers/RepositoryManager';
import { WorkspaceManager } from '@/managers/WorkspaceManager';
import { CacheManager } from '@/managers/CacheManager';
import type { GitUrl } from '@/types/index';

const cacheManager = new CacheManager({
  expiryDays: 7,
  maxCacheSize: 100 * 1024 * 1024, // 100MB
  includePatterns: ['**/*.ts', '**/*.js', '**/*.json', '**/*.md', '**/*.yml', '**/*.yaml'],
  excludePatterns: ['node_modules/**', 'dist/**', '.git/**', '**/.DS_Store']
});
const workspaceManager = new WorkspaceManager();
const repositoryManager = new RepositoryManager(cacheManager, workspaceManager);

export async function POST(request: NextRequest) {
  try {
    const { repoUrl, branch, depth = 1, singleBranch = false } = await request.json();

    if (!repoUrl) {
      return NextResponse.json(
        { error: 'Repository URL is required' },
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

    // Clone repository
    const cloneResult = await repositoryManager.cloneRepository(repoUrl as GitUrl, {
      branch,
      depth: parseInt(depth),
      singleBranch
    });

    if (!cloneResult.success) {
      return NextResponse.json(
        { error: 'Failed to clone repository', details: cloneResult.error?.message },
        { status: 500 }
      );
    }

    const workspace = cloneResult.data;

    // Save workspace to persistent storage
    const saveResult = await workspaceManager.saveWorkspace(workspace);
    if (!saveResult.success) {
      console.warn('Warning: Failed to save workspace to persistent storage');
    }

    return NextResponse.json({
      success: true,
      workspace: {
        id: workspace.id,
        path: workspace.path,
        metadata: workspace.metadata
      }
    });

  } catch (error) {
    console.error('Error in clone API:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 