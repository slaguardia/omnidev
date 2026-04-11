import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import type { RalphTaskData } from '@/components/dashboard/tabs/ralph/types';
import { invalidateRalphBoardData } from '@/hooks/queries/useRalphBoardInvalidation';
import { ralphBoardListQueryDefaults } from '@/hooks/queries/useRalphBoardQueryDefaults';
import { debugRalphFetchAsync } from '@/lib/debug/ralph-fetch-debug';

interface UseRalphTasksOptions {
  archived?: boolean;
  /** When false, query does not run (e.g. CommandPalette closed — avoids duplicating bootstrap fetches) */
  enabled?: boolean;
}

async function fetchRalphTasks(archived: boolean): Promise<RalphTaskData[]> {
  return debugRalphFetchAsync(
    'ralph-tasks',
    `GET /api/ralph/tasks archivedOnly=${archived}`,
    async () => {
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
  );
}

export function useRalphTasks({ archived = false, enabled = true }: UseRalphTasksOptions = {}) {
  return useQuery({
    queryKey: ['ralph-tasks', { archived }],
    queryFn: () => fetchRalphTasks(archived),
    placeholderData: keepPreviousData,
    ...ralphBoardListQueryDefaults,
    enabled,
  });
}

export function useInvalidateRalphTasks(): () => void {
  const queryClient = useQueryClient();
  return () => invalidateRalphBoardData(queryClient);
}
