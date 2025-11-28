import { useState, useEffect } from 'react';
import { ClientSafeAppConfig } from '@/lib/types/index';
import { getClientSafeConfig, updateConfigFromClient } from '@/lib/config/server-actions';
import { getDefaultClientSafeConfig } from '@/lib/config/client-settings';

export const useEnvironmentConfig = () => {
  const [envConfig, setEnvConfig] = useState<ClientSafeAppConfig>(getDefaultClientSafeConfig());
  const [pendingSensitiveData, setPendingSensitiveData] = useState<{
    gitlabToken?: string;
    claudeApiKey?: string;
  }>({});
  const [loading, setLoading] = useState(false);

  const loadEnvironmentConfig = async () => {
    try {
      const config = await getClientSafeConfig();
      setEnvConfig(config);
      // Clear any pending sensitive data when loading fresh config
      setPendingSensitiveData({});
    } catch (error) {
      console.error('Failed to load config:', error);
      // Fall back to defaults
      setEnvConfig(getDefaultClientSafeConfig());
    }
  };

  const saveEnvironmentConfig = async () => {
    try {
      setLoading(true);
      const result = await updateConfigFromClient(envConfig, pendingSensitiveData);
      if (result.success) {
        // Clear pending sensitive data after successful save
        setPendingSensitiveData({});
        // Reload config to get updated status
        await loadEnvironmentConfig();
      }
      return result;
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to save configuration',
        error,
      };
    } finally {
      setLoading(false);
    }
  };

  const updateSensitiveData = (type: 'gitlabToken' | 'claudeApiKey', value: string) => {
    setPendingSensitiveData((prev) => ({
      ...prev,
      [type]: value,
    }));
  };

  const resetToDefaults = () => {
    const defaultConfig = getDefaultClientSafeConfig();
    setEnvConfig(defaultConfig);
    setPendingSensitiveData({});
  };

  useEffect(() => {
    loadEnvironmentConfig();
  }, []);

  return {
    envConfig,
    setEnvConfig,
    pendingSensitiveData,
    updateSensitiveData,
    loading,
    loadEnvironmentConfig,
    saveEnvironmentConfig,
    resetToDefaults,
  };
};
