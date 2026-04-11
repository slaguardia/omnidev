'use client';

import { useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateRalphBoardData } from '@/hooks/queries/useRalphBoardInvalidation';
import { TaskDetailScreen } from '@/components/dashboard/tabs/ralph';
import type { RalphTaskStatus } from '@/components/dashboard/tabs/ralph';

export default function TaskDetailPage() {
  const params = useParams<{ taskId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const handleBack = useCallback(() => {
    router.push('/dashboard/ralph-board');
  }, [router]);

  const handleNavigateToTask = useCallback(
    (taskId: string) => {
      router.push(`/dashboard/ralph-board/task/${taskId}`);
    },
    [router]
  );

  const handleTransition = useCallback(
    async (taskId: string, toStatus: RalphTaskStatus) => {
      const detailKey = ['ralph-task-detail', taskId];

      // Snapshot for rollback
      const prevDetail = queryClient.getQueryData(detailKey);

      // Optimistic: update status immediately
      queryClient.setQueryData(detailKey, (old: Record<string, unknown> | undefined) =>
        old ? { ...old, status: toStatus } : old
      );

      try {
        const response = await fetch(`/api/ralph/tasks/${taskId}/transition`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toStatus }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          console.error('[TASK DETAIL] Transition failed:', data);
          // Rollback on error
          if (prevDetail) queryClient.setQueryData(detailKey, prevDetail);
          return;
        }
        // Merge server response into cache (picks up updatedAt, etc.)
        if (data?.task) {
          queryClient.setQueryData(detailKey, (old: Record<string, unknown> | undefined) =>
            old ? { ...old, ...data.task } : old
          );
        }
      } catch (err) {
        console.error('[TASK DETAIL] Transition failed:', err);
        if (prevDetail) queryClient.setQueryData(detailKey, prevDetail);
      }
    },
    [queryClient]
  );

  const handleDelete = useCallback(
    async (taskId: string) => {
      try {
        const response = await fetch(`/api/ralph/tasks/${taskId}`, { method: 'DELETE' });
        if (response.ok) {
          invalidateRalphBoardData(queryClient);
          router.push('/dashboard/ralph-board');
        }
      } catch (err) {
        console.error('[TASK DETAIL] Delete failed:', err);
      }
    },
    [queryClient, router]
  );

  return (
    <TaskDetailScreen
      taskId={params.taskId}
      onBack={handleBack}
      onNavigateToTask={handleNavigateToTask}
      onTransition={handleTransition}
      onDelete={handleDelete}
    />
  );
}
