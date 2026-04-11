'use client';

import { Skeleton } from '@heroui/skeleton';
import { RalphSubTabs } from './RalphSubTabs';

/**
 * Shared shell for Ralph board loading states: real sub-tab links (static) plus skeletons
 * only for data-dependent UI (filters/actions and main content).
 * Used by route `loading.tsx` and the Board page `Suspense` fallback while `useSearchParams` resolves.
 */
export function RalphBoardPendingChrome() {
  return (
    <div className="space-y-6">
      <RalphSubTabs
        trailing={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Skeleton className="h-9 w-40 rounded-lg" />
            <Skeleton className="h-9 w-28 rounded-lg" />
            <Skeleton className="h-9 w-24 rounded-lg" />
          </div>
        }
      />
      <div className="space-y-4">
        <Skeleton className="h-8 w-48 max-w-full rounded-lg" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    </div>
  );
}
