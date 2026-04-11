'use client';

import { useLayoutEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { prefetchRalphBoardBootstrap } from '@/hooks/queries/useRalphBoardBootstrap';

/**
 * Warms Ralph board React Query cache once when entering any /dashboard/ralph-board/* route.
 * Layout stays mounted across Board / Projects / Workflow / Playbooks subtabs.
 * useLayoutEffect starts the prefetch before paint (still async, but earlier than useEffect).
 */
export default function RalphBoardLayout({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  useLayoutEffect(() => {
    void prefetchRalphBoardBootstrap(queryClient, { archived: false });
  }, [queryClient]);

  return <>{children}</>;
}
