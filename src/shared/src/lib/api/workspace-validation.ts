import { NextResponse } from 'next/server';
import { initializeWorkspaceStorage, loadWorkspace } from '@/lib/workspace/storage';
import { resolveWorkspaceGitRoot } from '@/lib/workspace/resolve-workspace-root';
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
  // STEP 3: RESOLVE GIT ROOT (durable path or ephemeral shallow clone)
  // ============================================================================

  let resolvedRoot;
  try {
    resolvedRoot = await resolveWorkspaceGitRoot(workspace);
    console.log(`[${logPrefix}] Resolved workspace git root: ${resolvedRoot}`);
  } catch (error) {
    console.error(`[${logPrefix}] Failed to resolve workspace root:`, error);
    return {
      success: false,
      error: 'Failed to prepare workspace repository',
      response: NextResponse.json(
        {
          error: 'Failed to prepare workspace repository',
          details: error instanceof Error ? error.message : String(error),
        },
        { status: 502 }
      ),
    };
  }

  return {
    success: true,
    workspace,
    resolvedRoot,
  };
}
