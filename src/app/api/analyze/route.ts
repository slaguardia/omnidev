import { NextRequest, NextResponse } from 'next/server';
import { RepositoryManager } from '@/managers/RepositoryManager';
import { WorkspaceManager } from '@/managers/WorkspaceManager';
import { CacheManager } from '@/managers/CacheManager';
import type { WorkspaceId } from '@/types/index';

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
    const { workspaceId, directory = '.', language } = await request.json();

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

    // Analyze directory
    const analysisResult = await cacheManager.analyzeDirectory(workspace.path);
    if (!analysisResult.success) {
      return NextResponse.json(
        { error: 'Failed to analyze directory', details: analysisResult.error?.message },
        { status: 500 }
      );
    }

    const analysis = analysisResult.data;

    // Update cache
    const currentCommitResult = await repositoryManager.getGitOperations(workspace.path).getCurrentCommitHash(workspace.path);
    if (currentCommitResult.success) {
      const setCacheResult = await cacheManager.setCache(
        workspace.path,
        analysis,
        currentCommitResult.data
      );

      if (!setCacheResult.success) {
        console.warn('Warning: Failed to update cache');
      }
    }

    return NextResponse.json({
      success: true,
      analysis: {
        fileCount: analysis.fileCount,
        languages: analysis.languages,
        structure: analysis.structure.slice(0, 20), // Limit structure for response size
        aiSummary: analysis.aiSummary
      },
      workspace: {
        id: workspace.id,
        path: workspace.path
      }
    });

  } catch (error) {
    console.error('Error in analyze API:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 