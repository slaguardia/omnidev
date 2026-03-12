import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/middleware';
import { getRalphTask } from '@/lib/managers/ralph-task-manager';
import { startStageRun } from '@/lib/ralph/stage-runner';

const RunStageRequestSchema = z.object({
  stageName: z.string().min(1),
  prompt: z.string().optional(),
});

/**
 * POST /api/ralph/tasks/[taskId]/run-stage
 *
 * Execute a workflow stage against a task.
 *
 * Body:
 * - stageName: string — the stage to run
 * - prompt?: string — override prompt (uses stage config prompt if omitted)
 *
 * Behavior:
 * 1. Loads workflow definition from config
 * 2. Finds stage definition for stageName
 * 3. If edit mode: ensures feature branch exists
 * 4. Sets task status to stageName if not already there
 * 5. Resolves prompt and queues ralph-stage job
 * 6. Returns updated task + jobId
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) return authResult.response!;

    const { taskId } = await params;

    // Parse body
    const body = await request.json();
    const parseResult = RunStageRequestSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { stageName, prompt: bodyPrompt } = parseResult.data;

    const result = await startStageRun(
      taskId,
      stageName,
      bodyPrompt ? { promptOverride: bodyPrompt } : undefined
    );

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.statusCode ?? 500 });
    }

    // Get the updated task
    const taskResult = await getRalphTask(taskId);
    const task = taskResult.success ? taskResult.data : undefined;

    if (result.skipped) {
      return NextResponse.json({
        task,
        message: `Task moved to stage. No prompt configured for this stage.`,
      });
    }

    const response: Record<string, unknown> = { task };
    if (result.jobId) {
      response.jobId = result.jobId;
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('[RUN-STAGE API] Error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
