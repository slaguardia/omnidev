import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import {
  getFeatureExecutionStatus,
  updateRalphTask,
  type RalphTask,
  type PlanningQuestion,
  type FeatureExecutionStatus,
} from '@/lib/managers/ralph-task-manager';
import { dbGetBoardTasks, dbGetChildCount, dbGetTaskStatus } from '@/lib/managers/ralph-task-db';
import { getWorkspaceReadonly } from '@/lib/managers/workspace-manager';
import { getProjectDisplayName } from '@/lib/dashboard/helpers';
import { dbGetJob } from '@/lib/managers/ralph-task-db';
import type { WorkspaceId } from '@/lib/types';

/**
 * Execution job info for tasks in executing state
 */
interface ExecutionJobInfo {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

/**
 * Response type for the Ralph tasks list API
 */
interface RalphTaskResponse {
  id: string;
  title: string;
  workspaceId: string;
  workspaceName: string;
  status: string;
  isSubtask: boolean;
  description: string | null;
  filePaths: string[];
  featureBranch: string | null;
  updatedAt: string;
  pendingQuestionsCount: number;
  pendingQuestions: PlanningQuestion[];
  // Execution-related fields (for executing tasks)
  executionJobId: string | null;
  executionJobInfo: ExecutionJobInfo | null;
  executionError: string | null;
  // Completion-related fields (for complete tasks)
  prUrl: string | null;
  completedAt: string | null;
  isArchived: boolean;
  // Summary stats for completed tasks
  totalIterations: number;
  // Story-related fields
  hasGeneratedStories: boolean;
  generatedStoriesCount: number;
  childCount: number;
  // Hierarchy fields for nested display
  parentId: string | null;
  subtaskOrder: number | null;
  childIds: string[];
  // Dependency fields for blocking/blocked-by relationships
  blockedBy: string[];
  isBlocked: boolean;
  // Delivery method
  deliveryMethod: 'merge-request' | 'direct-commit';
  // Sequential task number (RLP-N)
  taskNumber: number | null;
  // Project ID
  projectId: string | null;
  // Playbook ID
  playbookId: string | null;
  // Execution status (for parent tasks with children)
  executionStatus: FeatureExecutionStatus | null;
  // Generic stage outputs (iterations, activeJobId, etc.)
  stageOutputs: RalphTask['stageOutputs'];
  // Branch configuration
  baseBranch: string | null;
  prTargetBranch: string | null;
  // Git provider derived from workspace repo URL
  gitProvider: 'github' | 'gitlab' | 'other';
  // Timestamps
  createdAt: string;
}

/**
 * Enrich full task objects with workspace names and job/feature status.
 * Now receives full RalphTask objects from SQLite (no N+1 file reads).
 */
async function enrichTasks(tasks: RalphTask[]): Promise<RalphTaskResponse[]> {
  // 1. Pre-resolve unique workspace names in parallel
  const uniqueWorkspaceIds = Array.from(new Set(tasks.map((t) => t.workspaceId)));
  const workspaceResults = await Promise.all(
    uniqueWorkspaceIds.map((wsId) => getWorkspaceReadonly(wsId as WorkspaceId))
  );
  const workspaceNameCache: Record<string, string> = {};
  const workspaceProviderCache: Record<string, 'github' | 'gitlab' | 'other'> = {};
  uniqueWorkspaceIds.forEach((wsId, i) => {
    const wsResult = workspaceResults[i];
    const repoUrl = wsResult && wsResult.success ? String(wsResult.data.repoUrl || '') : '';
    workspaceNameCache[wsId] = repoUrl ? getProjectDisplayName(repoUrl) : wsId;
    workspaceProviderCache[wsId] = repoUrl.includes('github')
      ? 'github'
      : repoUrl.includes('gitlab')
        ? 'gitlab'
        : 'other';
  });

  // 2. Load execution job info and feature statuses in parallel
  const jobPromises = tasks.map((task) => {
    // Check executionJobId first, then fall back to stageOutputs[currentStage].activeJobId
    const jobId =
      task.executionJobId ||
      (task.status !== 'draft' &&
        task.status !== 'complete' &&
        task.stageOutputs?.[task.status]?.activeJobId) ||
      null;
    if (jobId) {
      return Promise.resolve(dbGetJob(jobId));
    }
    return Promise.resolve(null);
  });
  const featureStatusPromises = tasks.map((task) => {
    const childCount = dbGetChildCount(task.id);
    if (childCount > 0) {
      return getFeatureExecutionStatus(task.id);
    }
    return Promise.resolve(null);
  });
  const [jobResults, featureStatusResults] = await Promise.all([
    Promise.all(jobPromises),
    Promise.all(featureStatusPromises),
  ]);

  // 2b. Self-healing: clear stale activeJobId in ANY stage output where the job
  // is done or missing. Also detect orphaned 'executing' status (no active job
  // anywhere, no executionJobId) and surface an error so the UI doesn't show
  // an infinite spinner.
  const staleCleanups: Promise<unknown>[] = [];
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i]!;
    if (!task.stageOutputs) continue;

    let taskPatched = false;
    const patchedOutputs = { ...task.stageOutputs };

    for (const [stageName, stageOutput] of Object.entries(patchedOutputs)) {
      if (!stageOutput.activeJobId) continue;

      // Look up the job by activeJobId
      const job = dbGetJob(stageOutput.activeJobId);
      const jobGone = !job;
      const jobDone = job && (job.status === 'completed' || job.status === 'failed');

      if (jobGone || jobDone) {
        const isFailed = jobGone || job?.status === 'failed';
        const errorMsg = job?.error ?? (jobGone ? 'Job no longer exists' : null);

        patchedOutputs[stageName] = {
          ...stageOutput,
          activeJobId: undefined,
          autoLoopActive: false,
          completionReason: stageOutput.completionReason ?? (isFailed ? 'error' : undefined),
          lastUpdated: new Date().toISOString(),
        };
        if (isFailed && !task.executionError) {
          task.executionError = errorMsg ?? 'Job failed';
        }
        taskPatched = true;
      }
    }

    // Orphan detection: task is in 'executing' with no active job anywhere
    if (!taskPatched && task.status === 'executing' && !task.executionJobId) {
      const hasAnyActiveJob = Object.values(patchedOutputs).some((so) => so.activeJobId);
      if (!hasAnyActiveJob && !task.executionError) {
        task.executionError = 'Execution ended without result';
        taskPatched = true;
      }
    }

    if (taskPatched) {
      task.stageOutputs = patchedOutputs;
      staleCleanups.push(
        updateRalphTask(task.id, {
          executionError: task.executionError,
          stageOutputs: patchedOutputs,
        }).catch((err) => console.error('[RALPH TASKS API] Failed to clear stale job state:', err))
      );
    }
  }
  // Fire-and-forget DB writes — response is already corrected in-memory
  if (staleCleanups.length > 0) {
    Promise.all(staleCleanups).catch(() => {});
  }

  // 3. Build enriched response objects
  const enrichedTasks: RalphTaskResponse[] = tasks.map((task, i) => {
    const workspaceName = workspaceNameCache[task.workspaceId] ?? task.workspaceId;

    // Aggregate pending questions from stageOutputs (fallback to legacy planningState)
    const allPendingQuestions: PlanningQuestion[] = [];
    if (task.stageOutputs) {
      for (const stageOutput of Object.values(task.stageOutputs)) {
        if (stageOutput.pendingQuestions) {
          for (const sq of stageOutput.pendingQuestions) {
            if (!allPendingQuestions.some((q) => q.id === sq.id)) {
              allPendingQuestions.push(sq as PlanningQuestion);
            }
          }
        }
      }
    }
    // Fallback: legacy planningState questions (for old tasks)
    if (allPendingQuestions.length === 0 && task.planningState?.pendingQuestions) {
      for (const lq of task.planningState.pendingQuestions) {
        allPendingQuestions.push(lq as PlanningQuestion);
      }
    }
    const unansweredQuestions: PlanningQuestion[] = allPendingQuestions
      .filter((q) => !q.answer)
      .map((q) => {
        const mapped: PlanningQuestion = {
          id: q.id,
          question: q.question,
        };
        if (q.context) mapped.context = q.context;
        if (q.options) mapped.options = q.options;
        if (q.answer) mapped.answer = q.answer;
        if (q.answeredAt) mapped.answeredAt = q.answeredAt;
        return mapped;
      });

    // Build execution job info
    let executionJobInfo: ExecutionJobInfo | null = null;
    const executionJobId = task.executionJobId ?? null;
    const job = jobResults[i];
    if (job) {
      executionJobInfo = {
        id: job.id,
        status: job.status as ExecutionJobInfo['status'],
        createdAt: job.created_at,
      };
      if (job.started_at) executionJobInfo.startedAt = job.started_at;
      // Use updated_at as completedAt when job is done
      if (job.status === 'completed' || job.status === 'failed') {
        executionJobInfo.completedAt = job.updated_at;
      }
      if (job.error) executionJobInfo.error = job.error;
    }

    // Get generated stories info
    const generatedStories = task.planningState?.generatedStories ?? [];

    // Get execution status for parent tasks
    const featureResult = featureStatusResults[i];
    const executionStatus: FeatureExecutionStatus | null =
      featureResult && 'success' in featureResult && featureResult.success
        ? featureResult.data
        : null;

    return {
      id: task.id,
      title: task.title,
      workspaceId: task.workspaceId,
      workspaceName,
      status: task.status,
      isSubtask: task.parentId != null,
      description: task.description ?? null,
      filePaths: task.filePaths ?? [],
      featureBranch: task.featureBranch ?? null,
      updatedAt: task.updatedAt,
      pendingQuestionsCount: unansweredQuestions.length,
      pendingQuestions: unansweredQuestions,
      executionJobId,
      executionJobInfo,
      executionError: task.executionError ?? null,
      prUrl: task.prUrl ?? null,
      completedAt: task.completedAt ?? null,
      isArchived: task.isArchived ?? false,
      totalIterations: task.stageOutputs
        ? Object.values(task.stageOutputs).reduce((sum, so) => sum + so.iterations.length, 0)
        : (task.planningState?.currentIteration ?? 0),
      hasGeneratedStories: generatedStories.length > 0,
      generatedStoriesCount: generatedStories.length,
      childCount: task.childIds.length,
      parentId: task.parentId ?? null,
      subtaskOrder: task.subtaskOrder ?? null,
      childIds: task.childIds ?? [],
      blockedBy: task.blockedBy ?? [],
      isBlocked: false, // Placeholder - computed below
      deliveryMethod: (task.deliveryMethod ?? 'merge-request') as 'merge-request' | 'direct-commit',
      taskNumber: task.taskNumber ?? null,
      projectId: task.projectId ?? null,
      playbookId: task.playbookId ?? null,
      executionStatus,
      stageOutputs: task.stageOutputs ?? {},
      baseBranch: task.baseBranch ?? null,
      prTargetBranch: task.prTargetBranch ?? null,
      gitProvider: workspaceProviderCache[task.workspaceId] ?? 'other',
      createdAt: task.createdAt,
    };
  });

  // 4. Compute isBlocked for each task
  const taskStatusMap = new Map<string, string>();
  for (const task of enrichedTasks) {
    taskStatusMap.set(task.id, task.status);
  }

  // Resolve unknown blocker statuses from database (synchronous, fast)
  for (const task of enrichedTasks) {
    for (const blockerId of task.blockedBy) {
      if (!taskStatusMap.has(blockerId)) {
        const status = dbGetTaskStatus(blockerId);
        if (status) {
          taskStatusMap.set(blockerId, status);
        }
      }
    }
  }

  for (const task of enrichedTasks) {
    if (task.blockedBy.length > 0) {
      task.isBlocked = task.blockedBy.some((blockerId) => {
        const blockerStatus = taskStatusMap.get(blockerId);
        return blockerStatus !== 'complete';
      });
    }
  }

  return enrichedTasks;
}

/**
 * GET /api/ralph/tasks
 *
 * List all Ralph tasks with enriched data for the Ralph Board.
 * Returns tasks sorted by updatedAt (most recent first).
 *
 * Query params:
 * - status: filter by task status (optional)
 * - workspaceId: filter by workspace (optional)
 * - includeArchived: include archived tasks (default: false)
 * - archivedOnly: show only archived tasks (default: false)
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) return authResult.response!;

    const url = new URL(request.url);
    const statusFilter = url.searchParams.get('status');
    const workspaceIdFilter = url.searchParams.get('workspaceId');
    const includeArchived = url.searchParams.get('includeArchived') === 'true';
    const archivedOnly = url.searchParams.get('archivedOnly') === 'true';

    // Single SQL query returns all tasks (full objects, sorted)
    let tasks = dbGetBoardTasks({ includeArchived, archivedOnly });

    // Apply in-memory filters (status and workspace are rarely used)
    if (statusFilter) {
      tasks = tasks.filter((task) => task.status === statusFilter);
    }
    if (workspaceIdFilter) {
      tasks = tasks.filter((task) => task.workspaceId === workspaceIdFilter);
    }

    // Enrich with workspace names, job info, feature status
    const enrichedTasks = await enrichTasks(tasks);

    return NextResponse.json({
      tasks: enrichedTasks,
      meta: {
        total: enrichedTasks.length,
        statusFilter: statusFilter ?? null,
        workspaceIdFilter: workspaceIdFilter ?? null,
        includeArchived,
        archivedOnly,
      },
    });
  } catch (error) {
    console.error('[RALPH TASKS API] Error listing tasks:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
