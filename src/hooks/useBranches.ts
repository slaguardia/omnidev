import { useState, useCallback } from 'react';
import { initializeWorkspaceManager, loadWorkspace } from '@/lib/managers/workspace-manager';
import { getAllRemoteBranches } from '@/lib/git/branches';
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

      // Fetch all branches (local and remote) using standalone function
      console.log('Getting branches for workspace:', workspace.data.path);
      const branchesResult = await getAllRemoteBranches(workspace.data.path);

      if (!branchesResult.success) {
        console.error(`Failed to get branches: ${branchesResult.error.message}`);
        setBranches([]);
        return;
      }

      // Branches are already deduplicated and cleaned by getAllRemoteBranches
      const uniqueBranches = branchesResult.data;
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
