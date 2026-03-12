import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Workspace } from '@/lib/dashboard/types';
import { getWorkspaces, cleanupWorkspace, cleanupAllWorkspaces } from '@/lib/workspace';
import type { WorkspaceId } from '@/lib/types/index';
import { useInvalidateWorkspaces, useInvalidateRalphTasks } from '@/hooks/queries/useInvalidation';

async function fetchWorkspaces(): Promise<Workspace[]> {
  console.log('[USE WORKSPACES] Calling getWorkspaces...');
  const workspacesData = await getWorkspaces();

  // Map from lib Workspace type to dashboard Workspace type
  const mappedWorkspaces = workspacesData.map((ws) => ({
    ...ws,
    branch: ws.targetBranch,
  }));

  console.log(`[USE WORKSPACES] Fetched ${mappedWorkspaces.length} workspaces`);
  return mappedWorkspaces;
}

export function useWorkspaces() {
  const invalidateWorkspaces = useInvalidateWorkspaces();
  const invalidateTasks = useInvalidateRalphTasks();

  const { data: workspaces = [], isLoading: loading } = useQuery({
    queryKey: ['workspaces'],
    queryFn: fetchWorkspaces,
    staleTime: 60_000,
  });

  const loadWorkspaces = useCallback(() => {
    invalidateWorkspaces();
  }, [invalidateWorkspaces]);

  const handleCleanupWorkspace = useCallback(
    async (workspaceId?: string, all = false, deleteTasks = false) => {
      console.log('[USE WORKSPACES] Starting handleCleanupWorkspace', {
        workspaceId,
        all,
        deleteTasks,
      });

      try {
        if (workspaceId) {
          console.log('[USE WORKSPACES] Cleaning specific workspace:', workspaceId);
          await cleanupWorkspace(workspaceId as WorkspaceId, deleteTasks);
          invalidateWorkspaces();
          if (deleteTasks) invalidateTasks();
          return { success: true, message: 'Workspace cleaned successfully!' };
        } else if (all) {
          console.log('[USE WORKSPACES] Cleaning all workspaces');
          const result = await cleanupAllWorkspaces(true);
          invalidateWorkspaces();
          invalidateTasks();
          return { success: true, message: result.message };
        } else {
          return { success: false, message: 'Please specify a workspace ID or use all=true' };
        }
      } catch (error) {
        console.error('[USE WORKSPACES] Cleanup failed:', error);
        return {
          success: false,
          message: error instanceof Error ? error.message : 'Cleanup failed',
          error,
        };
      }
    },
    [invalidateWorkspaces, invalidateTasks]
  );

  return {
    workspaces,
    loading,
    loadWorkspaces,
    handleCleanupWorkspace,
  };
}
