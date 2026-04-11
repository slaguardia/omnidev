import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { requireStageTokenMatchesRouteTask } from '@/lib/auth/permission-check';
import { archiveRalphTask, unarchiveRalphTask } from '@/lib/managers/ralph-task-manager';

/**
 * POST /api/ralph/tasks/[taskId]/archive
 *
 * Archive a completed task.
 * Only tasks in 'complete' status can be archived.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) return authResult.response!;

    const { taskId } = await params;

    const scopeDeniedArchivePost = requireStageTokenMatchesRouteTask(authResult.auth!, taskId);
    if (scopeDeniedArchivePost) return scopeDeniedArchivePost;

    if (!taskId) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
    }

    const result = await archiveRalphTask(taskId);

    if (!result.success) {
      const status = result.error.message.includes('not found') ? 404 : 400;
      return NextResponse.json({ error: result.error.message }, { status });
    }

    return NextResponse.json({
      task: result.data,
      message: 'Task archived successfully',
    });
  } catch (error) {
    console.error('[RALPH ARCHIVE API] Error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/ralph/tasks/[taskId]/archive
 *
 * Unarchive a task (remove from archive view).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) return authResult.response!;

    const { taskId } = await params;

    const scopeDeniedArchiveDelete = requireStageTokenMatchesRouteTask(authResult.auth!, taskId);
    if (scopeDeniedArchiveDelete) return scopeDeniedArchiveDelete;

    if (!taskId) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
    }

    const result = await unarchiveRalphTask(taskId);

    if (!result.success) {
      const status = result.error.message.includes('not found') ? 404 : 400;
      return NextResponse.json({ error: result.error.message }, { status });
    }

    return NextResponse.json({
      task: result.data,
      message: 'Task unarchived successfully',
    });
  } catch (error) {
    console.error('[RALPH UNARCHIVE API] Error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
