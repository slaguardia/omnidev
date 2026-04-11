/**
 * Shared TanStack Query defaults for Ralph board routes (`/dashboard/ralph-board/*`).
 *
 * Goal: show cached/prefetched data immediately, then refetch in the background after
 * navigation when data is stale (stale-while-revalidate). Tuned for subtabs sharing the
 * same React Query cache.
 */
export const RALPH_BOARD_SWR_STALE_MS = 60_000;

/**
 * Bootstrap goes stale a bit sooner than list queries so revisiting the Board subtab after
 * time away triggers a refetch without `refetchOnMount: 'always'` (which refetched on every mount).
 * Mutations still call `invalidateRalphBoardData` for immediate consistency.
 */
export const RALPH_BOARD_BOOTSTRAP_STALE_MS = 45_000;

/** List endpoints: refetch on mount only when stale (after staleTime since last fetch) */
export const ralphBoardListQueryDefaults = {
  staleTime: RALPH_BOARD_SWR_STALE_MS,
  gcTime: 5 * 60_000,
  refetchOnMount: true as const,
  refetchOnWindowFocus: false as const,
};

/**
 * Bootstrap bundle: stale-while-revalidate with a shorter stale window than lists; refetch on
 * window focus so background worker updates surface when returning to the app without spamming
 * every subtab navigation.
 */
export const ralphBoardBootstrapQueryDefaults = {
  staleTime: RALPH_BOARD_BOOTSTRAP_STALE_MS,
  gcTime: 5 * 60_000,
  refetchOnMount: true as const,
  refetchOnWindowFocus: true as const,
};
