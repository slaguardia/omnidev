import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { RalphPlaybook } from '@/components/dashboard/tabs/ralph/types';

const QUERY_KEY = ['ralph-playbooks'];

async function fetchPlaybooks(): Promise<RalphPlaybook[]> {
  const response = await fetch('/api/ralph/playbooks');
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }
  const data = await response.json();
  return data.playbooks || [];
}

export function useRalphPlaybooks() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchPlaybooks,
    staleTime: 60_000,
  });
}

export function useCreateRalphPlaybook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      description?: string;
      stageIds: string[];
      isDefault?: boolean;
    }) => {
      const response = await fetch('/api/ralph/playbooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      const data = await response.json();
      return data.playbook as RalphPlaybook;
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<RalphPlaybook[]>(QUERY_KEY);

      const optimistic: RalphPlaybook = {
        id: `optimistic-${Date.now()}`,
        name: input.name,
        description: input.description ?? '',
        stageIds: input.stageIds,
        isDefault: input.isDefault ?? false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      queryClient.setQueryData<RalphPlaybook[]>(QUERY_KEY, (old) => [...(old || []), optimistic]);

      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEY, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

export function useUpdateRalphPlaybook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: {
      id: string;
      name?: string;
      description?: string;
      stageIds?: string[];
      isDefault?: boolean;
    }) => {
      const response = await fetch(`/api/ralph/playbooks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      const data = await response.json();
      return data.playbook as RalphPlaybook;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

export function useDeleteRalphPlaybook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (playbookId: string) => {
      const response = await fetch(`/api/ralph/playbooks/${playbookId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
    },
    onMutate: async (playbookId) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<RalphPlaybook[]>(QUERY_KEY);

      queryClient.setQueryData<RalphPlaybook[]>(QUERY_KEY, (old) =>
        (old || []).filter((p) => p.id !== playbookId)
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
      queryClient.invalidateQueries({ queryKey: ['ralph-tasks'] });
    },
  });
}
