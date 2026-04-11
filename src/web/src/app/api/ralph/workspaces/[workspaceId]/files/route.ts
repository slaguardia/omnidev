import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { loadWorkspace } from '@/lib/managers/workspace-manager';
import type { WorkspaceId } from '@/lib/types';
import { createSandboxedGit } from '@/lib/git/sandbox';
import { resolveWorkspaceGitRoot } from '@/lib/workspace/resolve-workspace-root';

interface RouteContext {
  params: Promise<{ workspaceId: string }>;
}

/**
 * GET /api/ralph/workspaces/[workspaceId]/files
 *
 * List tracked files in a workspace using git ls-files.
 *
 * Query params:
 * - q: optional search/filter string (matched against file paths)
 * - limit: max results to return (default: 50)
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) return authResult.response!;

    const { workspaceId } = await context.params;

    const wsResult = await loadWorkspace(workspaceId as WorkspaceId);
    if (!wsResult.success) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }
    const workspace = wsResult.data;

    const root = await resolveWorkspaceGitRoot(workspace);

    const url = new URL(request.url);
    const query = url.searchParams.get('q')?.toLowerCase() || '';
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);

    const git = createSandboxedGit(root);
    const lsResult = await git.raw(['ls-files']);
    const allFiles = lsResult
      .split('\n')
      .map((f) => f.trim())
      .filter(Boolean);

    let filtered: string[];
    if (query) {
      filtered = allFiles.filter((f) => f.toLowerCase().includes(query));
    } else {
      filtered = allFiles;
    }

    const files = filtered.slice(0, limit);

    return NextResponse.json({
      files,
      total: filtered.length,
      truncated: filtered.length > limit,
    });
  } catch (error) {
    console.error('[WORKSPACE FILES API] Error listing files:', error);
    return NextResponse.json(
      {
        error: 'Failed to list workspace files',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
