import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { requireStageTokenMatchesRouteTask } from '@/lib/auth/permission-check';
import {
  getRalphTask,
  updateRalphTask,
  transitionRalphTask,
} from '@/lib/managers/ralph-task-manager';

/**
 * POST /api/ralph/tasks/[taskId]/stage-action
 *
 * Perform a stage-specific action. This is a generic endpoint that replaces
 * the old /research endpoint's domain logic (dismiss, accept-feedback, skip, add-feedback).
 *
 * Request body:
 * - stageName: string — which stage the action applies to
 * - action: 'dismiss-item' | 'accept-feedback' | 'skip-stage' | 'add-feedback'
 * - data?: { itemId?: string; feedback?: string; targetStatus?: string }
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

    let body: {
      stageName: string;
      action: string;
      data?: { itemId?: string; feedback?: string; targetStatus?: string };
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    if (!body.stageName || typeof body.stageName !== 'string') {
      return NextResponse.json({ error: 'stageName is required' }, { status: 400 });
    }
    if (!body.action || typeof body.action !== 'string') {
      return NextResponse.json({ error: 'action is required' }, { status: 400 });
    }

    const taskResult = await getRalphTask(taskId);
    if (!taskResult.success) {
      if (taskResult.error.message.includes('not found')) {
        return NextResponse.json({ error: taskResult.error.message }, { status: 404 });
      }
      return NextResponse.json({ error: taskResult.error.message }, { status: 500 });
    }

    const task = taskResult.data;

    switch (body.action) {
      case 'dismiss-item': {
        // Dismiss a gap in the legacy researchState
        const itemId = body.data?.itemId;
        if (!itemId) {
          return NextResponse.json(
            { error: 'data.itemId is required for dismiss-item' },
            { status: 400 }
          );
        }

        const currentResearchState = task.researchState || {
          currentIteration: 0,
          iterations: [],
          pendingGaps: [],
          lastUpdated: new Date().toISOString(),
        };

        const updatedGaps = currentResearchState.pendingGaps.map((g) => {
          if (g.id === itemId) {
            return Object.assign({}, g, {
              dismissed: true,
              dismissedAt: new Date().toISOString(),
            });
          }
          return g;
        });

        await updateRalphTask(taskId, {
          researchState: {
            ...currentResearchState,
            pendingGaps: updatedGaps,
            lastUpdated: new Date().toISOString(),
          },
        });

        return NextResponse.json({ taskId, action: 'dismiss-item', itemId });
      }

      case 'accept-feedback': {
        // Accept all feedback and transition to a previous stage (e.g. planning)
        const pendingGaps = task.researchState?.pendingGaps || [];
        const gapsFeedback = pendingGaps
          .filter((g) => !g.dismissed)
          .map(
            (g) =>
              `[${g.category}:${g.severity}] ${g.description}${g.suggestedFix ? ` - Fix: ${g.suggestedFix}` : ''}`
          )
          .join('\n');

        const userFeedback = body.data?.feedback;
        const combinedFeedback = [gapsFeedback, userFeedback].filter(Boolean).join('\n\n');

        const targetStatus = body.data?.targetStatus || 'planning';
        const transitionResult = await transitionRalphTask(
          taskId,
          targetStatus,
          'Incorporating research feedback'
        );
        if (!transitionResult.success) {
          return NextResponse.json({ error: transitionResult.error.message }, { status: 500 });
        }

        await updateRalphTask(taskId, {
          researchState: {
            ...(task.researchState || {
              currentIteration: 0,
              iterations: [],
              pendingGaps: [],
              lastUpdated: new Date().toISOString(),
            }),
            userFeedback: combinedFeedback,
            lastUpdated: new Date().toISOString(),
          },
        });

        return NextResponse.json({
          taskId,
          action: 'accept-feedback',
          transitioned: true,
          newStatus: targetStatus,
        });
      }

      case 'skip-stage': {
        // Skip this stage and transition to the next one (e.g. ready)
        const targetStatus = body.data?.targetStatus || 'ready';
        const transitionResult = await transitionRalphTask(
          taskId,
          targetStatus,
          `User skipped ${body.stageName}`
        );
        if (!transitionResult.success) {
          return NextResponse.json({ error: transitionResult.error.message }, { status: 500 });
        }

        return NextResponse.json({
          taskId,
          action: 'skip-stage',
          transitioned: true,
          newStatus: targetStatus,
        });
      }

      case 'add-feedback': {
        // Add user feedback and transition to a previous stage
        const feedback = body.data?.feedback;
        if (!feedback) {
          return NextResponse.json(
            { error: 'data.feedback is required for add-feedback' },
            { status: 400 }
          );
        }

        const pendingGaps = task.researchState?.pendingGaps || [];
        const gapsFeedback = pendingGaps
          .filter((g) => !g.dismissed)
          .map(
            (g) =>
              `[${g.category}:${g.severity}] ${g.description}${g.suggestedFix ? ` - Fix: ${g.suggestedFix}` : ''}`
          )
          .join('\n');

        const combinedFeedback = [gapsFeedback, feedback].filter(Boolean).join('\n\n');

        const targetStatus = body.data?.targetStatus || 'planning';
        const transitionResult = await transitionRalphTask(
          taskId,
          targetStatus,
          'Incorporating user feedback'
        );
        if (!transitionResult.success) {
          return NextResponse.json({ error: transitionResult.error.message }, { status: 500 });
        }

        await updateRalphTask(taskId, {
          researchState: {
            ...(task.researchState || {
              currentIteration: 0,
              iterations: [],
              pendingGaps: [],
              lastUpdated: new Date().toISOString(),
            }),
            userFeedback: combinedFeedback,
            lastUpdated: new Date().toISOString(),
          },
        });

        return NextResponse.json({
          taskId,
          action: 'add-feedback',
          transitioned: true,
          newStatus: targetStatus,
        });
      }

      default:
        return NextResponse.json(
          {
            error: `Unknown action: ${body.action}. Valid: dismiss-item, accept-feedback, skip-stage, add-feedback`,
          },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[RALPH STAGE-ACTION API] Error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
