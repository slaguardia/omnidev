import { NextRequest, NextResponse } from 'next/server';
import { RepositoryManager } from '@/managers/RepositoryManager';
import { CacheManager } from '@/managers/CacheManager';
import { WorkspaceManager } from '@/managers/WorkspaceManager';
import type { WorkspaceId } from '@/types/index';

// Create instances
const cacheManager = new CacheManager({
  expiryDays: 7,
  maxCacheSize: 1000000, // 1MB
  includePatterns: ['**/*'],
  excludePatterns: ['node_modules/**', '.git/**', '*.log', '.env*']
});
const workspaceManager = new WorkspaceManager();
const repositoryManager = new RepositoryManager(cacheManager, workspaceManager);

export async function GET(request: NextRequest) {
  try {
    // Initialize workspace manager first
    const initResult = await workspaceManager.initialize();
    if (!initResult.success) {
      console.error('Failed to initialize workspace manager:', initResult.error);
      return NextResponse.json({
        success: true,
        data: []
      });
    }

    await repositoryManager.loadAllWorkspacesFromStorage();
    const workspaces = repositoryManager.listWorkspaces();
    
    return NextResponse.json({
      success: true,
      data: workspaces
    });
  } catch (error) {
    console.error('Error fetching workspaces:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch workspaces' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action, workspaceId, ...params } = await request.json();

    switch (action) {
      case 'setGitConfig':
        return await handleSetGitConfig(workspaceId, params);
      case 'getGitConfig':
        return await handleGetGitConfig(workspaceId);
      case 'unsetGitConfig':
        return await handleUnsetGitConfig(workspaceId, params);
      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Error processing workspace request:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process request' },
      { status: 500 }
    );
  }
}

async function handleSetGitConfig(workspaceId: WorkspaceId, params: any) {
  const { userEmail, userName, signingKey } = params;
  
  if (!workspaceId) {
    return NextResponse.json(
      { success: false, error: 'Workspace ID is required' },
      { status: 400 }
    );
  }

  const result = await repositoryManager.setWorkspaceGitConfig(workspaceId, {
    userEmail,
    userName,
    signingKey
  });

  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    message: 'Git configuration updated successfully'
  });
}

async function handleGetGitConfig(workspaceId: WorkspaceId) {
  if (!workspaceId) {
    return NextResponse.json(
      { success: false, error: 'Workspace ID is required' },
      { status: 400 }
    );
  }

  const result = await repositoryManager.getWorkspaceGitConfig(workspaceId);

  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    data: result.data
  });
}

async function handleUnsetGitConfig(workspaceId: WorkspaceId, params: any) {
  const { keys } = params;
  
  if (!workspaceId) {
    return NextResponse.json(
      { success: false, error: 'Workspace ID is required' },
      { status: 400 }
    );
  }

  if (!keys || !Array.isArray(keys)) {
    return NextResponse.json(
      { success: false, error: 'Keys array is required' },
      { status: 400 }
    );
  }

  const result = await repositoryManager.unsetWorkspaceGitConfig(workspaceId, keys);

  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    message: 'Git configuration removed successfully'
  });
}

/**
 * PATCH /api/workspaces - Update workspace or perform workspace operations
 */
export async function PATCH(request: Request) {
  try {
    const { workspaceId, action, ...updateData } = await request.json();

    if (!workspaceId) {
      return NextResponse.json(
        { error: 'Workspace ID is required' },
        { status: 400 }
      );
    }

    // Use the existing repositoryManager instance

    // Handle different actions
    if (action === 'initializeGitWorkflow') {
      const result = await repositoryManager.initializeGitWorkflow(workspaceId, updateData.sourceBranch, updateData.taskId);
      
      if (!result.success) {
        return NextResponse.json(
          { error: result.error.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: 'Git workflow initialized successfully'
      });
    }

    // Handle regular workspace updates
    if (action === 'update') {
      const result = await repositoryManager.updateWorkspace(workspaceId, updateData);
      
      if (!result.success) {
        return NextResponse.json(
          { error: result.error.message },
          { status: 500 }
        );
      }

      return NextResponse.json(result.data);
    }

    // Handle switching branches
    if (action === 'switchBranch') {
      const { branchName } = updateData;
      if (!branchName) {
        return NextResponse.json(
          { error: 'Branch name is required' },
          { status: 400 }
        );
      }

      const result = await repositoryManager.switchBranch(workspaceId, branchName);
      
      if (!result.success) {
        return NextResponse.json(
          { error: result.error.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: `Switched to branch ${branchName}`
      });
    }

    // Handle pulling changes
    if (action === 'pullChanges') {
      const result = await repositoryManager.pullChanges(workspaceId);
      
      if (!result.success) {
        return NextResponse.json(
          { error: result.error.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: 'Changes pulled successfully'
      });
    }

    return NextResponse.json(
      { error: 'Invalid action specified' },
      { status: 400 }
    );

  } catch (error) {
    console.error('Error in workspace PATCH:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 