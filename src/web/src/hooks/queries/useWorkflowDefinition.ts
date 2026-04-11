import { useMemo } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import { DEFAULT_WORKFLOW_DEFINITION } from '@/lib/workflow/definition';
import { debugRalphFetchAsync } from '@/lib/debug/ralph-fetch-debug';
import { ralphBoardListQueryDefaults } from '@/hooks/queries/useRalphBoardQueryDefaults';
import type { WorkflowDefinition, WorkflowStageDefinition } from '@/lib/types/index';

const WORKFLOW_QUERY_KEY = ['workflow-definition'] as const;

export async function fetchWorkflowDefinition(): Promise<WorkflowDefinition> {
  return debugRalphFetchAsync('workflow-definition', 'GET /api/workflow/definition', async () => {
    const res = await fetch('/api/workflow/definition');
    if (!res.ok) throw new Error('Failed to load workflow definition');
    const json = (await res.json()) as { definition: WorkflowDefinition };
    return json.definition;
  });
}

export function prefetchWorkflowDefinition(queryClient: QueryClient) {
  return queryClient.prefetchQuery({
    queryKey: WORKFLOW_QUERY_KEY,
    queryFn: fetchWorkflowDefinition,
    ...ralphBoardListQueryDefaults,
  });
}

/**
 * Hook to access the workflow definition from the API.
 * Derives helper functions for stage lookup, status lists, and edit mode checks.
 * Pass `enabled: false` when the caller supplies definition (e.g. Ralph board bootstrap).
 */
export function useWorkflowDefinition(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const { data: fetchedDefinition } = useQuery({
    queryKey: WORKFLOW_QUERY_KEY,
    queryFn: fetchWorkflowDefinition,
    ...ralphBoardListQueryDefaults,
    enabled,
  });

  const definition: WorkflowDefinition = fetchedDefinition ?? DEFAULT_WORKFLOW_DEFINITION;

  const stageList: string[] = useMemo(() => {
    return ['draft', ...definition.stages.map((s) => s.id), 'complete'];
  }, [definition.stages]);

  const getStageDefinition = useMemo(() => {
    return (id: string): WorkflowStageDefinition | undefined => {
      return definition.stages.find((s) => s.id === id);
    };
  }, [definition.stages]);

  const isEditStage = useMemo(() => {
    return (id: string): boolean => {
      const stage = definition.stages.find((s) => s.id === id);
      return stage?.executionMode === 'edit';
    };
  }, [definition.stages]);

  function isSystemStatus(status: string): boolean {
    return status === 'draft' || status === 'complete';
  }

  return {
    definition,
    stageList,
    getStageDefinition,
    isEditStage,
    isSystemStatus,
  };
}
