import { useQueryClient } from '@tanstack/react-query';

export { useInvalidateRalphTasks } from './useRalphTasks';

/**
 * Invalidates both workspace caches: ['workspaces'] and ['ralph-workspaces'].
 * Use this whenever a workspace is created, deleted, or modified.
 */
export function useInvalidateWorkspaces(): () => void {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    queryClient.invalidateQueries({ queryKey: ['ralph-workspaces'] });
  };
}

/**
 * Invalidates the task detail cache for a specific task.
 * Use after mutations that change a single task's data.
 */
export function useInvalidateRalphTaskDetail(): (taskId: string) => void {
  const queryClient = useQueryClient();
  return (taskId: string) => {
    queryClient.invalidateQueries({ queryKey: ['ralph-task-detail', taskId] });
  };
}
