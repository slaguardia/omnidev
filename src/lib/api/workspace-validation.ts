import { NextResponse } from 'next/server';
import { initializeWorkspaceStorage, loadWorkspace } from '@/lib/workspace/storage';
import { access } from 'node:fs/promises';
import type { WorkspaceId } from '@/lib/common/types';
import { WorkspaceValidationResult } from './types';

/**
 * Validates and loads a workspace, including initialization and access checks
 */
export async function validateAndLoadWorkspace(
  workspaceId: WorkspaceId,
  logPrefix: string
): Promise<WorkspaceValidationResult> {
  // ============================================================================
  // STEP 2: WORKSPACE INITIALIZATION & LOADING
  // ============================================================================

  // Initialize workspace manager
  console.log(`[${logPrefix}] Initializing workspace manager...`);
  const initStart = Date.now();
  const initResult = await initializeWorkspaceStorage();
  console.log(`[${logPrefix}] Workspace manager initialized in ${Date.now() - initStart}ms`);

  if (!initResult.success) {
    console.error(
      `[${logPrefix}] Failed to initialize workspace manager:`,
      initResult.error?.message
    );
    return {
      success: false,
      error: 'Failed to initialize workspace manager',
      response: NextResponse.json(
        { error: 'Failed to initialize workspace manager', details: initResult.error?.message },
        { status: 500 }
      ),
    };
  }

  // Get workspace
  console.log(`[${logPrefix}] Loading workspace: ${workspaceId}`);
  const workspaceStart = Date.now();
  const workspaceResult = await loadWorkspace(workspaceId as WorkspaceId);
  console.log(`[${logPrefix}] Workspace loaded in ${Date.now() - workspaceStart}ms`);

  if (!workspaceResult.success) {
    console.error(`[${logPrefix}] Failed to load workspace:`, workspaceResult.error?.message);
    return {
      success: false,
      error: 'Failed to load workspace',
      response: NextResponse.json(
        { error: 'Failed to load workspace', details: workspaceResult.error?.message },
        { status: 404 }
      ),
    };
  }

  const workspace = workspaceResult.data;

  // Ensure workspace has a valid ID
  if (!workspace.id) {
    console.error(`[${logPrefix}] Workspace loaded but has no ID`);
    return {
      success: false,
      error: 'Workspace has no valid ID',
      response: NextResponse.json({ error: 'Workspace has no valid ID' }, { status: 500 }),
    };
  }

  console.log(`[${logPrefix}] Workspace details:`, {
    id: workspace.id!,
    path: workspace.path,
    repoUrl: workspace.repoUrl,
    targetBranch: workspace.targetBranch,
  });

  // ============================================================================
  // STEP 3: WORKSPACE ACCESS VALIDATION
  // ============================================================================

  // Check if workspace directory exists
  console.log(`[${logPrefix}] Checking workspace directory access: ${workspace.path}`);
  try {
    await access(workspace.path);
    console.log(`[${logPrefix}] Workspace directory accessible`);
  } catch (error) {
    console.error(`[${logPrefix}] Workspace directory not accessible:`, error);
    return {
      success: false,
      error: 'Workspace directory not found. The workspace may have been deleted.',
      response: NextResponse.json(
        { error: 'Workspace directory not found. The workspace may have been deleted.' },
        { status: 404 }
      ),
    };
  }

  return {
    success: true,
    workspace,
  };
}
