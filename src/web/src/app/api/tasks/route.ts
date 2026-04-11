import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/middleware';
import { createTask, listTasks } from '@/lib/managers/task-manager';
import {
  createProjectId,
  createTaskId,
  type TaskStatus,
  type TaskPriority,
} from '@/lib/managers/task-types';
import type { WorkspaceId } from '@/lib/types';

/**
 * Schema for POST request to create a task
 */
const CreateTaskRequestSchema = z.object({
  workspaceId: z.string().min(1, 'Workspace ID is required'),
  projectId: z.string().optional(),
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  status: z.enum(['backlog', 'todo', 'in_progress', 'done']).optional(),
  priority: z.number().min(0).max(4).optional(),
  parentId: z.string().optional(),
  sortOrder: z.number().optional(),
});

/**
 * GET /api/tasks
 *
 * List all tasks for a workspace.
 * Query params:
 * - workspaceId: The workspace to list tasks for (required)
 * - projectId: Filter by project (optional)
 * - status: Filter by status (optional)
 * - parentId: Filter by parent task (optional, use 'null' for top-level tasks)
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) return authResult.response!;

    const url = new URL(request.url);
    const workspaceId = url.searchParams.get('workspaceId');
    const projectIdParam = url.searchParams.get('projectId');
    const statusParam = url.searchParams.get('status');
    const parentIdParam = url.searchParams.get('parentId');

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
    }

    // Build filter options
    const options: {
      projectId?: ReturnType<typeof createProjectId>;
      status?: TaskStatus;
      parentId?: ReturnType<typeof createTaskId> | null;
    } = {};

    if (projectIdParam) {
      options.projectId = createProjectId(projectIdParam);
    }
    if (statusParam && ['backlog', 'todo', 'in_progress', 'done'].includes(statusParam)) {
      options.status = statusParam as TaskStatus;
    }
    if (parentIdParam !== null) {
      if (parentIdParam === 'null') {
        options.parentId = null;
      } else if (parentIdParam) {
        options.parentId = createTaskId(parentIdParam);
      }
    }

    const result = await listTasks(workspaceId as WorkspaceId, options);

    if (!result.success) {
      console.error('[TASKS API] Failed to list tasks:', result.error);
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    return NextResponse.json({
      tasks: result.data,
      meta: {
        total: result.data.length,
        workspaceId,
        projectId: projectIdParam,
        status: statusParam,
        parentId: parentIdParam,
      },
    });
  } catch (error) {
    console.error('[TASKS API] Error listing tasks:', error);
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
 * POST /api/tasks
 *
 * Create a new task.
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) return authResult.response!;

    const body = await request.json();
    const parseResult = CreateTaskRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId, projectId, title, description, status, priority, parentId, sortOrder } =
      parseResult.data;

    // Build input object with only defined properties
    const input: Parameters<typeof createTask>[0] = {
      workspaceId: workspaceId as WorkspaceId,
      title,
    };
    if (projectId) input.projectId = createProjectId(projectId);
    if (description) input.description = description;
    if (status) input.status = status as TaskStatus;
    if (priority !== undefined) input.priority = priority as TaskPriority;
    if (parentId) input.parentId = createTaskId(parentId);
    if (sortOrder !== undefined) input.sortOrder = sortOrder;

    const result = await createTask(input);

    if (!result.success) {
      console.error('[TASKS API] Failed to create task:', result.error);
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    return NextResponse.json({ task: result.data }, { status: 201 });
  } catch (error) {
    console.error('[TASKS API] Error creating task:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
