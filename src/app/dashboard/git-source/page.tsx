'use client';

import { useDashboard } from '@/components/dashboard/DashboardContext';
import GitSourceConfigTab from '@/components/dashboard/tabs/GitSourceConfigTab';

export default function GitSourcePage() {
  const {
    envConfig,
    setEnvConfigForGitSource,
    pendingSensitiveData,
    updateSensitiveData,
    loading,
    handleSaveEnvConfigWithToast,
    connectionStatus,
  } = useDashboard();

  return (
    <GitSourceConfigTab
      envConfig={envConfig}
      setEnvConfig={setEnvConfigForGitSource}
      pendingSensitiveData={pendingSensitiveData}
      updateSensitiveData={updateSensitiveData}
      loading={loading}
      onSaveConfig={handleSaveEnvConfigWithToast}
      connectionStatus={connectionStatus}
    />
  );
}
