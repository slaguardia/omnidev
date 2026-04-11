import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { requireStageTokenMatchesRouteTask } from '@/lib/auth/permission-check';
import { getRalphTask, updateRalphTask } from '@/lib/managers/ralph-task-manager';

/**
 * POST /api/ralph/tasks/[taskId]/stage-answer
 *
 * Answer or dismiss pending stage questions and optionally resume execution.
 *
 * Body:
 * - stageName: string — which stage (e.g. 'triage')
 * - answers: Record<questionId, answerText> (optional — answers to provide)
 * - dismiss: string[] (optional — question IDs to remove)
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

    if (!taskId) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
    }

    let body: { stageName: string; answers?: Record<string, string>; dismiss?: string[] };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    if (!body.stageName || typeof body.stageName !== 'string') {
      return NextResponse.json({ error: 'stageName is required' }, { status: 400 });
    }
    if (!body.answers && !body.dismiss) {
      return NextResponse.json(
        { error: 'At least one of answers or dismiss is required' },
        { status: 400 }
      );
    }

    // Load the task
    const taskResult = await getRalphTask(taskId);
    if (!taskResult.success) {
      if (taskResult.error.message.includes('not found')) {
        return NextResponse.json({ error: taskResult.error.message }, { status: 404 });
      }
      return NextResponse.json({ error: taskResult.error.message }, { status: 500 });
    }

    const task = taskResult.data;
    const stageOutput = task.stageOutputs?.[body.stageName];

    if (!stageOutput) {
      return NextResponse.json(
        { error: `No stage output found for stage: ${body.stageName}` },
        { status: 404 }
      );
    }

    // Update pending questions: apply answers, then remove dismissed
    const now = new Date().toISOString();
    const dismissSet = new Set(body.dismiss ?? []);
    const answers = body.answers ?? {};

    const updatedQuestions = stageOutput.pendingQuestions
      .filter((q) => !dismissSet.has(q.id))
      .map((q) => {
        const answer = answers[q.id];
        if (answer !== undefined) {
          return { ...q, answer, answeredAt: now };
        }
        return q;
      });

    const updatedStageOutput = {
      ...stageOutput,
      pendingQuestions: updatedQuestions,
      lastUpdated: now,
    };

    // Save updated questions
    await updateRalphTask(taskId, {
      stageOutputs: {
        ...task.stageOutputs,
        [body.stageName]: updatedStageOutput,
      },
    });

    // NOTE: This endpoint only saves answers/dismissals. It does NOT auto-create
    // the next iteration job. The user must explicitly click "Continue" in the UI,
    // which calls the run-stage API to create the next job. This prevents duplicate
    // jobs when multiple questions are answered individually.

    // Reload to return updated task
    const updatedTaskResult = await getRalphTask(taskId);

    const response: { task: unknown; iterationsRemaining: number } = {
      task: updatedTaskResult.success ? updatedTaskResult.data : task,
      iterationsRemaining: Math.max(0, stageOutput.maxIterations - stageOutput.currentIteration),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[RALPH STAGE-ANSWER API] Error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
