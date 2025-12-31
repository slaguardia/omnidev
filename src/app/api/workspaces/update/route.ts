import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { initializeWorkspaceManager, loadWorkspace } from '@/lib/managers/workspace-manager';
import {
  updateWorkspace,
  loadAllWorkspacesFromStorage,
} from '@/lib/managers/repository-manager';
import { isGitLabUrl, isGitHubUrl } from '@/lib/git';
import {
  extractProjectIdFromUrl as extractGitLabProjectId,
  getGitLabConfig,
  getRepositoryPermissions as getGitLabRepositoryPermissions,
} from '@/lib/gitlab';
import {
  extractOwnerRepoFromUrl as extractGitHubOwnerRepo,
  getGitHubConfig,
  getRepositoryPermissions as getGitHubRepositoryPermissions,
} from '@/lib/github';
import type { WorkspaceId, WorkspacePermissions } from '@/lib/types/index';
import * as WorkspaceManagerModule from '@/lib/managers/workspace-manager';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log(`[WORKSPACE UPDATE API] Request started at ${new Date().toISOString()}`);

  try {
    // Authentication
    const authResult = await withAuth(request);
    if (!authResult.success) {
      return authResult.response!;
    }

    // Parse body
    let body: { workspaceId?: string; targetBranch?: string; refreshPermissions?: boolean };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { workspaceId, targetBranch, refreshPermissions } = body;

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
    }

    // Initialize workspace manager
    console.log(`[WORKSPACE UPDATE API] Initializing workspace manager...`);
    await initializeWorkspaceManager();
    await loadAllWorkspacesFromStorage();

    // Load workspace
    const workspaceResult = await loadWorkspace(workspaceId as WorkspaceId);
    if (!workspaceResult.success) {
      return NextResponse.json(
        { error: 'Workspace not found', details: workspaceResult.error?.message },
        { status: 404 }
      );
    }

    const workspace = workspaceResult.data;
    const branchToCheck = targetBranch || workspace.targetBranch;

    // Prepare updates
    const updates: { targetBranch?: string; metadata?: { permissions?: WorkspacePermissions } } = {};

    if (targetBranch && targetBranch !== workspace.targetBranch) {
      updates.targetBranch = targetBranch;
      console.log(`[WORKSPACE UPDATE API] Updating targetBranch from ${workspace.targetBranch} to ${targetBranch}`);
    }

    // Refresh permissions if requested or if branch changed
    if (refreshPermissions || (targetBranch && targetBranch !== workspace.targetBranch)) {
      console.log(`[WORKSPACE UPDATE API] Refreshing permissions for branch: ${branchToCheck}`);

      let permissions: WorkspacePermissions | undefined;

      if (isGitLabUrl(workspace.repoUrl)) {
        const gitlabConfig = await getGitLabConfig();
        if (gitlabConfig.token) {
          const projectId = extractGitLabProjectId(workspace.repoUrl);
          if (projectId) {
            const permResult = await getGitLabRepositoryPermissions(
              projectId,
              branchToCheck,
              gitlabConfig.baseUrl,
              gitlabConfig.token
            );
            if (permResult.success) {
              permissions = permResult.data;
              console.log('[WORKSPACE UPDATE API] GitLab permissions refreshed:', {
                accessLevel: permResult.data.accessLevelName,
                targetBranchProtected: permResult.data.targetBranchProtected,
              });
            } else {
              console.warn('[WORKSPACE UPDATE API] Could not check GitLab permissions:', permResult.error?.message);
            }
          }
        } else {
          console.log('[WORKSPACE UPDATE API] No GitLab token configured, skipping permission check');
        }
      } else if (isGitHubUrl(workspace.repoUrl)) {
        const githubConfig = await getGitHubConfig();
        if (githubConfig.token) {
          const ownerRepo = extractGitHubOwnerRepo(workspace.repoUrl);
          if (ownerRepo) {
            const permResult = await getGitHubRepositoryPermissions(
              ownerRepo.owner,
              ownerRepo.repo,
              branchToCheck,
              githubConfig.token
            );
            if (permResult.success) {
              permissions = permResult.data;
              console.log('[WORKSPACE UPDATE API] GitHub permissions refreshed:', {
                accessLevel: permResult.data.accessLevelName,
                targetBranchProtected: permResult.data.targetBranchProtected,
              });
            } else {
              console.warn('[WORKSPACE UPDATE API] Could not check GitHub permissions:', permResult.error?.message);
            }
          }
        } else {
          console.log('[WORKSPACE UPDATE API] No GitHub token configured, skipping permission check');
        }
      }

      if (permissions) {
        updates.metadata = { permissions };
      }
    }

    // Apply updates if there are any
    if (Object.keys(updates).length > 0) {
      const updateResult = await updateWorkspace(workspaceId as WorkspaceId, updates);
      if (!updateResult.success) {
        return NextResponse.json(
          { error: 'Failed to update workspace', details: updateResult.error?.message },
          { status: 500 }
        );
      }

      // Persist to WorkspaceManager storage
      const updatedWorkspace = updateResult.data;
      await WorkspaceManagerModule.updateWorkspace(updatedWorkspace);

      const totalTime = Date.now() - startTime;
      console.log(`[WORKSPACE UPDATE API] Completed in ${totalTime}ms`);

      return NextResponse.json({
        success: true,
        workspace: {
          id: updatedWorkspace.id,
          targetBranch: updatedWorkspace.targetBranch,
          permissions: updatedWorkspace.metadata?.permissions,
        },
      });
    }

    // No updates needed
    const totalTime = Date.now() - startTime;
    console.log(`[WORKSPACE UPDATE API] No changes needed, completed in ${totalTime}ms`);

    return NextResponse.json({
      success: true,
      workspace: {
        id: workspace.id,
        targetBranch: workspace.targetBranch,
        permissions: workspace.metadata?.permissions,
      },
    });
  } catch (error) {
    console.error(`[WORKSPACE UPDATE API] Failed:`, error);
    return NextResponse.json(
      {
        error: 'Failed to update workspace',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
