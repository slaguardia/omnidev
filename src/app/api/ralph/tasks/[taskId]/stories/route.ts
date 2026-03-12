import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import {
  getRalphTask,
  updateGeneratedStories,
  approveGeneratedStories,
  requestStoryRevision,
  parseGeneratedStories,
  type GeneratedStoryPreview,
} from '@/lib/managers/ralph-task-manager';

/**
 * GET /api/ralph/tasks/[taskId]/stories
 *
 * Get generated stories preview for a task.
 * Returns stories parsed from planning output or stored in planningState.
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

    // Get the task
    const taskResult = await getRalphTask(taskId);

    if (!taskResult.success) {
      if (taskResult.error.message.includes('not found')) {
        return NextResponse.json({ error: taskResult.error.message }, { status: 404 });
      }
      return NextResponse.json({ error: taskResult.error.message }, { status: 500 });
    }

    const task = taskResult.data;

    // Check if there are already generated stories in planning state
    let stories = task.planningState?.generatedStories || [];

    // If no stored stories but there's a plan, try to parse stories from it
    if (stories.length === 0 && task.planningState?.currentPlan) {
      stories = parseGeneratedStories(task.planningState.currentPlan);

      // If stories were parsed, save them to the task
      if (stories.length > 0) {
        await updateGeneratedStories(taskId, stories);
      }
    }

    return NextResponse.json({
      taskId,
      taskTitle: task.title,
      status: task.status,
      stories,
      hasChildren: task.childIds.length > 0,
      childCount: task.childIds.length,
      revisionFeedback: task.planningState?.storyRevisionFeedback || null,
    });
  } catch (error) {
    console.error('[RALPH STORIES API] GET Error:', error);
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
 * PUT /api/ralph/tasks/[taskId]/stories
 *
 * Update the generated stories preview (edit titles, AC, reorder, add, delete).
 *
 * Request body:
 * - stories: GeneratedStoryPreview[] - the updated list of stories
 */
export async function PUT(
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

    // Parse the request body
    const body = await request.json();
    const { stories } = body as { stories: GeneratedStoryPreview[] };

    if (!stories || !Array.isArray(stories)) {
      return NextResponse.json({ error: 'stories array is required' }, { status: 400 });
    }

    // Validate each story has required fields
    for (let i = 0; i < stories.length; i++) {
      const story = stories[i];
      if (!story?.tempId || !story.title || !story.userStory) {
        return NextResponse.json(
          { error: `Invalid story at index ${i}: missing required fields` },
          { status: 400 }
        );
      }
    }

    // Update the stories
    const updateResult = await updateGeneratedStories(taskId, stories);

    if (!updateResult.success) {
      return NextResponse.json({ error: updateResult.error.message }, { status: 500 });
    }

    return NextResponse.json({
      taskId,
      stories: updateResult.data.planningState?.generatedStories || [],
    });
  } catch (error) {
    console.error('[RALPH STORIES API] PUT Error:', error);
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
 * POST /api/ralph/tasks/[taskId]/stories
 *
 * Approve stories (creates child tasks) or request revision.
 *
 * Request body:
 * - action: 'approve' | 'revision'
 * - stories: GeneratedStoryPreview[] (required for 'approve')
 * - feedback: string (required for 'revision')
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

    // Parse the request body
    const body = await request.json();
    const { action, stories, feedback } = body as {
      action: 'approve' | 'revision';
      stories?: GeneratedStoryPreview[];
      feedback?: string;
    };

    if (!action || !['approve', 'revision'].includes(action)) {
      return NextResponse.json(
        { error: "action must be 'approve' or 'revision'" },
        { status: 400 }
      );
    }

    // Get the task to validate state
    const taskResult = await getRalphTask(taskId);
    if (!taskResult.success) {
      if (taskResult.error.message.includes('not found')) {
        return NextResponse.json({ error: taskResult.error.message }, { status: 404 });
      }
      return NextResponse.json({ error: taskResult.error.message }, { status: 500 });
    }

    const task = taskResult.data;

    // Only allow story operations in planning or research states
    const validStatuses = ['planning', 'research', 'triage'];
    if (!validStatuses.includes(task.status)) {
      return NextResponse.json(
        {
          error: `Cannot modify stories when task is in '${task.status}' status. Must be in planning, research, or triage.`,
        },
        { status: 422 }
      );
    }

    if (action === 'approve') {
      if (!stories || stories.length === 0) {
        return NextResponse.json(
          { error: 'stories array is required for approve action' },
          { status: 400 }
        );
      }

      const approveResult = await approveGeneratedStories(taskId, stories);

      if (!approveResult.success) {
        return NextResponse.json({ error: approveResult.error.message }, { status: 500 });
      }

      return NextResponse.json({
        taskId,
        action: 'approved',
        storiesCreated: stories.length,
        childIds: approveResult.data.childIds,
      });
    } else {
      // action === 'revision'
      if (!feedback || typeof feedback !== 'string') {
        return NextResponse.json(
          { error: 'feedback is required for revision action' },
          { status: 400 }
        );
      }

      const revisionResult = await requestStoryRevision(taskId, feedback);

      if (!revisionResult.success) {
        return NextResponse.json({ error: revisionResult.error.message }, { status: 500 });
      }

      return NextResponse.json({
        taskId,
        action: 'revision_requested',
        feedback,
      });
    }
  } catch (error) {
    console.error('[RALPH STORIES API] POST Error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
