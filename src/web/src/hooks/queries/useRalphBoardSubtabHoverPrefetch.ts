'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { prefetchRalphBoardBootstrap } from '@/hooks/queries/useRalphBoardBootstrap';
import { prefetchRalphPlaybooks } from '@/hooks/queries/useRalphPlaybooks';
import { prefetchRalphProjects } from '@/hooks/queries/useRalphProjects';
import { prefetchWorkflowDefinition } from '@/hooks/queries/useWorkflowDefinition';

/** Trailing debounce so sweeping the pointer across subtabs does not fire N prefetches */
const HOVER_PREFETCH_DEBOUNCE_MS = 180;

/**
 * Debounced prefetch for Ralph board subtabs (Board / Projects / Workflow / Playbooks).
 * TanStack Query still dedupes identical in-flight queries when a prefetch does run.
 */
export function useRalphBoardSubtabHoverPrefetch(queryClient: QueryClient) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingKeyRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const onMouseEnter = useCallback(
    (tabKey: string) => {
      pendingKeyRef.current = tabKey;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const key = pendingKeyRef.current;
        if (!key) return;
        if (key === 'board') {
          void prefetchRalphBoardBootstrap(queryClient, { archived: false });
        } else if (key === 'projects') {
          void prefetchRalphProjects(queryClient);
        } else if (key === 'workflow') {
          void prefetchWorkflowDefinition(queryClient);
        } else if (key === 'playbooks') {
          void prefetchRalphPlaybooks(queryClient);
          void prefetchWorkflowDefinition(queryClient);
        }
      }, HOVER_PREFETCH_DEBOUNCE_MS);
    },
    [queryClient]
  );

  return onMouseEnter;
}
