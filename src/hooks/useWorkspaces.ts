import { useState, useEffect } from 'react';
import { Workspace } from '@/lib/dashboard/types';
import { getWorkspaces, cleanupWorkspace, cleanupAllWorkspaces } from '@/lib/workspace';
import type { WorkspaceId } from '@/lib/types/index';

export const useWorkspaces = () => {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true); // Start true to show loading on initial render

  const loadWorkspaces = async () => {
    console.log('[USE WORKSPACES] Starting loadWorkspaces');
    setLoading(true);

    try {
      console.log('[USE WORKSPACES] Calling getWorkspaces...');
      const workspacesData = await getWorkspaces();
      console.log('[USE WORKSPACES] Received workspaces data:', workspacesData);

      // Map from lib Workspace type to dashboard Workspace type
      const mappedWorkspaces = workspacesData.map((ws) => ({
        ...ws,
        branch: ws.targetBranch, // Map targetBranch to branch
      }));

      console.log('[USE WORKSPACES] Mapped workspaces:', mappedWorkspaces);
      setWorkspaces(mappedWorkspaces);
      console.log(`[USE WORKSPACES] Set ${mappedWorkspaces.length} workspaces in state`);
    } catch (error) {
      console.error('[USE WORKSPACES] Failed to load workspaces:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCleanupWorkspace = async (workspaceId?: string, all = false) => {
    console.log('[USE WORKSPACES] Starting handleCleanupWorkspace', { workspaceId, all });

    try {
      setLoading(true);

      if (workspaceId) {
        // Clean specific workspace
        console.log('[USE WORKSPACES] Cleaning specific workspace:', workspaceId);
        await cleanupWorkspace(workspaceId as WorkspaceId);
        await loadWorkspaces();
        return { success: true, message: 'Workspace cleaned successfully!' };
      } else if (all) {
        // Clean all workspaces
        console.log('[USE WORKSPACES] Cleaning all workspaces');
        const result = await cleanupAllWorkspaces(true);
        await loadWorkspaces();
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
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    console.log('[USE WORKSPACES] useEffect triggered, loading workspaces...');
    loadWorkspaces();
  }, []);

  return {
    workspaces,
    loading,
    loadWorkspaces,
    handleCleanupWorkspace,
  };
};
