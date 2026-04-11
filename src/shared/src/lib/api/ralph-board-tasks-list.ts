import {
  getFeatureExecutionStatus,
  updateRalphTask,
  type RalphTask,
  type PlanningQuestion,
  type FeatureExecutionStatus,
} from '@/lib/managers/ralph-task-manager';
import {
  dbGetBoardTasks,
  dbGetChildCount,
  dbGetTaskStatus,
  dbGetJob,
} from '@/lib/managers/ralph-task-db';
import { getWorkspaceReadonly } from '@/lib/managers/workspace-manager';
import { getProjectDisplayName } from '@/lib/dashboard/helpers';
import type { WorkspaceId } from '@/lib/types';

/**
 * Execution job info for tasks in executing state
 */
export interface ExecutionJobInfo {
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
export interface RalphTaskResponse {
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
  executionJobId: string | null;
  executionJobInfo: ExecutionJobInfo | null;
  executionError: string | null;
  prUrl: string | null;
  completedAt: string | null;
  isArchived: boolean;
  totalIterations: number;
  hasGeneratedStories: boolean;
  generatedStoriesCount: number;
  childCount: number;
  parentId: string | null;
  subtaskOrder: number | null;
  childIds: string[];
  blockedBy: string[];
  isBlocked: boolean;
  deliveryMethod: 'merge-request' | 'direct-commit';
  taskNumber: number | null;
  projectId: string | null;
  playbookId: string | null;
  executionStatus: FeatureExecutionStatus | null;
  stageOutputs: RalphTask['stageOutputs'];
  baseBranch: string | null;
  prTargetBranch: string | null;
  gitProvider: 'github' | 'gitlab' | 'other';
  createdAt: string;
}

export interface BoardTasksListMeta {
  total: number;
  statusFilter: string | null;
  workspaceIdFilter: string | null;
  includeArchived: boolean;
  archivedOnly: boolean;
}

/**
 * Enrich full task objects with workspace names and job/feature status.
 */
async function enrichTasks(tasks: RalphTask[]): Promise<RalphTaskResponse[]> {
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

  const jobPromises = tasks.map((task) => {
    const jobId =
      task.executionJobId ||
      (task.status !== 'draft' &&
        task.status !== 'complete' &&
        task.stageOutputs?.[task.status]?.activeJobId) ||
      null;
    if (jobId) {
      return dbGetJob(jobId);
    }
    return Promise.resolve(null);
  });
  const featureStatusPromises = tasks.map(async (task) => {
    const childCount = await dbGetChildCount(task.id);
    if (childCount > 0) {
      return getFeatureExecutionStatus(task.id);
    }
    return Promise.resolve(null);
  });
  const [jobResults, featureStatusResults] = await Promise.all([
    Promise.all(jobPromises),
    Promise.all(featureStatusPromises),
  ]);

  const staleCleanups: Promise<unknown>[] = [];
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i]!;
    if (!task.stageOutputs) continue;

    let taskPatched = false;
    const patchedOutputs = { ...task.stageOutputs };

    for (const [stageName, stageOutput] of Object.entries(patchedOutputs)) {
      if (!stageOutput.activeJobId) continue;

      const job = await dbGetJob(stageOutput.activeJobId);
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

    if (!taskPatched && task.status === 'executing' && !task.executionJobId) {
      const hasAnyActiveJob = Object.values(patchedOutputs).some((so) => so.activeJobId);
      const executingStage = patchedOutputs['executing'];
      const executingStageRan =
        executingStage && (executingStage.iterations.length > 0 || executingStage.completionReason);
      if (!hasAnyActiveJob && executingStageRan && !task.executionError) {
        task.executionError = 'Execution ended without result';
        taskPatched = true;
      }
      if (!hasAnyActiveJob && !executingStageRan && task.executionError) {
        task.executionError = null;
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
  if (staleCleanups.length > 0) {
    Promise.all(staleCleanups).catch(() => {});
  }

  const enrichedTasks: RalphTaskResponse[] = tasks.map((task, i) => {
    const workspaceName = workspaceNameCache[task.workspaceId] ?? task.workspaceId;

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
      if (job.status === 'completed' || job.status === 'failed') {
        executionJobInfo.completedAt = job.updated_at;
      }
      if (job.error) executionJobInfo.error = job.error;
    }

    const generatedStories = task.planningState?.generatedStories ?? [];

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
      isBlocked: false,
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

  const taskStatusMap = new Map<string, string>();
  for (const task of enrichedTasks) {
    taskStatusMap.set(task.id, task.status);
  }

  for (const task of enrichedTasks) {
    for (const blockerId of task.blockedBy) {
      if (!taskStatusMap.has(blockerId)) {
        const status = await dbGetTaskStatus(blockerId);
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
 * List tasks for the Ralph board / GET /api/ralph/tasks with the same filters as the route handler.
 */
export async function getEnrichedBoardTasksForApi(params: {
  url: URL;
  /** When set (stage token), only this task id is visible */
  stageTokenTaskId?: string | null;
}): Promise<{ tasks: RalphTaskResponse[]; meta: BoardTasksListMeta }> {
  const { url, stageTokenTaskId } = params;
  const statusFilter = url.searchParams.get('status');
  const workspaceIdFilter = url.searchParams.get('workspaceId');
  const taskNumberFilter = url.searchParams.get('taskNumber');
  const includeArchived = url.searchParams.get('includeArchived') === 'true';
  const archivedOnly = url.searchParams.get('archivedOnly') === 'true';

  let tasks = await dbGetBoardTasks({
    includeArchived: includeArchived || !!taskNumberFilter,
    archivedOnly,
  });

  if (stageTokenTaskId) {
    tasks = tasks.filter((t) => t.id === stageTokenTaskId);
  }

  if (statusFilter) {
    tasks = tasks.filter((task) => task.status === statusFilter);
  }
  if (workspaceIdFilter) {
    tasks = tasks.filter((task) => task.workspaceId === workspaceIdFilter);
  }
  if (taskNumberFilter) {
    const num = parseInt(taskNumberFilter, 10);
    if (!isNaN(num)) {
      tasks = tasks.filter((task) => task.taskNumber === num);
    }
  }

  const enrichedTasks = await enrichTasks(tasks);

  return {
    tasks: enrichedTasks,
    meta: {
      total: enrichedTasks.length,
      statusFilter: statusFilter ?? null,
      workspaceIdFilter: workspaceIdFilter ?? null,
      includeArchived,
      archivedOnly,
    },
  };
}
