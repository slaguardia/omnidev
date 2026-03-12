import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ClientSafeAppConfig } from '@/lib/types/index';
import { getClientSafeConfig, updateConfigFromClient } from '@/lib/config/server-actions';
import { getDefaultClientSafeConfig } from '@/lib/config/client-settings';

export function useEnvironmentConfig() {
  const queryClient = useQueryClient();

  const { data: fetchedConfig } = useQuery({
    queryKey: ['environment-config'],
    queryFn: async () => {
      try {
        return await getClientSafeConfig();
      } catch (error) {
        console.error('Failed to load config:', error);
        return getDefaultClientSafeConfig();
      }
    },
    staleTime: 60_000,
  });

  // Local editable copy of config — initialized from fetched data
  const [envConfig, setEnvConfig] = useState<ClientSafeAppConfig>(getDefaultClientSafeConfig());
  const [configSynced, setConfigSynced] = useState(false);

  // Sync fetched config into local state (once, or when it changes after reload)
  if (fetchedConfig && !configSynced) {
    setEnvConfig(fetchedConfig);
    setConfigSynced(true);
  }

  const [pendingSensitiveData, setPendingSensitiveData] = useState<{
    gitlabToken?: string;
    githubToken?: string;
  }>({});
  const [touchedFields, setTouchedFields] = useState<{
    gitlabToken?: boolean;
    githubToken?: boolean;
  }>({});
  const [loading, setLoading] = useState(false);

  const loadEnvironmentConfig = async () => {
    try {
      const config = await getClientSafeConfig();
      setEnvConfig(config);
      setPendingSensitiveData({});
      setTouchedFields({});
      queryClient.setQueryData(['environment-config'], config);
    } catch (error) {
      console.error('Failed to load config:', error);
      setEnvConfig(getDefaultClientSafeConfig());
    }
  };

  const saveEnvironmentConfig = async () => {
    try {
      setLoading(true);

      const sensitiveDataToSend: {
        gitlabToken?: string;
        githubToken?: string;
      } = {};
      if (touchedFields.gitlabToken) {
        sensitiveDataToSend.gitlabToken = pendingSensitiveData.gitlabToken ?? '';
      }
      if (touchedFields.githubToken) {
        sensitiveDataToSend.githubToken = pendingSensitiveData.githubToken ?? '';
      }

      const result = await updateConfigFromClient(envConfig, sensitiveDataToSend);
      if (result.success) {
        setPendingSensitiveData({});
        setTouchedFields({});
        queryClient.setQueryData(['environment-config'], envConfig);
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

  const updateSensitiveData = (type: 'gitlabToken' | 'githubToken', value: string) => {
    setPendingSensitiveData((prev) => ({
      ...prev,
      [type]: value,
    }));
    setTouchedFields((prev) => ({
      ...prev,
      [type]: true,
    }));
  };

  const resetToDefaults = () => {
    const defaultConfig = getDefaultClientSafeConfig();
    setEnvConfig(defaultConfig);
    setPendingSensitiveData({});
    setTouchedFields({});
  };

  const getApiKeyChanges = () => {
    const clearing: string[] = [];

    if (
      touchedFields.gitlabToken &&
      !pendingSensitiveData.gitlabToken &&
      envConfig.gitlab.tokenSet
    ) {
      clearing.push('GitLab Token');
    }

    if (
      touchedFields.githubToken &&
      !pendingSensitiveData.githubToken &&
      envConfig.github.tokenSet
    ) {
      clearing.push('GitHub Token');
    }

    return { clearing };
  };

  return {
    envConfig,
    setEnvConfig,
    pendingSensitiveData,
    updateSensitiveData,
    loading,
    loadEnvironmentConfig,
    saveEnvironmentConfig,
    resetToDefaults,
    getApiKeyChanges,
  };
}
