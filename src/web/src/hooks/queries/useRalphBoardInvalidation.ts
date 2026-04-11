import type { QueryClient } from '@tanstack/react-query';

/**
 * Invalidate task list and board bootstrap bundle so both stay consistent after mutations.
 */
export function invalidateRalphBoardData(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ['ralph-tasks'] });
  void queryClient.invalidateQueries({ queryKey: ['ralph-board-bootstrap'] });
}
