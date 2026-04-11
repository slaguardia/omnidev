import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/middleware';
import { requirePermission } from '@/lib/auth/permission-check';
import {
  createRalphTask,
  createSubtask,
  getRalphPlaybook,
} from '@/lib/managers/ralph-task-manager';
import { getWorkspaceReadonly } from '@/lib/managers/workspace-manager';
import { fetchRepositoryPermissions } from '@/lib/api';
import { startStageRun } from '@/lib/ralph/stage-runner';
import type { WorkspaceId } from '@/lib/types';

/**
 * Request body schema for creating a new Ralph task.
 * When parentId is provided, workspaceId is optional (inherited from parent).
 */
const CreateTaskRequestSchema = z
  .object({
    title: z.string().min(1, 'Title is required'),
    workspaceId: z.string().min(1, 'Workspace is required').optional(),
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
    // Optional playbook ID to associate with a playbook
    playbookId: z.string().nullable().optional(),
    // If true and playbookId is set, auto-start the first playbook stage after creation
    autoRun: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    // workspaceId is required when creating a top-level task (no parentId)
    if (!data.parentId && !data.workspaceId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Workspace is required for top-level tasks',
        path: ['workspaceId'],
      });
    }
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

    // Permission check: stage tokens need tasks:create or subtasks:create (scoped to parent)
    if (authResult.auth?.stageToken) {
      const parsedBody = parseResult.success ? parseResult.data : null;
      const parentId = parsedBody?.parentId;
      if (parentId) {
        const denied = requirePermission(authResult.auth, 'subtasks:create', {
          taskId: parentId,
        });
        if (denied) return denied;
      } else {
        const denied = requirePermission(authResult.auth, 'tasks:create');
        if (denied) return denied;
      }
    }
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

    // --- Subtask creation: delegate to createSubtask() for full inheritance ---
    if (taskData.parentId) {
      const createResult = await createSubtask(taskData.parentId, {
        title: taskData.title,
        description: taskData.description,
      });

      if (!createResult.success) {
        console.error('[RALPH TASKS CREATE API] Failed to create subtask:', createResult.error);
        return NextResponse.json(
          { error: 'Failed to create subtask', details: createResult.error.message },
          { status: 500 }
        );
      }

      console.log('[RALPH TASKS CREATE API] Subtask created:', createResult.data.id);

      // Auto-run: if the subtask inherited a playbookId, start first stage
      let autoRunJobId: string | undefined;
      if (taskData.autoRun && createResult.data.playbookId) {
        try {
          const pbResult = await getRalphPlaybook(createResult.data.playbookId);
          if (pbResult.success && pbResult.data.stageIds.length > 0) {
            const firstStage = pbResult.data.stageIds[0]!;
            console.log(
              `[RALPH TASKS CREATE API] Auto-run: starting stage '${firstStage}' for subtask ${createResult.data.id}`
            );
            const stageResult = await startStageRun(createResult.data.id, firstStage);
            if (stageResult.error) {
              console.warn(`[RALPH TASKS CREATE API] Auto-run stage failed: ${stageResult.error}`);
            } else {
              autoRunJobId = stageResult.jobId;
            }
          }
        } catch (err) {
          console.warn('[RALPH TASKS CREATE API] Auto-run failed, subtask still created:', err);
        }
      }

      return NextResponse.json({
        task: createResult.data,
        autoRunJobId,
        message: 'Subtask created successfully',
      });
    }

    // --- Top-level task creation ---

    // Block direct-commit to protected branches the user can't push to
    if (taskData.deliveryMethod === 'direct-commit' && taskData.baseBranch) {
      try {
        const wsResult = await getWorkspaceReadonly(taskData.workspaceId! as WorkspaceId);
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
      workspaceId: taskData.workspaceId! as WorkspaceId,
      status: 'draft',
      parentId: null,
    });

    if (!createResult.success) {
      console.error('[RALPH TASKS CREATE API] Failed to create task:', createResult.error);
      return NextResponse.json(
        { error: 'Failed to create task', details: createResult.error.message },
        { status: 500 }
      );
    }

    console.log('[RALPH TASKS CREATE API] Task created:', createResult.data.id);

    // Auto-run: if autoRun is true and a playbook is set, start the first stage
    let autoRunJobId: string | undefined;
    if (taskData.autoRun && createResult.data.playbookId) {
      try {
        const pbResult = await getRalphPlaybook(createResult.data.playbookId);
        if (pbResult.success && pbResult.data.stageIds.length > 0) {
          const firstStage = pbResult.data.stageIds[0]!;
          console.log(
            `[RALPH TASKS CREATE API] Auto-run: starting stage '${firstStage}' for task ${createResult.data.id}`
          );
          const stageResult = await startStageRun(createResult.data.id, firstStage);
          if (stageResult.error) {
            console.warn(`[RALPH TASKS CREATE API] Auto-run stage failed: ${stageResult.error}`);
          } else {
            autoRunJobId = stageResult.jobId;
          }
        }
      } catch (err) {
        console.warn('[RALPH TASKS CREATE API] Auto-run failed, task still created:', err);
      }
    }

    return NextResponse.json({
      task: createResult.data,
      autoRunJobId,
      message: 'Task created successfully',
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
