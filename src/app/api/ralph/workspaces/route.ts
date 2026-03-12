import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { getAllWorkspaces } from '@/lib/managers/workspace-manager';
import { getAllRemoteBranches } from '@/lib/git/branches';
import { getProjectDisplayName } from '@/lib/dashboard/helpers';
import type { FilePath } from '@/lib/types';

/**
 * Permissions subset exposed to the client
 */
interface WorkspacePermissionsResponse {
  canPushToProtected: boolean;
  targetBranchProtected: boolean;
  accessLevelName: string;
}

/**
 * Response type for workspace list API
 */
interface WorkspaceResponse {
  id: string;
  name: string;
  repoUrl: string;
  targetBranch: string;
  branches: string[];
  permissions?: WorkspacePermissionsResponse;
}

/**
 * GET /api/ralph/workspaces
 *
 * List all workspaces with their available branches for task creation.
 *
 * Query params:
 * - includeBranches: if 'true', include branch list for each workspace (default: true)
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) return authResult.response!;

    const url = new URL(request.url);
    const includeBranches = url.searchParams.get('includeBranches') !== 'false';

    // Get all workspaces from workspace manager
    const workspacesResult = await getAllWorkspaces();
    if (!workspacesResult.success) {
      console.error('[RALPH WORKSPACES API] Failed to get workspaces:', workspacesResult.error);
      return NextResponse.json({ error: 'Failed to fetch workspaces' }, { status: 500 });
    }

    const workspaces: WorkspaceResponse[] = await Promise.all(
      workspacesResult.data.map(async (workspace) => {
        const displayName = getProjectDisplayName(workspace.repoUrl);

        let branches: string[] = [];
        if (includeBranches) {
          const branchesResult = await getAllRemoteBranches(workspace.path as FilePath);
          if (branchesResult.success) {
            branches = branchesResult.data;
          } else {
            console.warn(
              `[RALPH WORKSPACES API] Failed to get branches for workspace ${workspace.id}:`,
              branchesResult.error
            );
          }
        }

        const permissions = workspace.metadata?.permissions;

        return {
          id: workspace.id,
          name: displayName,
          repoUrl: workspace.repoUrl,
          targetBranch: workspace.targetBranch,
          branches,
          ...(permissions && {
            permissions: {
              canPushToProtected: permissions.canPushToProtected,
              targetBranchProtected: permissions.targetBranchProtected,
              accessLevelName: permissions.accessLevelName,
            },
          }),
        };
      })
    );

    // Sort by name
    workspaces.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({
      workspaces,
      meta: {
        total: workspaces.length,
        includeBranches,
      },
    });
  } catch (error) {
    console.error('[RALPH WORKSPACES API] Error listing workspaces:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
