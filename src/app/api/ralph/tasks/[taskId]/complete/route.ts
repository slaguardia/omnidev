import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/middleware';
import { requireStageTokenMatchesRouteTask } from '@/lib/auth/permission-check';
import {
  getRalphTask,
  updateRalphTask,
  transitionRalphTask,
  resolvePrTargetBranch,
} from '@/lib/managers/ralph-task-manager';
import { loadWorkspace } from '@/lib/managers/workspace-manager';
import { createPullRequest } from '@/lib/github/pull-requests';
import { createMergeRequest } from '@/lib/gitlab/merge-requests';
import { detectProviderFromUrl, extractGitHubOwnerRepo } from '@/lib/git/provider-detection';
import { extractProjectIdFromUrl } from '@/lib/gitlab/api';
import type { WorkspaceId, GitUrl } from '@/lib/types/index';

/**
 * Request body schema for complete endpoint - preview (GET) or create PR (POST)
 */
const CompleteRequestSchema = z.object({
  // PR/MR title (defaults to task title)
  title: z.string().min(1).optional(),
  // PR/MR body/description
  body: z.string().optional(),
  // Skip PR creation and just mark complete
  skipPr: z.boolean().default(false),
  // Create as draft PR
  draft: z.boolean().default(false),
});

function getCompleteStatusMessage(
  canComplete: boolean,
  isDirectCommit: boolean,
  canCreatePr: boolean,
  provider: string,
  task: { status: string; featureBranch?: string | null | undefined },
  targetBranch: string
): string {
  if (!canComplete) {
    return `Task is in '${task.status}' state. Must be 'executing' to complete.`;
  }
  if (isDirectCommit) {
    return 'Direct commit task — will be marked complete without PR';
  }
  if (canCreatePr) {
    const prType = provider === 'github' ? 'PR' : 'MR';
    return `Ready to create ${prType} from '${task.featureBranch}' to '${targetBranch}'`;
  }
  if (task.featureBranch) {
    return 'Provider not supported for automatic PR creation';
  }
  return 'No feature branch configured';
}

/**
 * Generate a default PR body from task data
 */
function generateDefaultPrBody(task: {
  title: string;
  description?: string | null | undefined;
}): string {
  const lines = ['## Summary', '', `Task: ${task.title}`, ''];

  if (task.description) {
    lines.push('### Description', '', task.description, '');
  }

  lines.push('---', '', '_Created via Ralph Board_');

  return lines.join('\n');
}

/**
 * POST /api/ralph/tasks/[taskId]/complete
 *
 * Complete a task that is in the "executing" state.
 * Optionally creates a PR/MR before transitioning to "complete".
 *
 * Body:
 * - title: PR title (optional, defaults to task title)
 * - body: PR body (optional, auto-generated from task data)
 * - skipPr: boolean (if true, skip PR creation)
 * - draft: boolean (if true, create as draft PR)
 *
 * Returns:
 * - task: the updated task
 * - prUrl: the URL of the created PR (if created)
 *
 * Errors:
 * - 400: Task not in executing state
 * - 400: Missing branch configuration
 * - 500: PR creation failed
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) return authResult.response!;

    const { taskId } = await params;

    const scopeDeniedCompletePost = requireStageTokenMatchesRouteTask(authResult.auth!, taskId);
    if (scopeDeniedCompletePost) return scopeDeniedCompletePost;

    // Parse and validate request body
    const body = await request.json();
    const parseResult = CompleteRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid request body',
          details: parseResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { title, body: prBody, skipPr, draft } = parseResult.data;

    // Get the task
    const taskResult = await getRalphTask(taskId);
    if (!taskResult.success) {
      if (taskResult.error.message.includes('not found')) {
        return NextResponse.json({ error: taskResult.error.message }, { status: 404 });
      }
      return NextResponse.json({ error: taskResult.error.message }, { status: 500 });
    }

    const task = taskResult.data;

    // Task cannot be completed if already complete or still in draft
    if (task.status === 'complete') {
      return NextResponse.json({ error: `Task is already completed.` }, { status: 400 });
    }
    if (task.status === 'draft') {
      return NextResponse.json(
        { error: `Cannot complete a task in draft status.` },
        { status: 400 }
      );
    }

    // Task must have a workspace
    if (!task.workspaceId) {
      return NextResponse.json({ error: 'Task has no associated workspace' }, { status: 400 });
    }

    // Load the workspace to get provider info
    const workspaceResult = await loadWorkspace(task.workspaceId as WorkspaceId);
    if (!workspaceResult.success) {
      return NextResponse.json(
        { error: `Failed to load workspace: ${workspaceResult.error.message}` },
        { status: 500 }
      );
    }

    const workspace = workspaceResult.data;
    // Determine if PR should be created
    // Direct-commit tasks always skip PR (can't PR a branch to itself)
    const isDirectCommit = (task.deliveryMethod ?? 'merge-request') === 'direct-commit';
    const shouldCreatePr = !skipPr && !isDirectCommit;

    let prUrl: string | null = null;

    // Create PR/MR if enabled and we have the necessary branch info
    if (shouldCreatePr) {
      // Check for required branch configuration
      if (!task.featureBranch) {
        return NextResponse.json(
          {
            error: 'Missing feature branch',
            message: 'Task has no feature branch configured. Cannot create PR.',
          },
          { status: 400 }
        );
      }

      const targetBranch = resolvePrTargetBranch(task, workspace.targetBranch);
      const prTitle = title || task.title;
      const prDescription = prBody || generateDefaultPrBody(task);

      const provider = detectProviderFromUrl(workspace.repoUrl);
      console.log(
        `[RALPH COMPLETE API] Creating ${provider === 'github' ? 'PR' : 'MR'} for task ${taskId}`
      );
      console.log(`[RALPH COMPLETE API] Source: ${task.featureBranch}, Target: ${targetBranch}`);

      if (provider === 'github') {
        // Extract owner and repo from URL
        const ownerRepo = extractGitHubOwnerRepo(workspace.repoUrl);
        if (!ownerRepo) {
          return NextResponse.json(
            {
              error: 'Failed to parse GitHub repository URL',
              message: `Could not extract owner/repo from URL: ${workspace.repoUrl}`,
            },
            { status: 400 }
          );
        }

        const prResult = await createPullRequest({
          owner: ownerRepo.owner,
          repo: ownerRepo.repo,
          title: prTitle,
          body: prDescription,
          head: task.featureBranch,
          base: targetBranch,
          draft,
        });

        if (!prResult.success) {
          return NextResponse.json(
            {
              error: 'Failed to create pull request',
              message: prResult.error.message,
              provider: 'github',
            },
            { status: 500 }
          );
        }

        prUrl = prResult.data.htmlUrl;
        console.log(`[RALPH COMPLETE API] GitHub PR created: ${prUrl}`);
      } else if (provider === 'gitlab') {
        // Extract project path from URL
        const projectPath = extractProjectIdFromUrl(workspace.repoUrl as GitUrl);
        if (!projectPath) {
          return NextResponse.json(
            {
              error: 'Failed to parse GitLab repository URL',
              message: `Could not extract project path from URL: ${workspace.repoUrl}`,
            },
            { status: 400 }
          );
        }

        const mrResult = await createMergeRequest({
          projectId: projectPath,
          title: prTitle,
          description: prDescription,
          sourceBranch: task.featureBranch,
          targetBranch,
          removeSourceBranch: true,
        });

        if (!mrResult.success) {
          return NextResponse.json(
            {
              error: 'Failed to create merge request',
              message: mrResult.error.message,
              provider: 'gitlab',
            },
            { status: 500 }
          );
        }

        prUrl = mrResult.data.webUrl;
        console.log(`[RALPH COMPLETE API] GitLab MR created: ${prUrl}`);
      } else {
        // Provider is 'other' - skip PR creation with warning
        console.log(
          `[RALPH COMPLETE API] Unknown provider for ${workspace.repoUrl}, skipping PR creation`
        );
      }
    }

    // Update task with PR URL if created
    if (prUrl) {
      const updateResult = await updateRalphTask(taskId, {
        prUrl,
      });

      if (!updateResult.success) {
        console.error(
          `[RALPH COMPLETE API] Failed to update task with PR URL: ${updateResult.error.message}`
        );
        // Continue anyway - PR was created, completion is more important
      }
    }

    // Transition task to complete
    const transitionResult = await transitionRalphTask(
      taskId,
      'complete',
      prUrl ? `PR created: ${prUrl}` : 'Completed without PR'
    );

    if (!transitionResult.success) {
      return NextResponse.json(
        {
          error: 'Failed to transition task',
          message: transitionResult.error.message,
          prUrl,
          warning: prUrl ? 'PR was created but task status was not updated' : undefined,
        },
        { status: 500 }
      );
    }

    console.log(
      `[RALPH COMPLETE API] Task ${taskId} completed${prUrl ? ` with PR: ${prUrl}` : ''}`
    );

    return NextResponse.json({
      task: transitionResult.data,
      prUrl,
      message: prUrl
        ? `Task completed. Pull request created: ${prUrl}`
        : 'Task completed without pull request',
    });
  } catch (error) {
    console.error('[RALPH COMPLETE API] Error:', error);
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
 * GET /api/ralph/tasks/[taskId]/complete
 *
 * Preview what will happen when completing a task.
 * Returns branch and PR information without making any changes.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) return authResult.response!;

    const { taskId } = await params;

    const scopeDeniedCompleteGet = requireStageTokenMatchesRouteTask(authResult.auth!, taskId);
    if (scopeDeniedCompleteGet) return scopeDeniedCompleteGet;

    // Get the task
    const taskResult = await getRalphTask(taskId);
    if (!taskResult.success) {
      if (taskResult.error.message.includes('not found')) {
        return NextResponse.json({ error: taskResult.error.message }, { status: 404 });
      }
      return NextResponse.json({ error: taskResult.error.message }, { status: 500 });
    }

    const task = taskResult.data;

    // Task can be completed from any non-draft, non-complete state
    const canComplete = task.status !== 'complete' && task.status !== 'draft';

    // Load workspace for provider info
    let provider: 'github' | 'gitlab' | 'other' = 'other';
    let workspaceTargetBranch: string | undefined;

    if (task.workspaceId) {
      const workspaceResult = await loadWorkspace(task.workspaceId as WorkspaceId);
      if (workspaceResult.success) {
        provider = detectProviderFromUrl(workspaceResult.data.repoUrl);
        workspaceTargetBranch = workspaceResult.data.targetBranch;
      }
    }

    const targetBranch = resolvePrTargetBranch(task, workspaceTargetBranch);
    const isDirectCommit = (task.deliveryMethod ?? 'merge-request') === 'direct-commit';

    // Check if PR can be created (direct-commit tasks can't create PRs)
    const canCreatePr =
      canComplete && !isDirectCommit && !!task.featureBranch && provider !== 'other';

    return NextResponse.json({
      taskId,
      currentStatus: task.status,
      canComplete,
      canCreatePr,
      deliveryMethod: task.deliveryMethod ?? 'merge-request',
      prInfo: {
        provider,
        sourceBranch: task.featureBranch || null,
        targetBranch,
        defaultTitle: task.title,
        defaultBody: generateDefaultPrBody(task),
      },
      message: getCompleteStatusMessage(
        canComplete,
        isDirectCommit,
        canCreatePr,
        provider,
        task,
        targetBranch
      ),
    });
  } catch (error) {
    console.error('[RALPH COMPLETE API] Error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
