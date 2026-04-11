import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/middleware';
import { requireStageTokenMatchesRouteTask } from '@/lib/auth/permission-check';
import {
  getRalphTask,
  getReadyChildTasks,
  getNextReadyChildTask,
  getFeatureExecutionStatus,
  transitionRalphTask,
  updateRalphTask,
  resolveBaseBranch,
  resolvePrTargetBranch,
} from '@/lib/managers/ralph-task-manager';
import { loadWorkspace } from '@/lib/managers/workspace-manager';
import { resolveWorkspaceGitRoot } from '@/lib/workspace/resolve-workspace-root';
import { switchBranch, getLocalBranches } from '@/lib/git/branches';
import type { WorkspaceId, FilePath } from '@/lib/types/index';

/**
 * Request body schema for batch execute endpoint
 */
const BatchExecuteRequestSchema = z.object({
  // Execution mode: 'next' executes only the next ready story, 'all' executes all ready stories
  mode: z.enum(['next', 'all']),
  // Must confirm batch execution to proceed
  confirm: z.boolean().default(false),
});

/**
 * Execute a single child story by creating its branch and transitioning to executing
 */
async function executeChildStory(
  childId: string,
  workspacePath: FilePath,
  workspaceTargetBranch?: string
): Promise<{ success: boolean; branchCreated?: string; error?: string }> {
  try {
    const childResult = await getRalphTask(childId);
    if (!childResult.success) {
      return { success: false, error: childResult.error.message };
    }

    const child = childResult.data;
    const isDirectCommit = (child.deliveryMethod ?? 'merge-request') === 'direct-commit';

    // Determine branch names
    const baseBranch = resolveBaseBranch(child, workspaceTargetBranch);

    if (isDirectCommit) {
      // Direct commit mode: switch to the target branch, no new branch
      const switchResult = await switchBranch(workspacePath, baseBranch);
      if (!switchResult.success) {
        return {
          success: false,
          error: `Failed to switch to branch '${baseBranch}': ${switchResult.error.message}`,
        };
      }

      await updateRalphTask(childId, { baseBranch });

      const transitionResult = await transitionRalphTask(
        childId,
        'executing',
        `Direct commit on branch '${baseBranch}'`
      );

      if (!transitionResult.success) {
        return {
          success: false,
          error: `Failed to transition task: ${transitionResult.error.message}`,
        };
      }

      return { success: true, branchCreated: baseBranch };
    }

    // Merge-request mode: create feature branch
    const featureBranch = child.featureBranch || `ralph/${childId}`;

    // Check if branch already exists
    const localBranchesResult = await getLocalBranches(workspacePath);
    if (localBranchesResult.success && localBranchesResult.data.includes(featureBranch)) {
      return {
        success: false,
        error: `Branch '${featureBranch}' already exists`,
      };
    }

    // Switch to base branch
    const switchToBaseResult = await switchBranch(workspacePath, baseBranch);
    if (!switchToBaseResult.success) {
      return {
        success: false,
        error: `Failed to switch to base branch '${baseBranch}': ${switchToBaseResult.error.message}`,
      };
    }

    // Create feature branch
    const createBranchResult = await switchBranch(workspacePath, featureBranch);
    if (!createBranchResult.success) {
      return {
        success: false,
        error: `Failed to create branch '${featureBranch}': ${createBranchResult.error.message}`,
      };
    }

    // Update task with branch refs
    await updateRalphTask(childId, {
      baseBranch,
      featureBranch,
      prTargetBranch: resolvePrTargetBranch(child, workspaceTargetBranch),
    });

    // Transition to executing
    const transitionResult = await transitionRalphTask(
      childId,
      'executing',
      `Feature branch '${featureBranch}' created from '${baseBranch}'`
    );

    if (!transitionResult.success) {
      return {
        success: false,
        error: `Failed to transition task: ${transitionResult.error.message}`,
      };
    }

    return { success: true, branchCreated: featureBranch };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * POST /api/ralph/tasks/[taskId]/batch-execute
 *
 * Execute child stories of a feature task.
 *
 * Body:
 * - mode: 'next' (execute next ready story) or 'all' (execute all ready stories)
 * - confirm: boolean (must be true to proceed)
 *
 * Returns:
 * - executed: array of { taskId, branchCreated } for successfully executed stories
 * - errors: array of { taskId, error } for failed executions
 * - status: updated execution status for the feature
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) return authResult.response!;

    const { taskId } = await params;

    const scopeDeniedBatchPost = requireStageTokenMatchesRouteTask(authResult.auth!, taskId);
    if (scopeDeniedBatchPost) return scopeDeniedBatchPost;

    // Parse and validate request body
    const body = await request.json();
    const parseResult = BatchExecuteRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid request body',
          details: parseResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { mode, confirm } = parseResult.data;

    if (!confirm) {
      return NextResponse.json(
        {
          error: 'Batch execution not confirmed',
          message: 'Set confirm to true to proceed with batch execution',
        },
        { status: 400 }
      );
    }

    // Get the parent task
    const taskResult = await getRalphTask(taskId);
    if (!taskResult.success) {
      if (taskResult.error.message.includes('not found')) {
        return NextResponse.json({ error: taskResult.error.message }, { status: 404 });
      }
      return NextResponse.json({ error: taskResult.error.message }, { status: 500 });
    }

    const task = taskResult.data;

    // Must have children to batch execute
    if (task.childIds.length === 0) {
      return NextResponse.json({ error: 'Task has no subtasks to execute' }, { status: 400 });
    }

    // Load workspace
    if (!task.workspaceId) {
      return NextResponse.json({ error: 'Task has no associated workspace' }, { status: 400 });
    }

    const workspaceResult = await loadWorkspace(task.workspaceId as WorkspaceId);
    if (!workspaceResult.success) {
      return NextResponse.json(
        { error: `Failed to load workspace: ${workspaceResult.error.message}` },
        { status: 500 }
      );
    }

    const workspace = workspaceResult.data;
    const workspacePath = await resolveWorkspaceGitRoot(workspace);

    // Get stories to execute based on mode
    let storiesToExecute: { id: string; title: string }[] = [];

    if (mode === 'next') {
      // Get only the next ready story
      const nextResult = await getNextReadyChildTask(taskId);
      if (!nextResult.success) {
        return NextResponse.json({ error: nextResult.error.message }, { status: 500 });
      }
      if (nextResult.data) {
        storiesToExecute = [{ id: nextResult.data.id, title: nextResult.data.title }];
      }
    } else {
      // Get all ready stories
      const readyResult = await getReadyChildTasks(taskId);
      if (!readyResult.success) {
        return NextResponse.json({ error: readyResult.error.message }, { status: 500 });
      }
      storiesToExecute = readyResult.data.map((s) => ({ id: s.id, title: s.title }));
    }

    if (storiesToExecute.length === 0) {
      return NextResponse.json(
        {
          error: 'No ready stories to execute',
          message:
            'All stories are either blocked, already executing, completed, or not yet in ready state',
        },
        { status: 400 }
      );
    }

    console.log(
      `[RALPH BATCH EXECUTE API] Executing ${storiesToExecute.length} stories for feature ${taskId}`
    );

    // Execute each story
    const executed: { taskId: string; title: string; branchCreated: string }[] = [];
    const errors: { taskId: string; title: string; error: string }[] = [];

    for (const story of storiesToExecute) {
      const result = await executeChildStory(story.id, workspacePath, workspace.targetBranch);
      if (result.success && result.branchCreated) {
        executed.push({
          taskId: story.id,
          title: story.title,
          branchCreated: result.branchCreated,
        });
      } else {
        errors.push({
          taskId: story.id,
          title: story.title,
          error: result.error || 'Unknown error',
        });
      }
    }

    // Get updated execution status
    const statusResult = await getFeatureExecutionStatus(taskId);
    const status = statusResult.success ? statusResult.data : null;

    return NextResponse.json({
      mode,
      executed,
      errors,
      status,
      message:
        executed.length > 0
          ? `Started execution for ${executed.length} ${executed.length === 1 ? 'subtask' : 'subtasks'}`
          : 'No subtasks were executed',
    });
  } catch (error) {
    console.error('[RALPH BATCH EXECUTE API] Error:', error);
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
 * GET /api/ralph/tasks/[taskId]/batch-execute
 *
 * Preview batch execution - returns list of ready stories that would be executed.
 * Also returns current execution status for the feature.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) return authResult.response!;

    const { taskId } = await params;

    const scopeDeniedBatchGet = requireStageTokenMatchesRouteTask(authResult.auth!, taskId);
    if (scopeDeniedBatchGet) return scopeDeniedBatchGet;

    // Get the parent task
    const taskResult = await getRalphTask(taskId);
    if (!taskResult.success) {
      if (taskResult.error.message.includes('not found')) {
        return NextResponse.json({ error: taskResult.error.message }, { status: 404 });
      }
      return NextResponse.json({ error: taskResult.error.message }, { status: 500 });
    }

    const task = taskResult.data;

    // Must have children
    if (task.childIds.length === 0) {
      return NextResponse.json({ error: 'Task has no subtasks' }, { status: 400 });
    }

    // Get execution status
    const statusResult = await getFeatureExecutionStatus(taskId);
    if (!statusResult.success) {
      return NextResponse.json(
        { error: `Failed to get execution status: ${statusResult.error.message}` },
        { status: 500 }
      );
    }

    const status = statusResult.data;

    // Get ready stories with full info
    const readyResult = await getReadyChildTasks(taskId);
    const readyStories = readyResult.success
      ? readyResult.data.map((s) => ({
          id: s.id,
          title: s.title,
          subtaskOrder: s.subtaskOrder ?? s.storyOrder,
          featureBranch: s.featureBranch || `ralph/${s.id}`,
        }))
      : [];

    // Get next story
    const nextStory = readyStories[0] ?? null;

    return NextResponse.json({
      taskId,
      taskTitle: task.title,
      canExecute: readyStories.length > 0,
      status,
      readyStories,
      nextStory,
      message:
        readyStories.length > 0
          ? `${readyStories.length} ${readyStories.length === 1 ? 'subtask is' : 'subtasks are'} ready for execution`
          : 'No subtasks are ready for execution',
    });
  } catch (error) {
    console.error('[RALPH BATCH EXECUTE API] Error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
