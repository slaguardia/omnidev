import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { requirePermission } from '@/lib/auth/permission-check';
import { getEnrichedBoardTasksForApi } from '@/lib/api/ralph-board-tasks-list';

/**
 * GET /api/ralph/tasks
 *
 * List all Ralph tasks with enriched data for the Ralph Board.
 * Returns tasks sorted by updatedAt (most recent first).
 *
 * Query params:
 * - status: filter by task status (optional)
 * - workspaceId: filter by workspace (optional)
 * - taskNumber: filter by sequential task number (optional)
 * - includeArchived: include archived tasks (default: false)
 * - archivedOnly: show only archived tasks (default: false)
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) return authResult.response!;

    const denied = requirePermission(authResult.auth!, 'tasks:read');
    if (denied) return denied;

    const url = new URL(request.url);
    const stageTokenTaskId = authResult.auth?.stageToken?.taskId ?? null;

    const { tasks, meta } = await getEnrichedBoardTasksForApi({
      url,
      stageTokenTaskId,
    });

    return NextResponse.json({
      tasks,
      meta,
    });
  } catch (error) {
    console.error('[RALPH TASKS API] Error listing tasks:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
