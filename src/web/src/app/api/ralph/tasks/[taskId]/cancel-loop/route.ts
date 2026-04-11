import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/middleware';
import { requireStageTokenMatchesRouteTask } from '@/lib/auth/permission-check';
import { getRalphTask, updateRalphTask } from '@/lib/managers/ralph-task-manager';

const CancelLoopRequestSchema = z.object({
  stageName: z.string().min(1),
});

/**
 * POST /api/ralph/tasks/[taskId]/cancel-loop
 *
 * Cooperative cancellation of an auto-looping stage.
 * Sets autoLoopActive=false so the next queued iteration skips itself.
 * The currently running Claude instance finishes normally.
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

    const body = await request.json();
    const parseResult = CancelLoopRequestSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { stageName } = parseResult.data;

    const taskResult = await getRalphTask(taskId);
    if (!taskResult.success) {
      const status = taskResult.error.message.includes('not found') ? 404 : 500;
      return NextResponse.json({ error: taskResult.error.message }, { status });
    }

    const task = taskResult.data;
    const stageOutput = task.stageOutputs?.[stageName];

    if (!stageOutput) {
      return NextResponse.json(
        { error: `No output found for stage '${stageName}'` },
        { status: 404 }
      );
    }

    if (!stageOutput.autoLoopActive) {
      return NextResponse.json(
        { error: `Stage '${stageName}' is not currently auto-looping` },
        { status: 409 }
      );
    }

    // Set autoLoopActive=false — the next queued iteration will detect this and skip
    await updateRalphTask(taskId, {
      stageOutputs: {
        ...task.stageOutputs,
        [stageName]: {
          ...stageOutput,
          autoLoopActive: false,
          completionReason: 'cancelled',
          lastUpdated: new Date().toISOString(),
        },
      },
    });

    console.log(`[CANCEL-LOOP API] Cancelled auto-loop for task ${taskId}, stage ${stageName}`);

    return NextResponse.json({
      success: true,
      message: `Auto-loop cancelled for stage '${stageName}'. Current iteration will finish, no new iterations will start.`,
    });
  } catch (error) {
    console.error('[CANCEL-LOOP API] Error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
