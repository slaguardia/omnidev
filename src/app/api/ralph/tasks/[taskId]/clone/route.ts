import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { requireStageTokenMatchesRouteTask } from '@/lib/auth/permission-check';
import { cloneRalphTask } from '@/lib/managers/ralph-task-manager';
import { getWorkspace } from '@/lib/managers/repository-manager';
import { getProjectDisplayName } from '@/lib/dashboard/helpers';
import type { WorkspaceId } from '@/lib/types';

/**
 * POST /api/ralph/tasks/[taskId]/clone
 *
 * Clone a task as a new draft task (template functionality).
 * Creates a copy with reset status and timestamps.
 * All planning/research state is cleared, only basic task config is copied.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) return authResult.response!;

    const { taskId } = await params;

    const scopeDenied = requireStageTokenMatchesRouteTask(authResult.auth!, taskId);
    if (scopeDenied) return scopeDenied;

    if (!taskId) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
    }

    const result = await cloneRalphTask(taskId);

    if (!result.success) {
      const status = result.error.message.includes('not found') ? 404 : 400;
      return NextResponse.json({ error: result.error.message }, { status });
    }

    const clonedTask = result.data;

    // Get workspace name for the response
    const workspace = await getWorkspace(clonedTask.workspaceId as WorkspaceId);
    const workspaceName = workspace
      ? getProjectDisplayName(workspace.repoUrl)
      : clonedTask.workspaceId;

    return NextResponse.json({
      task: {
        ...clonedTask,
        workspaceName,
      },
      message: 'Task cloned successfully',
    });
  } catch (error) {
    console.error('[RALPH CLONE API] Error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
