import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { initializeWorkspaceManager, loadWorkspace } from '@/lib/managers/workspace-manager';
import { updateWorkspace, loadAllWorkspacesFromStorage } from '@/lib/managers/repository-manager';
import type { WorkspaceId } from '@/lib/types/index';
import * as WorkspaceManagerModule from '@/lib/managers/workspace-manager';
import {
  badRequest,
  notFound,
  serverError,
  parseJsonBody,
  createRequestTimer,
  fetchRepositoryPermissions,
} from '@/lib/api';

export async function POST(request: NextRequest) {
  const timer = createRequestTimer('REFRESH PERMISSIONS API');

  try {
    // Authentication
    const authResult = await withAuth(request);
    if (!authResult.success) {
      return authResult.response!;
    }

    // Parse body
    const bodyResult = await parseJsonBody<{ workspaceId?: string }>(
      request,
      'REFRESH PERMISSIONS API'
    );
    if (!bodyResult.success) {
      return bodyResult.response;
    }

    const { workspaceId } = bodyResult.data;

    if (!workspaceId) {
      return badRequest('workspaceId is required');
    }

    // Initialize workspace manager
    console.log(`[REFRESH PERMISSIONS API] Initializing workspace manager...`);
    await initializeWorkspaceManager();
    await loadAllWorkspacesFromStorage();

    // Load workspace
    const workspaceResult = await loadWorkspace(workspaceId as WorkspaceId);
    if (!workspaceResult.success) {
      return notFound('Workspace not found', workspaceResult.error?.message);
    }

    const workspace = workspaceResult.data;
    const branchToCheck = workspace.targetBranch;

    console.log(`[REFRESH PERMISSIONS API] Refreshing permissions for branch: ${branchToCheck}`);

    // Fetch permissions using shared helper
    const permResult = await fetchRepositoryPermissions({
      repoUrl: workspace.repoUrl,
      branch: branchToCheck,
      logPrefix: 'REFRESH PERMISSIONS API',
    });

    if (!permResult.success) {
      return serverError(permResult.error, 'Failed to fetch permissions');
    }

    const { permissions, missingConfig, error: configError } = permResult.data;

    // Handle missing configuration
    if (missingConfig && configError) {
      return badRequest(configError);
    }

    if (!permissions) {
      return serverError(new Error('No permissions returned'), 'Could not determine permissions');
    }

    // Update workspace with new permissions
    const updateResult = await updateWorkspace(workspaceId as WorkspaceId, {
      metadata: { permissions },
    });
    if (!updateResult.success) {
      return serverError(updateResult.error, 'Failed to update workspace');
    }

    // Persist to WorkspaceManager storage
    const updatedWorkspace = updateResult.data;
    await WorkspaceManagerModule.updateWorkspace(updatedWorkspace);

    timer.logComplete();

    return NextResponse.json({
      success: true,
      permissions,
    });
  } catch (error) {
    timer.logError(error);
    return serverError(error, 'Failed to refresh permissions');
  }
}
