import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { initializeWorkspaceManager, loadWorkspace } from '@/lib/managers/workspace-manager';
import { updateWorkspace, loadAllWorkspacesFromStorage } from '@/lib/managers/repository-manager';
import type { WorkspaceId, WorkspacePermissions } from '@/lib/types/index';
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
  const timer = createRequestTimer('WORKSPACE UPDATE API');

  try {
    // Authentication
    const authResult = await withAuth(request);
    if (!authResult.success) {
      return authResult.response!;
    }

    // Parse body
    const bodyResult = await parseJsonBody<{
      workspaceId?: string;
      targetBranch?: string;
      refreshPermissions?: boolean;
    }>(request, 'WORKSPACE UPDATE API');
    if (!bodyResult.success) {
      return bodyResult.response;
    }

    const { workspaceId, targetBranch, refreshPermissions } = bodyResult.data;

    if (!workspaceId) {
      return badRequest('workspaceId is required');
    }

    // Initialize workspace manager
    console.log(`[WORKSPACE UPDATE API] Initializing workspace manager...`);
    await initializeWorkspaceManager();
    await loadAllWorkspacesFromStorage();

    // Load workspace
    const workspaceResult = await loadWorkspace(workspaceId as WorkspaceId);
    if (!workspaceResult.success) {
      return notFound('Workspace not found', workspaceResult.error?.message);
    }

    const workspace = workspaceResult.data;
    const branchToCheck = targetBranch || workspace.targetBranch;

    // Prepare updates
    const updates: { targetBranch?: string; metadata?: { permissions?: WorkspacePermissions } } = {};

    if (targetBranch && targetBranch !== workspace.targetBranch) {
      updates.targetBranch = targetBranch;
      console.log(
        `[WORKSPACE UPDATE API] Updating targetBranch from ${workspace.targetBranch} to ${targetBranch}`
      );
    }

    // Refresh permissions if requested or if branch changed
    if (refreshPermissions || (targetBranch && targetBranch !== workspace.targetBranch)) {
      console.log(`[WORKSPACE UPDATE API] Refreshing permissions for branch: ${branchToCheck}`);

      const permResult = await fetchRepositoryPermissions({
        repoUrl: workspace.repoUrl,
        branch: branchToCheck,
        logPrefix: 'WORKSPACE UPDATE API',
      });

      // Only use permissions if fetch was successful and returned data
      if (permResult.success && permResult.data.permissions) {
        updates.metadata = { permissions: permResult.data.permissions };
      }
      // Note: We don't fail the update if permissions fetch fails - just log warning
      // (This matches the original behavior where missing config was not an error)
    }

    // Apply updates if there are any
    if (Object.keys(updates).length > 0) {
      const updateResult = await updateWorkspace(workspaceId as WorkspaceId, updates);
      if (!updateResult.success) {
        return serverError(updateResult.error, 'Failed to update workspace');
      }

      // Persist to WorkspaceManager storage
      const updatedWorkspace = updateResult.data;
      await WorkspaceManagerModule.updateWorkspace(updatedWorkspace);

      timer.logComplete();

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
    console.log(`[WORKSPACE UPDATE API] No changes needed`);
    timer.logComplete();

    return NextResponse.json({
      success: true,
      workspace: {
        id: workspace.id,
        targetBranch: workspace.targetBranch,
        permissions: workspace.metadata?.permissions,
      },
    });
  } catch (error) {
    timer.logError(error);
    return serverError(error, 'Failed to update workspace');
  }
}
