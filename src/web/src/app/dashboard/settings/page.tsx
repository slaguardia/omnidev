'use client';

import { useDashboard } from '@/components/dashboard/DashboardContext';
import SettingsTab from '@/components/dashboard/tabs/SettingsTab';

export default function SettingsPage() {
  const { envConfig, setEnvConfig, loading, handleSaveEnvConfigWithToast, resetToDefaults } =
    useDashboard();

  return (
    <SettingsTab
      envConfig={envConfig}
      setEnvConfig={setEnvConfig}
      loading={loading}
      onSaveConfig={handleSaveEnvConfigWithToast}
      onResetToDefaults={resetToDefaults}
    />
  );
}
