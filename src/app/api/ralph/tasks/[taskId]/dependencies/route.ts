import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import {
  getRalphTask,
  updateTaskDependencies,
  getTaskDependencyInfo,
} from '@/lib/managers/ralph-task-manager';

interface RouteParams {
  params: Promise<{ taskId: string }>;
}

/**
 * GET /api/ralph/tasks/[taskId]/dependencies
 *
 * Get dependency information for a task.
 * Returns blockedBy list, resolved blockers, active blockers, and tasks this blocks.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) return authResult.response!;

    const { taskId } = await params;

    // Get task to verify it exists
    const taskResult = await getRalphTask(taskId);
    if (!taskResult.success) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Get dependency info
    const depInfo = await getTaskDependencyInfo(taskId);
    if (!depInfo.success) {
      console.error('[DEPENDENCIES API] Failed to get dependency info:', depInfo.error);
      return NextResponse.json({ error: 'Failed to get dependency info' }, { status: 500 });
    }

    // Enrich with task titles for display
    const blockerDetails: Array<{ id: string; title: string; status: string }> = [];
    for (const blockerId of depInfo.data.blockedBy) {
      const blockerTask = await getRalphTask(blockerId);
      if (blockerTask.success) {
        blockerDetails.push({
          id: blockerId,
          title: blockerTask.data.title,
          status: blockerTask.data.status,
        });
      }
    }

    const blocksDetails: Array<{ id: string; title: string; status: string }> = [];
    for (const blockedId of depInfo.data.blocks) {
      const blockedTask = await getRalphTask(blockedId);
      if (blockedTask.success) {
        blocksDetails.push({
          id: blockedId,
          title: blockedTask.data.title,
          status: blockedTask.data.status,
        });
      }
    }

    return NextResponse.json({
      taskId,
      ...depInfo.data,
      blockerDetails,
      blocksDetails,
    });
  } catch (error) {
    console.error('[DEPENDENCIES API] Error getting dependencies:', error);
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
 * PUT /api/ralph/tasks/[taskId]/dependencies
 *
 * Update the blockedBy list for a task.
 * Validates circular dependencies and returns error if detected.
 *
 * Request body:
 * - blockedBy: string[] - Array of task IDs that this task is blocked by
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) return authResult.response!;

    const { taskId } = await params;

    // Get task to verify it exists
    const taskResult = await getRalphTask(taskId);
    if (!taskResult.success) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Parse request body
    const body = (await request.json()) as { blockedBy?: string[] };
    const { blockedBy } = body;

    if (!Array.isArray(blockedBy)) {
      return NextResponse.json(
        { error: 'blockedBy must be an array of task IDs' },
        { status: 400 }
      );
    }

    // Update dependencies (validates circular dependencies)
    const updateResult = await updateTaskDependencies(taskId, blockedBy);
    if (!updateResult.success) {
      // Check if it's a circular dependency error
      if (updateResult.error?.message.includes('Circular dependency')) {
        return NextResponse.json(
          { error: updateResult.error.message, code: 'CIRCULAR_DEPENDENCY' },
          { status: 400 }
        );
      }
      console.error('[DEPENDENCIES API] Failed to update dependencies:', updateResult.error);
      return NextResponse.json(
        { error: updateResult.error?.message || 'Failed to update dependencies' },
        { status: 400 }
      );
    }

    // Get updated dependency info
    const depInfo = await getTaskDependencyInfo(taskId);

    return NextResponse.json({
      success: true,
      taskId,
      blockedBy: updateResult.data.blockedBy,
      dependencyInfo: depInfo.success ? depInfo.data : null,
    });
  } catch (error) {
    console.error('[DEPENDENCIES API] Error updating dependencies:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
