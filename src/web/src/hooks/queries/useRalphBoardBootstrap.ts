import { useCallback } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { WorkflowDefinition } from '@/lib/types/index';
import type { RalphProject, RalphPlaybook } from '@/components/dashboard/tabs/ralph/types';
import type { RalphTaskData } from '@/components/dashboard/tabs/ralph/types';
import { debugRalphFetchAsync } from '@/lib/debug/ralph-fetch-debug';
import { ralphBoardBootstrapQueryDefaults } from '@/hooks/queries/useRalphBoardQueryDefaults';
import { DEFAULT_WORKFLOW_DEFINITION } from '@/lib/workflow/definition';

/** Re-export for hooks that should align stale windows with the board bundle */
export {
  RALPH_BOARD_BOOTSTRAP_STALE_MS,
  RALPH_BOARD_SWR_STALE_MS as RALPH_BOARD_STALE_MS,
} from '@/hooks/queries/useRalphBoardQueryDefaults';

export interface RalphBoardBootstrapPayload {
  definition: WorkflowDefinition;
  projects: RalphProject[];
  playbooks: RalphPlaybook[];
  tasks: RalphTaskData[];
  meta: Record<string, unknown>;
}

/** Immediate shape for the board UI before the network returns; replaced by the real bundle. */
export function getRalphBoardBootstrapPlaceholder(): RalphBoardBootstrapPayload {
  return {
    definition: DEFAULT_WORKFLOW_DEFINITION,
    projects: [],
    playbooks: [],
    tasks: [],
    meta: {},
  };
}

async function fetchAndHydrateBoardBootstrap(
  queryClient: QueryClient,
  archived: boolean
): Promise<RalphBoardBootstrapPayload> {
  return debugRalphFetchAsync(
    'board-bootstrap',
    `GET /api/ralph/board-bootstrap archivedOnly=${archived}`,
    async () => {
      const params = new URLSearchParams();
      if (archived) {
        params.set('archivedOnly', 'true');
      }
      const response = await fetch(`/api/ralph/board-bootstrap?${params.toString()}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error((errorData as { error?: string }).error || `HTTP ${response.status}`);
      }
      const data = (await response.json()) as RalphBoardBootstrapPayload;
      queryClient.setQueryData<WorkflowDefinition>(['workflow-definition'], data.definition);
      queryClient.setQueryData<RalphProject[]>(['ralph-projects'], data.projects);
      queryClient.setQueryData<RalphPlaybook[]>(['ralph-playbooks'], data.playbooks);
      queryClient.setQueryData<RalphTaskData[]>(['ralph-tasks', { archived }], data.tasks);
      return data;
    }
  );
}

interface UseRalphBoardBootstrapOptions {
  archived?: boolean;
}

export function useRalphBoardBootstrap({ archived = false }: UseRalphBoardBootstrapOptions = {}) {
  const queryClient = useQueryClient();
  const queryFn = useCallback(
    () => fetchAndHydrateBoardBootstrap(queryClient, archived),
    [queryClient, archived]
  );

  return useQuery({
    queryKey: ['ralph-board-bootstrap', { archived }],
    queryFn,
    placeholderData: getRalphBoardBootstrapPlaceholder,
    ...ralphBoardBootstrapQueryDefaults,
  });
}

/** Used by layout prefetch and nav hover — must hydrate the same keys as the hook */
export async function prefetchRalphBoardBootstrap(
  queryClient: QueryClient,
  options: UseRalphBoardBootstrapOptions = {}
): Promise<void> {
  const archived = options.archived ?? false;
  await queryClient.prefetchQuery({
    queryKey: ['ralph-board-bootstrap', { archived }],
    queryFn: () => fetchAndHydrateBoardBootstrap(queryClient, archived),
    ...ralphBoardBootstrapQueryDefaults,
  });
}
