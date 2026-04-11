'use client';

import { useDashboard } from '@/components/dashboard/DashboardContext';
import OperationsTab from '@/components/dashboard/tabs/OperationsTab';
import { getProjectDisplayName } from '@/lib/dashboard/helpers';

export default function OperationsPage() {
  const {
    workspaces,
    claudeForm,
    setClaudeForm,
    claudeResponse,
    setClaudeResponse,
    loading,
    handleClaudeWithToast,
  } = useDashboard();

  return (
    <OperationsTab
      workspaces={workspaces}
      claudeForm={claudeForm}
      setClaudeForm={setClaudeForm}
      claudeResponse={claudeResponse}
      setClaudeResponse={setClaudeResponse}
      loading={loading}
      onRunClaude={handleClaudeWithToast}
      getProjectDisplayName={getProjectDisplayName}
    />
  );
}
