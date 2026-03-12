import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { RalphTaskData, RalphTaskDetail } from '@/components/dashboard/tabs/ralph/types';

async function fetchRalphTaskDetail(taskId: string): Promise<RalphTaskDetail> {
  const response = await fetch(`/api/ralph/tasks/${taskId}`);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }
  const data = await response.json();
  return data.task;
}

/**
 * Convert list-level task data into a partial detail object.
 * Missing detail-only fields get sensible defaults so the UI
 * can render immediately while the full fetch completes.
 */
function listDataToPlaceholder(t: RalphTaskData): RalphTaskDetail {
  return {
    id: t.id,
    title: t.title,
    workspaceId: t.workspaceId,
    workspaceName: t.workspaceName,
    status: t.status,
    description: t.description,
    instructions: null,
    filePaths: t.filePaths,
    baseBranch: t.baseBranch ?? null,
    featureBranch: t.featureBranch,
    prTargetBranch: t.prTargetBranch ?? null,
    parentId: t.parentId,
    parentTitle: null,
    childIds: t.childIds,
    childTasks: [],
    blockedBy: t.blockedBy,
    executionJobId: t.executionJobId,
    executionJobInfo: t.executionJobInfo,
    executionError: t.executionError,
    prUrl: t.prUrl,
    completedAt: t.completedAt,
    isArchived: t.isArchived,
    totalIterations: t.totalIterations,
    stageOutputs: t.stageOutputs ?? {},
    deliveryMethod: t.deliveryMethod ?? 'merge-request',
    taskNumber: t.taskNumber ?? null,
    projectId: t.projectId ?? null,
    playbookId: t.playbookId ?? null,
    gitProvider: t.gitProvider ?? 'other',
    createdAt: t.createdAt ?? t.updatedAt,
    updatedAt: t.updatedAt,
  };
}

export function useRalphTaskDetail(taskId: string) {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ['ralph-task-detail', taskId],
    queryFn: () => fetchRalphTaskDetail(taskId),
    staleTime: 10_000,
    // Show list data instantly while the detail fetch runs in the background
    placeholderData: () => {
      // Search both archived and non-archived list caches
      for (const archived of [false, true]) {
        const listData = queryClient.getQueryData<RalphTaskData[]>(['ralph-tasks', { archived }]);
        const match = listData?.find((t) => t.id === taskId);
        if (match) return listDataToPlaceholder(match);
      }
      return undefined;
    },
    refetchInterval: (query) => {
      const task = query.state.data;
      if (!task) return false;
      // System statuses don't need polling
      if (task.status === 'draft' || task.status === 'complete') return false;
      // Poll if the current stage has an active job or zero iterations
      const currentStageOutput = task.stageOutputs?.[task.status];
      if (currentStageOutput?.activeJobId) return 5000;
      if (currentStageOutput && currentStageOutput.iterations.length === 0) return 5000;
      return false;
    },
  });
}

/**
 * Returns a function that writes a task directly into the detail cache,
 * avoiding a refetch when the PATCH response already contains the updated task.
 */
export function useSetRalphTaskDetailCache() {
  const queryClient = useQueryClient();
  return (taskId: string, task: RalphTaskDetail) => {
    queryClient.setQueryData(['ralph-task-detail', taskId], task);
  };
}
