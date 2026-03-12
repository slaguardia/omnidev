import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RalphTaskData } from '@/components/dashboard/tabs/ralph/types';

interface CreateTaskInput {
  title: string;
  workspaceId: string;
  description: string;
  filePaths: string[];
  baseBranch: string | null;
  featureBranch: string | null;
  prTargetBranch: string | null;
  deliveryMethod: 'merge-request' | 'direct-commit';
  parentId: string | null;
  projectId?: string | null;
  playbookId?: string | null;
  autoRun?: boolean;
  /** Client-only field — workspace name for optimistic UI. Not sent to API. */
  _workspaceName: string;
}

export function useCreateRalphTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateTaskInput) => {
      // Strip client-only field before sending to API
      const { _workspaceName: _, ...apiInput } = input;
      const response = await fetch('/api/ralph/tasks/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiInput),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to create task');
      }
      return response.json();
    },
    onSuccess: (data, variables) => {
      // Replace placeholder with real task data immediately
      const serverTask = data.task;
      if (serverTask) {
        const listKey = ['ralph-tasks', { archived: false }];
        queryClient.setQueryData(listKey, (old: RalphTaskData[] | undefined) => {
          const tasks = old || [];
          // Build optimistic entry from server response + input context
          const realTask: RalphTaskData = {
            id: serverTask.id,
            title: serverTask.title ?? variables.title,
            workspaceId: serverTask.workspaceId ?? variables.workspaceId,
            workspaceName: variables._workspaceName,
            status: serverTask.status ?? 'draft',
            taskType: serverTask.taskType ?? 'simple',
            isSubtask: !!variables.parentId,
            description: serverTask.description ?? variables.description,
            filePaths: serverTask.filePaths ?? variables.filePaths ?? [],
            featureBranch: serverTask.featureBranch ?? variables.featureBranch ?? null,
            updatedAt: serverTask.updatedAt ?? new Date().toISOString(),
            pendingQuestionsCount: 0,
            pendingQuestions: [],
            executionJobId: null,
            executionJobInfo: null,
            executionError: null,
            prUrl: null,
            completedAt: null,
            isArchived: false,
            totalIterations: 0,
            hasGeneratedStories: false,
            generatedStoriesCount: 0,
            childCount: 0,
            parentId: serverTask.parentId ?? variables.parentId ?? null,
            storyOrder: null,
            subtaskOrder: null,
            childIds: [],
            blockedBy: [],
            isBlocked: false,
            deliveryMethod: serverTask.deliveryMethod ?? variables.deliveryMethod,
            taskNumber: serverTask.taskNumber ?? null,
            projectId: serverTask.projectId ?? variables.projectId ?? null,
            playbookId: serverTask.playbookId ?? variables.playbookId ?? null,
          };
          // Replace placeholder if present, otherwise prepend
          const hasPlaceholder = tasks.some((t) => t.id === 'placeholder-new-task');
          if (hasPlaceholder) {
            return tasks.map((t) => (t.id === 'placeholder-new-task' ? realTask : t));
          }
          return [realTask, ...tasks];
        });
      }

      // Background refetch to get full server-enriched data (gitProvider, stageOutputs, etc.)
      queryClient.invalidateQueries({ queryKey: ['ralph-tasks'] });
      if (variables.parentId) {
        queryClient.invalidateQueries({
          queryKey: ['ralph-task-detail', variables.parentId],
        });
      }
    },
    onError: () => {
      // Remove placeholder on failure
      const listKey = ['ralph-tasks', { archived: false }];
      queryClient.setQueryData(listKey, (old: RalphTaskData[] | undefined) =>
        (old || []).filter((t) => t.id !== 'placeholder-new-task')
      );
    },
  });
}
