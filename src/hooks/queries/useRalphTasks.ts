import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import type { RalphTaskData } from '@/components/dashboard/tabs/ralph/types';

interface UseRalphTasksOptions {
  archived?: boolean;
}

async function fetchRalphTasks(archived: boolean): Promise<RalphTaskData[]> {
  const params = new URLSearchParams();
  if (archived) {
    params.set('archivedOnly', 'true');
  }
  const response = await fetch(`/api/ralph/tasks?${params.toString()}`);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }
  const data = await response.json();
  return data.tasks || [];
}

export function useRalphTasks({ archived = false }: UseRalphTasksOptions = {}) {
  return useQuery({
    queryKey: ['ralph-tasks', { archived }],
    queryFn: () => fetchRalphTasks(archived),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
}

export function useInvalidateRalphTasks(): () => void {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['ralph-tasks'] });
}
