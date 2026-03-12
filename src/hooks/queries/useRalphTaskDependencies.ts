import { useQuery } from '@tanstack/react-query';
import type { DependencyInfo } from '@/components/dashboard/tabs/ralph/types';

async function fetchRalphTaskDependencies(taskId: string): Promise<DependencyInfo> {
  const response = await fetch(`/api/ralph/tasks/${taskId}/dependencies`);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }
  return response.json();
}

export function useRalphTaskDependencies(taskId: string) {
  return useQuery({
    queryKey: ['ralph-task-dependencies', taskId],
    queryFn: () => fetchRalphTaskDependencies(taskId),
    staleTime: 10_000,
  });
}
