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
  console.log(`[REFRESH PERMISSIONS API] Request started at ${new Date().toISOString()}`);

  try {
    // Authentication
    const authResult = await withAuth(request);
    if (!authResult.success) {
      return authResult.response!;
    }

    // Parse body
    let body: { workspaceId?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { workspaceId } = body;

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
    }

    // Initialize workspace manager
    console.log(`[REFRESH PERMISSIONS API] Initializing workspace manager...`);
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
    const branchToCheck = workspace.targetBranch;

    console.log(`[REFRESH PERMISSIONS API] Refreshing permissions for branch: ${branchToCheck}`);

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
            console.log('[REFRESH PERMISSIONS API] GitLab permissions refreshed:', {
              accessLevel: permResult.data.accessLevelName,
              targetBranchProtected: permResult.data.targetBranchProtected,
              canPushToProtected: permResult.data.canPushToProtected,
            });
          } else {
            console.warn('[REFRESH PERMISSIONS API] Could not check GitLab permissions:', permResult.error?.message);
            return NextResponse.json(
              { error: 'Failed to check GitLab permissions', details: permResult.error?.message },
              { status: 500 }
            );
          }
        } else {
          return NextResponse.json(
            { error: 'Could not extract GitLab project ID from repository URL' },
            { status: 400 }
          );
        }
      } else {
        return NextResponse.json(
          { error: 'No GitLab token configured. Configure credentials in Git Source Config.' },
          { status: 400 }
        );
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
            console.log('[REFRESH PERMISSIONS API] GitHub permissions refreshed:', {
              accessLevel: permResult.data.accessLevelName,
              targetBranchProtected: permResult.data.targetBranchProtected,
              canPushToProtected: permResult.data.canPushToProtected,
            });
          } else {
            console.warn('[REFRESH PERMISSIONS API] Could not check GitHub permissions:', permResult.error?.message);
            return NextResponse.json(
              { error: 'Failed to check GitHub permissions', details: permResult.error?.message },
              { status: 500 }
            );
          }
        } else {
          return NextResponse.json(
            { error: 'Could not extract GitHub owner/repo from repository URL' },
            { status: 400 }
          );
        }
      } else {
        return NextResponse.json(
          { error: 'No GitHub token configured. Configure credentials in Git Source Config.' },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        { error: 'Unknown repository provider. Only GitHub and GitLab are supported.' },
        { status: 400 }
      );
    }

    // Update workspace with new permissions
    if (permissions) {
      const updateResult = await updateWorkspace(workspaceId as WorkspaceId, {
        metadata: { permissions },
      });
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
      console.log(`[REFRESH PERMISSIONS API] Completed in ${totalTime}ms`);

      return NextResponse.json({
        success: true,
        permissions,
      });
    }

    return NextResponse.json(
      { error: 'Could not determine permissions' },
      { status: 500 }
    );
  } catch (error) {
    console.error(`[REFRESH PERMISSIONS API] Failed:`, error);
    return NextResponse.json(
      {
        error: 'Failed to refresh permissions',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
