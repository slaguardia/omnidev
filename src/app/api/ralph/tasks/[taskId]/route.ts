import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/middleware';
import {
  getRalphTask,
  updateRalphTask,
  deleteRalphTask,
  StageOutputSchema,
} from '@/lib/managers/ralph-task-manager';
import { loadWorkspace } from '@/lib/managers/workspace-manager';
import { getProjectDisplayName } from '@/lib/dashboard/helpers';
import { dbGetJob } from '@/lib/managers/ralph-task-db';
import type { WorkspaceId } from '@/lib/types';

/**
 * Schema for PATCH request to update task fields.
 * Only allows updating fields that should be editable by users.
 */
const UpdateTaskRequestSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  filePaths: z.array(z.string()).optional(),
  baseBranch: z.string().nullable().optional(),
  featureBranch: z.string().nullable().optional(),
  prTargetBranch: z.string().nullable().optional(),
  deliveryMethod: z.enum(['merge-request', 'direct-commit']).optional(),
  projectId: z.string().nullable().optional(),
  playbookId: z.string().nullable().optional(),
  stageOutputs: z.record(z.string(), StageOutputSchema).optional(),
});

/**
 * Statuses where branch configuration can no longer be edited.
 */
const LOCKED_STATUSES = ['executing', 'complete'] as const;

/**
 * GET /api/ralph/tasks/[taskId]
 *
 * Get full task details including all states and workspace info.
 * Used by the task detail drawer/modal for comprehensive view.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) return authResult.response!;

    const { taskId } = await params;

    // Get the full task
    const taskResult = await getRalphTask(taskId);

    if (!taskResult.success) {
      if (taskResult.error.message.includes('not found')) {
        return NextResponse.json({ error: taskResult.error.message }, { status: 404 });
      }
      return NextResponse.json({ error: taskResult.error.message }, { status: 500 });
    }

    const task = taskResult.data;

    // Get workspace info for display
    const wsResult = await loadWorkspace(task.workspaceId as WorkspaceId);
    const workspaceName =
      wsResult.success && wsResult.data.repoUrl
        ? getProjectDisplayName(wsResult.data.repoUrl)
        : task.workspaceId;

    // Determine git provider from repo URL
    const repoUrl = wsResult.success ? wsResult.data.repoUrl || '' : '';
    let gitProvider: 'github' | 'gitlab' | 'other' = 'other';
    if (repoUrl.includes('github')) {
      gitProvider = 'github';
    } else if (repoUrl.includes('gitlab')) {
      gitProvider = 'gitlab';
    }

    // Fetch child task summaries if there are any
    let childTasks: { id: string; title: string; status: string }[] = [];
    if (task.childIds && task.childIds.length > 0) {
      const childResults = await Promise.all(
        task.childIds.map((childId: string) => getRalphTask(childId))
      );
      childTasks = childResults
        .filter((r) => r.success)
        .map((r) => {
          const child = (
            r as { success: true; data: { id: string; title: string; status: string } }
          ).data;
          return { id: child.id, title: child.title, status: child.status };
        });
    }

    // Fetch parent task title if this is a child task
    let parentTitle: string | null = null;
    if (task.parentId) {
      const parentResult = await getRalphTask(task.parentId);
      if (parentResult.success) {
        parentTitle = parentResult.data.title;
      }
    }

    // Self-healing: clear stale activeJobId in ANY stage output where the job is done/missing
    if (task.stageOutputs) {
      let needsUpdate = false;
      const patchedOutputs = { ...task.stageOutputs };

      for (const [stageName, stageOutput] of Object.entries(patchedOutputs)) {
        if (!stageOutput.activeJobId) continue;

        const job = dbGetJob(stageOutput.activeJobId);
        const jobGone = !job;
        const jobDone = job && (job.status === 'completed' || job.status === 'failed');

        if (jobGone || jobDone) {
          const isFailed = jobGone || job?.status === 'failed';
          patchedOutputs[stageName] = {
            ...stageOutput,
            activeJobId: undefined,
            autoLoopActive: false,
            completionReason: stageOutput.completionReason ?? (isFailed ? 'error' : undefined),
            lastUpdated: new Date().toISOString(),
          };
          if (isFailed && !task.executionError) {
            task.executionError = job?.error ?? 'Job no longer exists';
          }
          needsUpdate = true;
        }
      }

      if (needsUpdate) {
        task.stageOutputs = patchedOutputs;
        // Fire-and-forget DB write
        updateRalphTask(taskId, {
          executionError: task.executionError,
          stageOutputs: patchedOutputs,
        }).catch((err) =>
          console.error('[RALPH TASK DETAIL API] Failed to clear stale activeJobId:', err)
        );
      }
    }

    // Return full task with enriched data
    return NextResponse.json({
      task: {
        ...task,
        workspaceName,
        gitProvider,
        childTasks,
        parentTitle,
      },
    });
  } catch (error) {
    console.error('[RALPH TASK DETAIL API] Error:', error);
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
 * PATCH /api/ralph/tasks/[taskId]
 *
 * Update task fields. Branch configuration can only be updated
 * when task is not in 'executing' or 'complete' status.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) return authResult.response!;

    const { taskId } = await params;

    // Get the existing task
    const taskResult = await getRalphTask(taskId);
    if (!taskResult.success) {
      if (taskResult.error.message.includes('not found')) {
        return NextResponse.json({ error: taskResult.error.message }, { status: 404 });
      }
      return NextResponse.json({ error: taskResult.error.message }, { status: 500 });
    }

    const existingTask = taskResult.data;

    // Parse and validate request body
    const body = await request.json();
    const parseResult = UpdateTaskRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const updates = parseResult.data;

    // Filter out undefined values to only update provided fields
    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([, value]) => value !== undefined)
    );

    if (Object.keys(filteredUpdates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    // Check if task is in a locked status — stageOutputs updates are always
    // allowed (clearing iterations, cancelling loops) but other field changes
    // (title, branches, delivery method, etc.) are blocked.
    if (LOCKED_STATUSES.includes(existingTask.status as (typeof LOCKED_STATUSES)[number])) {
      const nonStageKeys = Object.keys(filteredUpdates).filter((k) => k !== 'stageOutputs');
      if (nonStageKeys.length > 0) {
        return NextResponse.json(
          { error: `Cannot update task in '${existingTask.status}' status` },
          { status: 400 }
        );
      }
    }

    // Update the task
    const updateResult = await updateRalphTask(taskId, filteredUpdates);

    if (!updateResult.success) {
      return NextResponse.json({ error: updateResult.error.message }, { status: 500 });
    }

    // Get workspace info for display
    const wsUpdateResult = await loadWorkspace(updateResult.data.workspaceId as WorkspaceId);
    const workspaceName =
      wsUpdateResult.success && wsUpdateResult.data.repoUrl
        ? getProjectDisplayName(wsUpdateResult.data.repoUrl)
        : updateResult.data.workspaceId;

    return NextResponse.json({
      task: {
        ...updateResult.data,
        workspaceName,
      },
    });
  } catch (error) {
    console.error('[RALPH TASK UPDATE API] Error:', error);
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
 * DELETE /api/ralph/tasks/[taskId]
 *
 * Permanently delete a task and its data file.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) return authResult.response!;

    const { taskId } = await params;

    const result = await deleteRalphTask(taskId);

    if (!result.success) {
      if (result.error.message.includes('not found')) {
        return NextResponse.json({ error: result.error.message }, { status: 404 });
      }
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[RALPH TASK DELETE API] Error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
