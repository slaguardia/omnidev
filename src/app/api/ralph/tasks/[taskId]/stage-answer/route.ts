import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { getRalphTask, updateRalphTask } from '@/lib/managers/ralph-task-manager';
import { loadWorkspace } from '@/lib/managers/workspace-manager';
import { executeOrQueue } from '@/lib/queue';
import type { WorkspaceId } from '@/lib/types/index';
import type { RalphStageJobPayload } from '@/lib/queue/types';

/**
 * POST /api/ralph/tasks/[taskId]/stage-answer
 *
 * Answer pending stage questions and optionally resume execution.
 *
 * Body:
 * - stageName: string — which stage (e.g. 'triage')
 * - answers: Record<questionId, answerText>
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) return authResult.response!;

    const { taskId } = await params;

    if (!taskId) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
    }

    let body: { stageName: string; answers: Record<string, string> };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    if (!body.stageName || typeof body.stageName !== 'string') {
      return NextResponse.json({ error: 'stageName is required' }, { status: 400 });
    }
    if (!body.answers || typeof body.answers !== 'object') {
      return NextResponse.json({ error: 'answers object is required' }, { status: 400 });
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

    // Update pending questions with answers
    const now = new Date().toISOString();
    const updatedQuestions = stageOutput.pendingQuestions.map((q) => {
      const answer = body.answers[q.id];
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

    // If more iterations remaining, queue the next one
    let jobId: string | undefined;
    if (stageOutput.currentIteration < stageOutput.maxIterations) {
      const workspaceResult = await loadWorkspace(task.workspaceId as WorkspaceId);
      if (workspaceResult.success) {
        const workspace = workspaceResult.data;
        const nextIteration = stageOutput.currentIteration + 1;

        const payload: RalphStageJobPayload = {
          taskId,
          stageName: body.stageName,
          workspaceId: task.workspaceId as WorkspaceId,
          workspacePath: workspace.path as string,
          prompt: stageOutput.prompt,
          iteration: nextIteration,
          maxIterations: stageOutput.maxIterations,
          returnQuestions: stageOutput.returnQuestions,
        };

        const execution = await executeOrQueue('ralph-stage', payload, { forceQueue: true });
        if (!execution.immediate) {
          jobId = execution.jobId as string;
        }
      }
    }

    // Reload to return updated task
    const updatedTaskResult = await getRalphTask(taskId);

    const response: { task: unknown; jobId?: string; iterationsRemaining: number } = {
      task: updatedTaskResult.success ? updatedTaskResult.data : task,
      iterationsRemaining: Math.max(0, stageOutput.maxIterations - stageOutput.currentIteration),
    };
    if (jobId) {
      response.jobId = jobId;
    }

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
