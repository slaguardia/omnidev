import { useQuery } from '@tanstack/react-query';
import { ralphBoardListQueryDefaults } from '@/hooks/queries/useRalphBoardQueryDefaults';
import { debugRalphFetchAsync } from '@/lib/debug/ralph-fetch-debug';

interface RalphWorkspacePermissions {
  canPushToProtected: boolean;
  targetBranchProtected: boolean;
  accessLevelName: string;
}

interface RalphWorkspace {
  id: string;
  name: string;
  repoUrl: string;
  targetBranch: string;
  branches: string[];
  permissions?: RalphWorkspacePermissions;
}

interface UseRalphWorkspacesOptions {
  includeBranches?: boolean;
  enabled?: boolean;
}

async function fetchRalphWorkspaces(includeBranches: boolean): Promise<RalphWorkspace[]> {
  return debugRalphFetchAsync(
    'ralph-workspaces',
    `GET /api/ralph/workspaces includeBranches=${includeBranches}`,
    async () => {
      const params = new URLSearchParams();
      if (!includeBranches) {
        params.set('includeBranches', 'false');
      }
      const response = await fetch(`/api/ralph/workspaces?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch workspaces');
      }
      const data = await response.json();
      return data.workspaces || [];
    }
  );
}

export function useRalphWorkspaces({
  includeBranches = true,
  enabled = true,
}: UseRalphWorkspacesOptions = {}) {
  return useQuery({
    queryKey: ['ralph-workspaces', { includeBranches }],
    queryFn: () => fetchRalphWorkspaces(includeBranches),
    ...ralphBoardListQueryDefaults,
    enabled,
  });
}
