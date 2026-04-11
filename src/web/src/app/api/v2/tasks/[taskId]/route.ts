import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/middleware';
import {
  getRalphTask,
  updateRalphTask,
  transitionRalphTask,
} from '@/lib/managers/ralph-task-manager';

const UpdateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(['backlog', 'ready', 'coding', 'review', 'done']).optional(),
  repo_url: z.string().url().optional(),
  branch: z.string().optional(),
  execution_mode: z.enum(['readonly', 'edit']).optional().default('edit'),
});

/** Map V2 status names to Ralph status names */
const V2_TO_RALPH_STATUS: Record<string, string> = {
  backlog: 'draft',
  ready: 'ready',
  coding: 'executing',
  review: 'complete',
  done: 'complete',
};

/** Map Ralph status names to V2 status names */
const RALPH_TO_V2_STATUS: Record<string, string> = {
  draft: 'backlog',
  triage: 'backlog',
  planning: 'backlog',
  research: 'backlog',
  ready: 'ready',
  executing: 'coding',
  complete: 'done',
};

function toV2Task(task: {
  id: string;
  title: string;
  description?: string | null | undefined;
  status: string;
  createdAt: string;
  updatedAt: string;
}) {
  return {
    id: task.id,
    title: task.title,
    description: task.description ?? '',
    status: RALPH_TO_V2_STATUS[task.status] ?? task.status,
    repo_url: null,
    branch: null,
    created_at: task.createdAt,
    updated_at: task.updatedAt,
  };
}

/**
 * GET /api/v2/tasks/:taskId — Read a single task
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const authResult = await withAuth(request);
  if (!authResult.success) return authResult.response!;

  const { taskId } = await params;
  const result = await getRalphTask(taskId);
  if (!result.success) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  return NextResponse.json({ task: toV2Task(result.data) });
}

/**
 * PATCH /api/v2/tasks/:taskId — Update a task
 *
 * Auto-triggers stage execution when status transitions to "coding".
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const authResult = await withAuth(request);
  if (!authResult.success) return authResult.response!;

  const { taskId } = await params;

  try {
    const taskResult = await getRalphTask(taskId);
    if (!taskResult.success) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const task = taskResult.data;
    const body = await request.json();
    const parsed = UpdateTaskSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { title, description, status } = parsed.data;

    // Apply field updates
    const updates: Record<string, unknown> = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;

    if (Object.keys(updates).length > 0) {
      const updateResult = await updateRalphTask(taskId, updates);
      if (!updateResult.success) {
        return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
      }
    }

    // Handle status transition
    let jobCreated = false;
    if (status) {
      const ralphStatus = V2_TO_RALPH_STATUS[status] ?? status;

      if (ralphStatus !== task.status) {
        const transResult = await transitionRalphTask(
          taskId,
          ralphStatus,
          `V2 API status change: ${status}`
        );
        if (!transResult.success) {
          return NextResponse.json(
            { error: `Status transition failed: ${transResult.error.message}` },
            { status: 500 }
          );
        }
      }

      // Auto-trigger stage execution when moving to "coding" (executing)
      if (status === 'coding' && task.status !== 'executing') {
        try {
          const { startStageRun } = await import('@/lib/ralph/stage-runner');
          const runResult = await startStageRun(taskId, 'executing');
          if (runResult.jobId) {
            jobCreated = true;
            console.log(
              `[V2 TASKS] Auto-started stage execution for task ${taskId}, job: ${runResult.jobId}`
            );
          } else if (runResult.error) {
            console.warn(`[V2 TASKS] Stage execution start failed: ${runResult.error}`);
          }
        } catch (stageError) {
          console.warn(`[V2 TASKS] Failed to start stage execution:`, stageError);
        }
      }
    }

    // Return updated task
    const finalResult = await getRalphTask(taskId);
    const finalTask = finalResult.success ? toV2Task(finalResult.data) : null;

    return NextResponse.json({ task: finalTask, job_created: jobCreated });
  } catch (error) {
    console.error('[V2 TASKS] Failed to update task:', error);
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
  }
}
