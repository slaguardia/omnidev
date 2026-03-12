import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/middleware';
import { getTask, updateTask, deleteTask, getSubtasks } from '@/lib/managers/task-manager';
import {
  createTaskId,
  createProjectId,
  type TaskStatus,
  type TaskPriority,
  type TaskQuestion,
} from '@/lib/managers/task-types';
import type { WorkspaceId } from '@/lib/types';

/**
 * Schema for PATCH request to update a task
 */
const UpdateTaskRequestSchema = z.object({
  projectId: z.string().nullable().optional(),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(['backlog', 'todo', 'in_progress', 'done']).optional(),
  priority: z.number().min(0).max(4).optional(),
  parentId: z.string().nullable().optional(),
  sortOrder: z.number().optional(),
  featureBranch: z.string().nullable().optional(),
  prUrl: z.string().nullable().optional(),
  questions: z
    .array(
      z.object({
        id: z.string(),
        question: z.string(),
        context: z.string().optional(),
        answer: z.string().optional(),
        answeredAt: z.string().optional(),
      })
    )
    .optional(),
});

/**
 * GET /api/tasks/[id]
 *
 * Get a task by ID with subtasks.
 * Query params:
 * - workspaceId: The workspace the task belongs to (required)
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) return authResult.response!;

    const { id } = await params;
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get('workspaceId');

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
    }

    const taskId = createTaskId(id);
    const result = await getTask(workspaceId as WorkspaceId, taskId);

    if (!result.success) {
      if (result.error.message.includes('not found')) {
        return NextResponse.json({ error: result.error.message }, { status: 404 });
      }
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    // Get subtasks
    const subtasksResult = await getSubtasks(workspaceId as WorkspaceId, taskId);
    const subtasks = subtasksResult.success ? subtasksResult.data : [];

    return NextResponse.json({
      task: result.data,
      subtasks,
    });
  } catch (error) {
    console.error('[TASK API] Error getting task:', error);
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
 * PATCH /api/tasks/[id]
 *
 * Update a task.
 * Query params:
 * - workspaceId: The workspace the task belongs to (required)
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) return authResult.response!;

    const { id } = await params;
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get('workspaceId');

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
    }

    const body = await request.json();
    const parseResult = UpdateTaskRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const updates = parseResult.data;

    // Build update object with proper type conversions
    const updateData: Parameters<typeof updateTask>[2] = {};

    if (updates.projectId !== undefined) {
      updateData.projectId = updates.projectId ? createProjectId(updates.projectId) : null;
    }
    if (updates.title !== undefined) {
      updateData.title = updates.title;
    }
    if (updates.description !== undefined) {
      updateData.description = updates.description;
    }
    if (updates.status !== undefined) {
      updateData.status = updates.status as TaskStatus;
    }
    if (updates.priority !== undefined) {
      updateData.priority = updates.priority as TaskPriority;
    }
    if (updates.parentId !== undefined) {
      updateData.parentId = updates.parentId ? createTaskId(updates.parentId) : null;
    }
    if (updates.sortOrder !== undefined) {
      updateData.sortOrder = updates.sortOrder;
    }
    if (updates.featureBranch !== undefined) {
      updateData.featureBranch = updates.featureBranch;
    }
    if (updates.prUrl !== undefined) {
      updateData.prUrl = updates.prUrl;
    }
    if (updates.questions !== undefined) {
      updateData.questions = updates.questions as TaskQuestion[];
    }

    const result = await updateTask(workspaceId as WorkspaceId, createTaskId(id), updateData);

    if (!result.success) {
      if (result.error.message.includes('not found')) {
        return NextResponse.json({ error: result.error.message }, { status: 404 });
      }
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    return NextResponse.json({ task: result.data });
  } catch (error) {
    console.error('[TASK API] Error updating task:', error);
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
 * DELETE /api/tasks/[id]
 *
 * Delete a task.
 * Query params:
 * - workspaceId: The workspace the task belongs to (required)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) return authResult.response!;

    const { id } = await params;
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get('workspaceId');

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
    }

    const result = await deleteTask(workspaceId as WorkspaceId, createTaskId(id));

    if (!result.success) {
      if (result.error.message.includes('not found')) {
        return NextResponse.json({ error: result.error.message }, { status: 404 });
      }
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[TASK API] Error deleting task:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
