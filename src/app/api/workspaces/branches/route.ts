import { NextRequest, NextResponse } from 'next/server';
import { WorkspaceManager } from '@/managers/WorkspaceManager';
import { RepositoryManager } from '@/managers/RepositoryManager';
import { CacheManager } from '@/managers/CacheManager';
import type { WorkspaceId } from '@/types/index';

// Initialize managers
const cacheManager = new CacheManager({
  expiryDays: 7,
  maxCacheSize: 1000000,
  includePatterns: ['**/*'],
  excludePatterns: ['node_modules/**', '.git/**', '*.log', '.env*']
});
const workspaceManager = new WorkspaceManager();
const repositoryManager = new RepositoryManager(cacheManager, workspaceManager);

export async function GET(request: NextRequest) {
  try {
    // Get workspaceId from query parameters
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');

    if (!workspaceId) {
      return NextResponse.json(
        { error: 'workspaceId query parameter is required' },
        { status: 400 }
      );
    }

    // Initialize managers
    await workspaceManager.initialize();
    await repositoryManager.loadAllWorkspacesFromStorage();

    // Get workspace
    const workspace = repositoryManager.getWorkspace(workspaceId as WorkspaceId);
    if (!workspace) {
      return NextResponse.json(
        { error: 'Workspace not found' },
        { status: 404 }
      );
    }

    // Get git operations for this workspace
    console.log('Getting git operations for workspace:', workspace.path);
    const gitOps = repositoryManager.getGitOperations(workspace.path);

    // Fetch all branches (local and remote) using the new method
    const branchesResult = await gitOps.getAllRemoteBranches(workspace.path);
    
    if (!branchesResult.success) {
      return NextResponse.json(
        { error: `Failed to get branches: ${branchesResult.error.message}` },
        { status: 500 }
      );
    }

    // Branches are already deduplicated and cleaned by getAllRemoteBranches
    const uniqueBranches = branchesResult.data;
    console.log('Fetched branches for workspace:', workspace.id, 'branches:', uniqueBranches);

    // Ensure workspace target branch is at the top if it exists
    const targetBranch = workspace.targetBranch;
    if (targetBranch && uniqueBranches.includes(targetBranch)) {
      const otherBranches = uniqueBranches.filter(branch => branch !== targetBranch);
      return NextResponse.json({
        branches: [targetBranch, ...otherBranches.sort()]
      });
    }

    return NextResponse.json({
      branches: uniqueBranches.sort()
    });

  } catch (error) {
    console.error('Error fetching branches:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 