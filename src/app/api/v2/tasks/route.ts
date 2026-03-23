import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/middleware';
import {
  createRalphTask,
  getAllRalphTasks,
  getRalphTasksByStatus,
} from '@/lib/managers/ralph-task-manager';
import { getAllWorkspaces } from '@/lib/managers/workspace-manager';
import type { WorkspaceId } from '@/lib/types/index';

const CreateTaskSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional().default(''),
  repo_url: z.string().url().optional(),
  branch: z.string().optional(),
  status: z.enum(['backlog', 'ready']).optional().default('backlog'),
  workspace_id: z.string().optional(),
});

/** Map V2 status names to Ralph status names */
const V2_TO_RALPH_STATUS: Record<string, string> = {
  backlog: 'draft',
  ready: 'ready',
  coding: 'executing',
  review: 'complete',
  done: 'complete',
};

/** Map Ralph status names to V2 status names */
const RALPH_TO_V2_STATUS: Record<string, string> = {
  draft: 'backlog',
  triage: 'backlog',
  planning: 'backlog',
  research: 'backlog',
  ready: 'ready',
  executing: 'coding',
  complete: 'done',
};

/**
 * POST /api/v2/tasks — Create a new task (as a Ralph task)
 */
export async function POST(request: NextRequest) {
  const authResult = await withAuth(request);
  if (!authResult.success) return authResult.response!;

  try {
    const body = await request.json();
    const parsed = CreateTaskSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    // Find workspace: use explicit workspace_id, or match by repo_url, or use first workspace
    let workspaceId: string | undefined = parsed.data.workspace_id;
    if (!workspaceId) {
      const wsResult = await getAllWorkspaces();
      if (wsResult.success) {
        if (parsed.data.repo_url) {
          const normalizedUrl = parsed.data.repo_url.replace(/\.git$/, '').toLowerCase();
          const match = wsResult.data.find(
            (ws) => ws.repoUrl && ws.repoUrl.replace(/\.git$/, '').toLowerCase() === normalizedUrl
          );
          if (match) workspaceId = match.id;
        }
        if (!workspaceId && wsResult.data.length > 0) {
          workspaceId = wsResult.data[0]!.id;
        }
      }
    }

    if (!workspaceId) {
      return NextResponse.json(
        { error: 'No workspace found. Provide workspace_id or ensure a workspace exists.' },
        { status: 400 }
      );
    }

    const ralphStatus = V2_TO_RALPH_STATUS[parsed.data.status] ?? 'draft';

    const result = await createRalphTask({
      title: parsed.data.title,
      description: parsed.data.description || null,
      workspaceId: workspaceId as WorkspaceId,
      status: ralphStatus,
      filePaths: [],
      deliveryMethod: 'merge-request',
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    // Return V2-compatible response shape
    const task = result.data;
    const v2Task = {
      id: task.id,
      title: task.title,
      description: task.description ?? '',
      status: RALPH_TO_V2_STATUS[task.status] ?? task.status,
      repo_url: parsed.data.repo_url ?? null,
      branch: parsed.data.branch ?? null,
      created_at: task.createdAt,
      updated_at: task.updatedAt,
    };

    console.log(`[V2 TASKS] Created Ralph task ${task.id}: ${task.title}`);
    return NextResponse.json({ task: v2Task }, { status: 201 });
  } catch (error) {
    console.error('[V2 TASKS] Failed to create task:', error);
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  }
}

/**
 * GET /api/v2/tasks — List tasks, optionally filtered by status
 */
export async function GET(request: NextRequest) {
  const authResult = await withAuth(request);
  if (!authResult.success) return authResult.response!;

  try {
    const { searchParams } = new URL(request.url);
    const v2Status = searchParams.get('status');

    let entries;
    if (v2Status) {
      const ralphStatus = V2_TO_RALPH_STATUS[v2Status] ?? v2Status;
      const result = await getRalphTasksByStatus(ralphStatus);
      if (!result.success) {
        return NextResponse.json({ error: result.error.message }, { status: 500 });
      }
      entries = result.data;
    } else {
      const result = await getAllRalphTasks();
      if (!result.success) {
        return NextResponse.json({ error: result.error.message }, { status: 500 });
      }
      entries = result.data;
    }

    // Map to V2-compatible response shape
    const tasks = entries.map((entry) => ({
      id: entry.id,
      title: entry.title,
      description: '',
      status: RALPH_TO_V2_STATUS[entry.status] ?? entry.status,
      repo_url: null,
      branch: null,
      created_at: entry.updatedAt,
      updated_at: entry.updatedAt,
    }));

    return NextResponse.json({ tasks });
  } catch (error) {
    console.error('[V2 TASKS] Failed to list tasks:', error);
    return NextResponse.json({ error: 'Failed to list tasks' }, { status: 500 });
  }
}
