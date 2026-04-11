import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
  type QueryClient,
} from '@tanstack/react-query';
import type { RalphProject } from '@/components/dashboard/tabs/ralph/types';
import { invalidateRalphBoardData } from '@/hooks/queries/useRalphBoardInvalidation';
import { ralphBoardListQueryDefaults } from '@/hooks/queries/useRalphBoardQueryDefaults';
import { debugRalphFetchAsync } from '@/lib/debug/ralph-fetch-debug';

const QUERY_KEY = ['ralph-projects'];

async function fetchProjects(): Promise<RalphProject[]> {
  return debugRalphFetchAsync('ralph-projects', 'GET /api/ralph/projects', async () => {
    const response = await fetch('/api/ralph/projects');
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }
    const data = await response.json();
    return data.projects || [];
  });
}

export function prefetchRalphProjects(queryClient: QueryClient) {
  return queryClient.prefetchQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchProjects,
    ...ralphBoardListQueryDefaults,
  });
}

export function useRalphProjects(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchProjects,
    placeholderData: keepPreviousData,
    ...ralphBoardListQueryDefaults,
    enabled,
  });
}

export function useCreateRalphProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; color?: string }) => {
      const response = await fetch('/api/ralph/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      const data = await response.json();
      return data.project as RalphProject;
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<RalphProject[]>(QUERY_KEY);

      const optimistic: RalphProject = {
        id: `optimistic-${Date.now()}`,
        name: input.name,
        color: input.color ?? '#6366f1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      queryClient.setQueryData<RalphProject[]>(QUERY_KEY, (old) => [...(old || []), optimistic]);

      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEY, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      invalidateRalphBoardData(queryClient);
    },
  });
}

export function useDeleteRalphProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (projectId: string) => {
      const response = await fetch(`/api/ralph/projects/${projectId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
    },
    onMutate: async (projectId) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<RalphProject[]>(QUERY_KEY);

      queryClient.setQueryData<RalphProject[]>(QUERY_KEY, (old) =>
        (old || []).filter((p) => p.id !== projectId)
      );

      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEY, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      invalidateRalphBoardData(queryClient);
    },
  });
}
