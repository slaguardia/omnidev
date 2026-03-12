import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/middleware';
import {
  getRalphTask,
  getFeatureCompletionStats,
  completeFeatureTask,
  reopenChildStory,
} from '@/lib/managers/ralph-task-manager';

/**
 * Request body schema for feature completion
 */
const CompleteFeatureRequestSchema = z.object({
  // Optional summary notes for the feature
  summaryNotes: z.string().optional(),
  // Force completion even with incomplete children
  force: z.boolean().default(false),
  // Reason for force completion (required if force=true)
  forceReason: z.string().optional(),
});

/**
 * Request body schema for reopening a story
 */
const ReopenStoryRequestSchema = z.object({
  // Story ID to reopen
  storyId: z.string().min(1),
  // Reason for reopening
  reason: z.string().min(1),
});

/**
 * Format duration in milliseconds to human-readable string
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  if (ms < 86400000) return `${(ms / 3600000).toFixed(1)}h`;
  return `${(ms / 86400000).toFixed(1)}d`;
}

/**
 * GET /api/ralph/tasks/[taskId]/complete-feature
 *
 * Get feature completion preview with aggregate stats.
 * Shows child story status and whether feature can be completed.
 */
export async function GET(
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

    // Get the feature task
    const taskResult = await getRalphTask(taskId);
    if (!taskResult.success) {
      if (taskResult.error.message.includes('not found')) {
        return NextResponse.json({ error: taskResult.error.message }, { status: 404 });
      }
      return NextResponse.json({ error: taskResult.error.message }, { status: 500 });
    }

    const task = taskResult.data;

    // Validate it has children
    if (task.childIds.length === 0) {
      return NextResponse.json(
        { error: 'Task has no subtasks. Use /complete for tasks without children.' },
        { status: 400 }
      );
    }

    // Get completion stats
    const statsResult = await getFeatureCompletionStats(taskId);
    if (!statsResult.success) {
      return NextResponse.json({ error: statsResult.error.message }, { status: 500 });
    }

    const stats = statsResult.data;

    // Check if feature can be completed
    const allowedStatuses = ['ready', 'planning', 'research'];
    const canComplete = allowedStatuses.includes(task.status);
    const canCompleteDirectly = canComplete && stats.allChildrenComplete;

    return NextResponse.json({
      taskId,
      title: task.title,
      currentStatus: task.status,
      canComplete,
      canCompleteDirectly,
      requiresForce: canComplete && !stats.allChildrenComplete,
      stats: {
        ...stats,
        totalDurationFormatted: formatDuration(stats.totalDuration),
        childSummaries: stats.childSummaries.map((child) => ({
          ...child,
          durationFormatted: formatDuration(child.duration),
        })),
      },
      message: canCompleteDirectly
        ? `Ready to complete task. All ${stats.totalStories} subtasks are complete.`
        : canComplete
          ? `${stats.incompleteStories} of ${stats.totalStories} subtasks are incomplete. Force completion available.`
          : `Task is in '${task.status}' state. Must be in ready, planning, or research to complete.`,
    });
  } catch (error) {
    console.error('[RALPH COMPLETE FEATURE API] Error:', error);
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
 * POST /api/ralph/tasks/[taskId]/complete-feature
 *
 * Complete a feature task.
 * Validates all children are complete or requires force flag.
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

    // Parse and validate request body
    const body = await request.json();
    const parseResult = CompleteFeatureRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid request body',
          details: parseResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { summaryNotes, force, forceReason } = parseResult.data;

    // Complete the feature
    const result = await completeFeatureTask(taskId, {
      summaryNotes,
      force,
      forceReason,
    });

    if (!result.success) {
      // Check if it's a validation error vs server error
      const isValidationError =
        result.error.message.includes('Cannot complete') ||
        result.error.message.includes('requires') ||
        result.error.message.includes('must be');

      return NextResponse.json(
        { error: result.error.message },
        { status: isValidationError ? 400 : 500 }
      );
    }

    console.log(`[RALPH COMPLETE FEATURE API] Feature ${taskId} completed`);

    // Get final stats for response
    const statsResult = await getFeatureCompletionStats(taskId);

    return NextResponse.json({
      task: result.data,
      stats: statsResult.success ? statsResult.data : null,
      message: force
        ? `Feature completed (forced: ${forceReason})`
        : 'Feature completed successfully',
    });
  } catch (error) {
    console.error('[RALPH COMPLETE FEATURE API] Error:', error);
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
 * PATCH /api/ralph/tasks/[taskId]/complete-feature
 *
 * Reopen a completed child story.
 * Used when user wants to make changes to an already-complete story.
 */
export async function PATCH(
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

    // Validate the feature exists
    const featureResult = await getRalphTask(taskId);
    if (!featureResult.success) {
      if (featureResult.error.message.includes('not found')) {
        return NextResponse.json({ error: featureResult.error.message }, { status: 404 });
      }
      return NextResponse.json({ error: featureResult.error.message }, { status: 500 });
    }

    const feature = featureResult.data;

    if (feature.childIds.length === 0) {
      return NextResponse.json({ error: 'Task has no subtasks' }, { status: 400 });
    }

    // Parse and validate request body
    const body = await request.json();
    const parseResult = ReopenStoryRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid request body',
          details: parseResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { storyId, reason } = parseResult.data;

    // Validate the story belongs to this feature
    if (!feature.childIds.includes(storyId)) {
      return NextResponse.json({ error: 'Story does not belong to this feature' }, { status: 400 });
    }

    // Reopen the story
    const result = await reopenChildStory(storyId, reason);

    if (!result.success) {
      const isValidationError =
        result.error.message.includes('must be') || result.error.message.includes('not a');

      return NextResponse.json(
        { error: result.error.message },
        { status: isValidationError ? 400 : 500 }
      );
    }

    console.log(`[RALPH COMPLETE FEATURE API] Story ${storyId} reopened: ${reason}`);

    return NextResponse.json({
      story: result.data,
      message: `Story reopened: ${reason}`,
    });
  } catch (error) {
    console.error('[RALPH COMPLETE FEATURE API] Error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
