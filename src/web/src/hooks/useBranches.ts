import { useState, useCallback } from 'react';
import { addToast } from '@heroui/toast';
import { initializeWorkspaceManager, loadWorkspace } from '@/lib/managers/workspace-manager';
import { getRemoteBranchesForWorkspace } from '@/lib/workspace/workspace-actions';
import { loadAllWorkspacesFromStorage } from '@/lib/managers/repository-manager';
import type { WorkspaceId } from '@/lib/types/index';

export const useBranches = () => {
  const [branches, setBranches] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchBranches = useCallback(async (workspaceId: string) => {
    try {
      setLoading(true);

      // Initialize managers
      await initializeWorkspaceManager();
      await loadAllWorkspacesFromStorage();

      // Get workspace
      const workspace = await loadWorkspace(workspaceId as WorkspaceId);
      if (!workspace.success) {
        console.error('Workspace not found');
        setBranches([]);
        return;
      }

      console.log('Getting branches for workspace:', workspace.data.id);
      const uniqueBranches = await getRemoteBranchesForWorkspace(workspaceId as WorkspaceId);

      if (uniqueBranches.length === 0) {
        addToast({
          title: 'Failed to load branches',
          description:
            'No branches returned — check repository URL, branch, and provider credentials.',
          color: 'danger',
        });
        setBranches([]);
        return;
      }
      console.log(
        'Fetched branches for workspace:',
        workspace.data.id,
        'branches:',
        uniqueBranches
      );

      // Ensure workspace target branch is at the top if it exists
      const targetBranch = workspace.data.targetBranch;
      if (targetBranch && uniqueBranches.includes(targetBranch)) {
        const otherBranches = uniqueBranches.filter((branch: string) => branch !== targetBranch);
        setBranches([targetBranch, ...otherBranches.sort()]);
      } else {
        setBranches(uniqueBranches.sort());
      }
    } catch (error) {
      console.error('Error fetching branches:', error);
      addToast({
        title: 'Failed to load branches',
        description:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred while loading branches',
        color: 'danger',
      });
      setBranches([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    branches,
    loading,
    fetchBranches,
  };
};
