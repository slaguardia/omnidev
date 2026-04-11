import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/middleware';
import { getAllWorkspaces, registerLogicalWorkspace } from '@/lib/managers/workspace-manager';
import { getAllRemoteBranches } from '@/lib/git/branches';
import { getProjectDisplayName } from '@/lib/dashboard/helpers';
import { resolveWorkspaceGitRoot } from '@/lib/workspace/resolve-workspace-root';

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
const PostWorkspaceSchema = z.object({
  repoUrl: z.string().min(1, 'repoUrl is required'),
  targetBranch: z.string().min(1, 'targetBranch is required'),
});

/**
 * POST /api/ralph/workspaces
 *
 * Register a repository URL and branch without creating a durable clone on disk.
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) return authResult.response!;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const parsed = PostWorkspaceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await registerLogicalWorkspace(parsed.data);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error?.message ?? 'Failed to register workspace' },
        { status: 400 }
      );
    }

    const ws = result.data!;
    return NextResponse.json({
      workspace: {
        id: ws.id,
        name: getProjectDisplayName(ws.repoUrl),
        repoUrl: ws.repoUrl,
        targetBranch: ws.targetBranch,
        branches: [] as string[],
      },
    });
  } catch (error) {
    console.error('[RALPH WORKSPACES API] POST error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

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
          const root = await resolveWorkspaceGitRoot(workspace);
          const branchesResult = await getAllRemoteBranches(root);
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
