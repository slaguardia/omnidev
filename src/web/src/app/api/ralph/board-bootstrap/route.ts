import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { requirePermission } from '@/lib/auth/permission-check';
import { getEnrichedBoardTasksForApi } from '@/lib/api/ralph-board-tasks-list';
import { loadWorkflowDefinition } from '@/lib/managers/workflow-definition-manager';
import { listRalphProjects, listRalphPlaybooks } from '@/lib/managers/ralph-task-manager';

/**
 * GET /api/ralph/board-bootstrap
 *
 * Single round-trip for Ralph Board: workflow definition, projects, playbooks, enriched tasks.
 * Query params for task list match GET /api/ralph/tasks (at minimum archivedOnly for the board).
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) return authResult.response!;

    const denied = requirePermission(authResult.auth!, 'tasks:read');
    if (denied) return denied;

    const url = new URL(request.url);
    const stageTokenTaskId = authResult.auth?.stageToken?.taskId ?? null;

    const [tasksResult, defResult, projectsResult, playbooksResult] = await Promise.all([
      getEnrichedBoardTasksForApi({ url, stageTokenTaskId }),
      loadWorkflowDefinition(),
      listRalphProjects(),
      listRalphPlaybooks(),
    ]);

    if (!defResult.success) {
      return NextResponse.json({ error: defResult.error.message }, { status: 500 });
    }
    if (!projectsResult.success) {
      return NextResponse.json({ error: projectsResult.error.message }, { status: 500 });
    }
    if (!playbooksResult.success) {
      return NextResponse.json({ error: playbooksResult.error.message }, { status: 500 });
    }

    return NextResponse.json({
      definition: defResult.data,
      projects: projectsResult.data,
      playbooks: playbooksResult.data,
      tasks: tasksResult.tasks,
      meta: {
        ...tasksResult.meta,
      },
    });
  } catch (error) {
    console.error('[RALPH BOARD BOOTSTRAP API] Error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
