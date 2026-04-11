'use client';

import { useDashboard } from '@/components/dashboard/DashboardContext';
import ExternalTaskingHistoryTab from '@/components/dashboard/tabs/ExternalTaskingHistoryTab';
import { getProjectDisplayName } from '@/lib/dashboard/helpers';

export default function ExternalTaskingPage() {
  const { workspaces } = useDashboard();

  return (
    <ExternalTaskingHistoryTab
      workspaces={workspaces}
      getProjectDisplayName={getProjectDisplayName}
    />
  );
}
