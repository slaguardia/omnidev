import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DEFAULT_WORKFLOW_DEFINITION } from '@/lib/workflow/definition';
import type { WorkflowDefinition, WorkflowStageDefinition } from '@/lib/types/index';

/**
 * Hook to access the workflow definition from the API.
 * Derives helper functions for stage lookup, status lists, and edit mode checks.
 */
export function useWorkflowDefinition() {
  const { data: fetchedDefinition } = useQuery({
    queryKey: ['workflow-definition'],
    queryFn: async () => {
      const res = await fetch('/api/workflow/definition');
      if (!res.ok) throw new Error('Failed to load workflow definition');
      const json = (await res.json()) as { definition: WorkflowDefinition };
      return json.definition;
    },
    staleTime: 60_000,
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
