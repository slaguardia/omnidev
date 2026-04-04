'use client';

import { useDashboard } from '@/components/dashboard/DashboardContext';
import WorkspacesTab from '@/components/dashboard/tabs/WorkspacesTab';
import { getProjectDisplayName } from '@/lib/dashboard/helpers';

export default function WorkspacesPage() {
  const {
    workspaces,
    workspacesLoading,
    loadWorkspaces,
    setIsCloneModalOpen,
    handleRequestDelete,
  } = useDashboard();

  return (
    <WorkspacesTab
      workspaces={workspaces}
      loading={workspacesLoading}
      onRefreshWorkspaces={loadWorkspaces}
      onOpenCloneModal={() => setIsCloneModalOpen(true)}
      onDeleteWorkspace={handleRequestDelete}
      getProjectDisplayName={getProjectDisplayName}
    />
  );
}
