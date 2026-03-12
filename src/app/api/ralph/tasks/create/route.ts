import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/middleware';
import { createRalphTask, addChildToRalphTask } from '@/lib/managers/ralph-task-manager';
import { getWorkspaceReadonly } from '@/lib/managers/workspace-manager';
import { fetchRepositoryPermissions } from '@/lib/api';
import type { WorkspaceId } from '@/lib/types';

/**
 * Request body schema for creating a new Ralph task
 */
const CreateTaskRequestSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  workspaceId: z.string().min(1, 'Workspace is required'),
  description: z.string().min(1, 'Description is required'),
  instructions: z.string().nullable().optional(),
  filePaths: z.array(z.string()).default([]),
  baseBranch: z.string().nullable().optional(),
  featureBranch: z.string().nullable().optional(),
  prTargetBranch: z.string().nullable().optional(),
  deliveryMethod: z.enum(['merge-request', 'direct-commit']).default('merge-request'),
  // Optional parent ID to create as a subtask
  parentId: z.string().nullable().optional(),
  // Optional project ID to associate with a project
  projectId: z.string().nullable().optional(),
});

/**
 * POST /api/ralph/tasks/create
 *
 * Create a new Ralph task in Draft status.
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) return authResult.response!;

    const body = await request.json();

    // Validate request body
    const parseResult = CreateTaskRequestSchema.safeParse(body);
    if (!parseResult.success) {
      console.error('[RALPH TASKS CREATE API] Validation failed:', parseResult.error.flatten());
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: parseResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const taskData = parseResult.data;

    // Block direct-commit to protected branches the user can't push to
    if (taskData.deliveryMethod === 'direct-commit' && taskData.baseBranch) {
      try {
        const wsResult = await getWorkspaceReadonly(taskData.workspaceId as WorkspaceId);
        if (wsResult.success) {
          const workspace = wsResult.data;
          let isProtected = false;
          let canPush = true;

          // Fast path: use cached permissions when baseBranch matches the workspace targetBranch
          if (taskData.baseBranch === workspace.targetBranch && workspace.metadata?.permissions) {
            isProtected = workspace.metadata.permissions.targetBranchProtected;
            canPush = workspace.metadata.permissions.canPushToProtected;
          } else {
            // Slow path: live permission check for a different branch
            const permResult = await fetchRepositoryPermissions({
              repoUrl: workspace.repoUrl,
              branch: taskData.baseBranch,
              logPrefix: 'RALPH TASKS CREATE API',
            });
            if (permResult.success && permResult.data.permissions) {
              isProtected = permResult.data.permissions.targetBranchProtected;
              canPush = permResult.data.permissions.canPushToProtected;
            }
            // If fetch failed or no token configured, skip check (permissive)
          }

          if (isProtected && !canPush) {
            return NextResponse.json(
              {
                error: `Cannot direct-commit to protected branch "${taskData.baseBranch}". Switch delivery method to Merge Request, or choose an unprotected branch.`,
              },
              { status: 403 }
            );
          }
        }
      } catch (err) {
        // Permission check failed — allow task creation rather than blocking
        console.warn('[RALPH TASKS CREATE API] Permission pre-check failed, skipping:', err);
      }
    }

    // Create the task
    const createResult = await createRalphTask({
      ...taskData,
      workspaceId: taskData.workspaceId as WorkspaceId,
      status: 'draft',
      parentId: taskData.parentId ?? null,
    });

    if (!createResult.success) {
      console.error('[RALPH TASKS CREATE API] Failed to create task:', createResult.error);
      return NextResponse.json(
        { error: 'Failed to create task', details: createResult.error.message },
        { status: 500 }
      );
    }

    // If parentId was provided, link the new task as a child of the parent
    if (taskData.parentId) {
      const linkResult = await addChildToRalphTask(taskData.parentId, createResult.data.id);
      if (!linkResult.success) {
        console.warn(
          '[RALPH TASKS CREATE API] Failed to link subtask to parent:',
          linkResult.error?.message
        );
      }
    }

    console.log('[RALPH TASKS CREATE API] Task created:', createResult.data.id);
    return NextResponse.json({
      task: createResult.data,
      message: taskData.parentId ? 'Subtask created successfully' : 'Task created successfully',
    });
  } catch (error) {
    console.error('[RALPH TASKS CREATE API] Error creating task:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
