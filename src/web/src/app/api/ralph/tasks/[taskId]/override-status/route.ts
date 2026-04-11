import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/middleware';
import { requireStageTokenMatchesRouteTask } from '@/lib/auth/permission-check';
import {
  forceTransitionRalphTask,
  getManualOverrideInfo,
  getRalphTask,
} from '@/lib/managers/ralph-task-manager';
import { loadWorkflowDefinition } from '@/lib/managers/workflow-definition-manager';
import { DEFAULT_WORKFLOW_DEFINITION, deriveStatusList } from '@/lib/workflow';

/**
 * Request body schema for manual status override
 */
const OverrideStatusRequestSchema = z.object({
  toStatus: z.string().min(1),
  reason: z.string().min(1, 'Reason is required for manual status override'),
});

/**
 * POST /api/ralph/tasks/[taskId]/override-status
 *
 * @deprecated With free movement, this is equivalent to the transition route.
 *
 * Force a task to any status (manual override).
 *
 * Body:
 * - toStatus: the target status (required)
 * - reason: explanation for the override (required)
 *
 * Returns:
 * - task: the updated task
 * - transition: details of the override that occurred
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) return authResult.response!;

    const { taskId } = await params;

    const scopeDeniedOverridePost = requireStageTokenMatchesRouteTask(authResult.auth!, taskId);
    if (scopeDeniedOverridePost) return scopeDeniedOverridePost;

    // Parse and validate request body
    const body = await request.json();
    const parseResult = OverrideStatusRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid request body',
          details: parseResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { toStatus, reason } = parseResult.data;

    // Capture the current status before the override
    const currentTaskResult = await getRalphTask(taskId);
    if (!currentTaskResult.success) {
      if (currentTaskResult.error.message.includes('not found')) {
        return NextResponse.json({ error: currentTaskResult.error.message }, { status: 404 });
      }
      return NextResponse.json({ error: currentTaskResult.error.message }, { status: 500 });
    }
    const fromStatus = currentTaskResult.data.status;

    // Perform the force transition
    const result = await forceTransitionRalphTask(taskId, toStatus, reason);

    if (!result.success) {
      const errorMessage = result.error.message;
      if (errorMessage.includes('not found')) {
        return NextResponse.json({ error: errorMessage }, { status: 404 });
      }
      return NextResponse.json({ error: errorMessage }, { status: 500 });
    }

    const task = result.data;

    // Return the updated task and transition info
    return NextResponse.json({
      task,
      transition: {
        from: fromStatus,
        to: toStatus,
        timestamp: task.updatedAt,
        reason,
        isManualOverride: true,
      },
    });
  } catch (error) {
    console.error('[RALPH OVERRIDE STATUS API] Error:', error);
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
 * GET /api/ralph/tasks/[taskId]/override-status
 *
 * Get preview information for a potential manual status override.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) return authResult.response!;

    const { taskId } = await params;

    const scopeDeniedOverrideGet = requireStageTokenMatchesRouteTask(authResult.auth!, taskId);
    if (scopeDeniedOverrideGet) return scopeDeniedOverrideGet;

    const { searchParams } = new URL(request.url);
    const toStatus = searchParams.get('toStatus');

    // Get the task
    const taskResult = await getRalphTask(taskId);
    if (!taskResult.success) {
      if (taskResult.error.message.includes('not found')) {
        return NextResponse.json({ error: taskResult.error.message }, { status: 404 });
      }
      return NextResponse.json({ error: taskResult.error.message }, { status: 500 });
    }

    const task = taskResult.data;

    // Get valid statuses from workflow definition
    const defResult = await loadWorkflowDefinition();
    const definition = defResult.success ? defResult.data : DEFAULT_WORKFLOW_DEFINITION;
    const validStatuses = deriveStatusList(definition);

    // If specific target status requested, return info for that transition
    if (toStatus && validStatuses.includes(toStatus)) {
      const overrideInfo = getManualOverrideInfo(task.status, toStatus);

      return NextResponse.json({
        taskId,
        currentStatus: task.status,
        targetStatus: toStatus,
        ...overrideInfo,
      });
    }

    // Otherwise, return info for all possible transitions
    const allTransitions = validStatuses
      .filter((s) => s !== task.status)
      .map((status) => ({
        targetStatus: status,
        ...getManualOverrideInfo(task.status, status),
      }));

    return NextResponse.json({
      taskId,
      currentStatus: task.status,
      availableTransitions: allTransitions,
    });
  } catch (error) {
    console.error('[RALPH OVERRIDE STATUS API] Error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
