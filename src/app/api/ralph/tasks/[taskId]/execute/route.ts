import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/middleware';
import {
  getRalphTask,
  updateRalphTask,
  transitionRalphTask,
  resolveBaseBranch,
  resolvePrTargetBranch,
} from '@/lib/managers/ralph-task-manager';
import { loadWorkspace } from '@/lib/managers/workspace-manager';
import { switchBranch, getLocalBranches } from '@/lib/git/branches';
import type { WorkspaceId, FilePath } from '@/lib/types/index';

/**
 * Request body schema for execute endpoint
 */
const ExecuteRequestSchema = z.object({
  // If true, confirm branch creation - required for execution to proceed
  confirmBranchCreation: z.boolean().default(false),
});

/**
 * POST /api/ralph/tasks/[taskId]/execute
 *
 * Execute a task that is in the "ready" state.
 * This creates the feature branch from the base branch and transitions to "executing".
 *
 * Body:
 * - confirmBranchCreation: boolean (required to be true to proceed)
 *
 * Returns:
 * - task: the updated task with featureBranch set
 * - branchCreated: the name of the created branch
 *
 * Errors:
 * - 400: Task not in ready state
 * - 409: Branch name conflict
 * - 500: Branch creation failed
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) return authResult.response!;

    const { taskId } = await params;

    // Parse and validate request body
    const body = await request.json();
    const parseResult = ExecuteRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid request body',
          details: parseResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { confirmBranchCreation } = parseResult.data;

    // User must confirm branch creation to proceed
    if (!confirmBranchCreation) {
      return NextResponse.json(
        {
          error: 'Branch creation not confirmed',
          message: 'Set confirmBranchCreation to true to proceed with execution',
        },
        { status: 400 }
      );
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

    // Task can be executed from any non-complete, non-draft state
    if (task.status === 'complete') {
      return NextResponse.json(
        {
          error: `Cannot execute a completed task. Current state: '${task.status}'`,
        },
        { status: 400 }
      );
    }

    // Task must have a workspace
    if (!task.workspaceId) {
      return NextResponse.json({ error: 'Task has no associated workspace' }, { status: 400 });
    }

    // Load the workspace to get its path
    const workspaceResult = await loadWorkspace(task.workspaceId as WorkspaceId);
    if (!workspaceResult.success) {
      return NextResponse.json(
        { error: `Failed to load workspace: ${workspaceResult.error.message}` },
        { status: 500 }
      );
    }

    const workspace = workspaceResult.data;
    const workspacePath = workspace.path as FilePath;

    const isDirectCommit = (task.deliveryMethod ?? 'merge-request') === 'direct-commit';

    if (isDirectCommit) {
      // Direct commit mode: switch to the target branch, no new branch created
      const targetBranch = resolveBaseBranch(task, workspace.targetBranch);

      console.log(
        `[RALPH EXECUTE API] Direct commit on branch '${targetBranch}' for task ${taskId}`
      );

      // Switch to the target branch
      const switchResult = await switchBranch(workspacePath, targetBranch);
      if (!switchResult.success) {
        return NextResponse.json(
          {
            error: 'Failed to switch to target branch',
            message: `Could not switch to branch '${targetBranch}': ${switchResult.error.message}`,
          },
          { status: 500 }
        );
      }

      // Update task with branch ref (no feature branch, no PR target)
      await updateRalphTask(taskId, {
        baseBranch: targetBranch,
      });

      // Transition task to executing
      const transitionResult = await transitionRalphTask(
        taskId,
        'executing',
        `Direct commit on branch '${targetBranch}'`
      );

      if (!transitionResult.success) {
        return NextResponse.json(
          {
            error: 'Failed to transition task',
            message: transitionResult.error.message,
          },
          { status: 500 }
        );
      }

      console.log(
        `[RALPH EXECUTE API] Task ${taskId} now executing (direct commit) on branch ${targetBranch}`
      );

      return NextResponse.json({
        task: transitionResult.data,
        baseBranch: targetBranch,
        deliveryMethod: 'direct-commit',
        message: `Task execution started. Direct commit on branch '${targetBranch}'`,
      });
    }

    // Merge-request mode (default): create feature branch
    const baseBranch = resolveBaseBranch(task, workspace.targetBranch);
    const featureBranch = task.featureBranch || `ralph/${taskId}`;

    console.log(
      `[RALPH EXECUTE API] Creating branch '${featureBranch}' from '${baseBranch}' for task ${taskId}`
    );

    // Check if the branch already exists locally
    const localBranchesResult = await getLocalBranches(workspacePath);
    if (localBranchesResult.success && localBranchesResult.data.includes(featureBranch)) {
      return NextResponse.json(
        {
          error: 'Branch name conflict',
          message: `Branch '${featureBranch}' already exists. Please choose a different feature branch name.`,
          conflictingBranch: featureBranch,
        },
        { status: 409 }
      );
    }

    // First, switch to the base branch to ensure we're starting from the right point
    console.log(`[RALPH EXECUTE API] Switching to base branch: ${baseBranch}`);
    const switchToBaseResult = await switchBranch(workspacePath, baseBranch);
    if (!switchToBaseResult.success) {
      return NextResponse.json(
        {
          error: 'Failed to switch to base branch',
          message: `Could not switch to base branch '${baseBranch}': ${switchToBaseResult.error.message}`,
        },
        { status: 500 }
      );
    }

    // Create the feature branch from the current HEAD (which is now on base branch)
    console.log(`[RALPH EXECUTE API] Creating feature branch: ${featureBranch}`);
    const createBranchResult = await switchBranch(workspacePath, featureBranch);
    if (!createBranchResult.success) {
      return NextResponse.json(
        {
          error: 'Failed to create feature branch',
          message: `Could not create branch '${featureBranch}': ${createBranchResult.error.message}`,
        },
        { status: 500 }
      );
    }

    // Update task with actual branch refs
    const updateResult = await updateRalphTask(taskId, {
      baseBranch,
      featureBranch,
      prTargetBranch: resolvePrTargetBranch(task, workspace.targetBranch),
    });

    if (!updateResult.success) {
      console.error(
        `[RALPH EXECUTE API] Failed to update task with branch info: ${updateResult.error.message}`
      );
      // Continue anyway - branch was created, transition is more important
    }

    // Transition task to executing
    const transitionResult = await transitionRalphTask(
      taskId,
      'executing',
      `Feature branch '${featureBranch}' created from '${baseBranch}'`
    );

    if (!transitionResult.success) {
      return NextResponse.json(
        {
          error: 'Failed to transition task',
          message: transitionResult.error.message,
          branchCreated: featureBranch,
          warning: 'Branch was created but task status was not updated',
        },
        { status: 500 }
      );
    }

    console.log(`[RALPH EXECUTE API] Task ${taskId} now executing on branch ${featureBranch}`);

    return NextResponse.json({
      task: transitionResult.data,
      branchCreated: featureBranch,
      baseBranch,
      deliveryMethod: 'merge-request',
      message: `Task execution started. Working on branch '${featureBranch}' (from '${baseBranch}')`,
    });
  } catch (error) {
    console.error('[RALPH EXECUTE API] Error:', error);
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
 * GET /api/ralph/tasks/[taskId]/execute
 *
 * Preview what will happen when executing a task.
 * Returns branch information without making any changes.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) return authResult.response!;

    const { taskId } = await params;

    // Get the task
    const taskResult = await getRalphTask(taskId);
    if (!taskResult.success) {
      if (taskResult.error.message.includes('not found')) {
        return NextResponse.json({ error: taskResult.error.message }, { status: 404 });
      }
      return NextResponse.json({ error: taskResult.error.message }, { status: 500 });
    }

    const task = taskResult.data;

    // Task can execute from any non-complete, non-draft state
    const canExecute = task.status !== 'complete' && task.status !== 'draft';
    const isDirectCommit = (task.deliveryMethod ?? 'merge-request') === 'direct-commit';

    // Load workspace for branch info
    let workspaceTargetBranch: string | undefined;
    let branchConflict = false;

    if (task.workspaceId) {
      const workspaceResult = await loadWorkspace(task.workspaceId as WorkspaceId);
      if (workspaceResult.success) {
        workspaceTargetBranch = workspaceResult.data.targetBranch;

        // Check for branch conflicts (only for merge-request mode)
        if (!isDirectCommit) {
          const localBranchesResult = await getLocalBranches(workspaceResult.data.path as FilePath);
          const featureBranch = task.featureBranch || `ralph/${taskId}`;
          if (localBranchesResult.success && localBranchesResult.data.includes(featureBranch)) {
            branchConflict = true;
          }
        }
      }
    }

    const baseBranch = resolveBaseBranch(task, workspaceTargetBranch);
    const featureBranch = task.featureBranch || `ralph/${taskId}`;

    return NextResponse.json({
      taskId,
      currentStatus: task.status,
      canExecute,
      deliveryMethod: task.deliveryMethod ?? 'merge-request',
      branchInfo: {
        baseBranch,
        featureBranch,
        prTargetBranch: resolvePrTargetBranch(task, workspaceTargetBranch),
        workspaceTargetBranch,
      },
      branchConflict,
      // Include plan info for Ready state review
      planInfo: {
        currentPlan: task.planningState?.currentPlan || null,
        iterationCount: task.planningState?.iterations?.length || 0,
        lastOutcome: task.planningState?.iterations?.slice(-1)[0]?.outcome || null,
      },
      message: canExecute
        ? isDirectCommit
          ? `Ready to start execution on branch '${baseBranch}'`
          : `Ready to create branch '${featureBranch}' from '${baseBranch}'`
        : `Task is in '${task.status}' state and cannot be executed.`,
    });
  } catch (error) {
    console.error('[RALPH EXECUTE API] Error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
