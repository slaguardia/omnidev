import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/middleware';
import { requirePermission, requireStageTokenMatchesRouteTask } from '@/lib/auth/permission-check';
import {
  transitionRalphTask,
  getRalphTask,
  validatePlaybookTransition,
  getNextPlaybookStage,
} from '@/lib/managers/ralph-task-manager';
import { loadWorkflowDefinition } from '@/lib/managers/workflow-definition-manager';
import { DEFAULT_WORKFLOW_DEFINITION, deriveStatusList } from '@/lib/workflow';

/**
 * Request body schema for task transition.
 * Accepts any string status — validated against the workflow definition.
 */
const TransitionRequestSchema = z.object({
  toStatus: z.string().min(1),
  reason: z.string().optional(),
});

/**
 * POST /api/ralph/tasks/[taskId]/transition
 *
 * Transition a task to a new status.
 * Free movement — any status in the workflow definition is valid.
 *
 * Body:
 * - toStatus: the target status (required)
 * - reason: optional reason for the transition
 *
 * Returns:
 * - task: the updated task
 * - transition: details of the transition that occurred
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

    const denied = requirePermission(authResult.auth!, 'tasks:transition');
    if (denied) return denied;

    // Parse and validate request body
    const body = await request.json();
    const parseResult = TransitionRequestSchema.safeParse(body);

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

    // Validate toStatus against workflow definition
    const defResult = await loadWorkflowDefinition();
    const definition = defResult.success ? defResult.data : DEFAULT_WORKFLOW_DEFINITION;
    const validStatuses = deriveStatusList(definition);

    if (!validStatuses.includes(toStatus)) {
      return NextResponse.json(
        {
          error: `Invalid status '${toStatus}'. Valid statuses: ${validStatuses.join(', ')}`,
        },
        { status: 422 }
      );
    }

    // Get current task
    const currentTaskResult = await getRalphTask(taskId);
    if (!currentTaskResult.success) {
      if (currentTaskResult.error.message.includes('not found')) {
        return NextResponse.json({ error: currentTaskResult.error.message }, { status: 404 });
      }
      return NextResponse.json({ error: currentTaskResult.error.message }, { status: 500 });
    }

    const currentTask = currentTaskResult.data;

    // Playbook enforcement: reject transitions that violate the playbook
    const validation = await validatePlaybookTransition(currentTask, toStatus);
    if (!validation.allowed) {
      return NextResponse.json({ error: validation.reason }, { status: 422 });
    }

    // Perform the transition (pass preloaded task to avoid redundant disk read)
    const result = await transitionRalphTask(taskId, toStatus, reason, currentTask);

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
        from: currentTask.status,
        to: toStatus,
        timestamp: task.updatedAt,
        reason,
      },
    });
  } catch (error) {
    console.error('[RALPH TRANSITION API] Error:', error);
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
 * GET /api/ralph/tasks/[taskId]/transition
 *
 * Get valid transitions for a task.
 * With free movement, returns all statuses from the workflow definition.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) return authResult.response!;

    const { taskId } = await params;

    const scopeDeniedGet = requireStageTokenMatchesRouteTask(authResult.auth!, taskId);
    if (scopeDeniedGet) return scopeDeniedGet;

    // Get the task to find its current status
    const taskResult = await getRalphTask(taskId);

    if (!taskResult.success) {
      if (taskResult.error.message.includes('not found')) {
        return NextResponse.json({ error: taskResult.error.message }, { status: 404 });
      }
      return NextResponse.json({ error: taskResult.error.message }, { status: 500 });
    }

    const task = taskResult.data;

    // Return all valid statuses (free movement unless playbook enforced)
    const defResult = await loadWorkflowDefinition();
    const definition = defResult.success ? defResult.data : DEFAULT_WORKFLOW_DEFINITION;
    const validStatuses = deriveStatusList(definition).filter((s) => s !== task.status);

    // If task has a playbook, restrict valid transitions
    if (task.playbookId) {
      const { nextStage } = await getNextPlaybookStage(taskId, task.status);
      const allowed = ['draft'];
      if (nextStage) allowed.push(nextStage);
      return NextResponse.json({
        taskId,
        currentStatus: task.status,
        validNextStatuses: allowed.filter((s) => s !== task.status),
        playbookEnforced: true,
      });
    }

    return NextResponse.json({
      taskId,
      currentStatus: task.status,
      validNextStatuses: validStatuses,
    });
  } catch (error) {
    console.error('[RALPH TRANSITION API] Error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
