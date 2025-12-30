import { useState, useEffect } from 'react';
import { ClientSafeAppConfig } from '@/lib/types/index';
import { getClientSafeConfig, updateConfigFromClient } from '@/lib/config/server-actions';
import { getDefaultClientSafeConfig } from '@/lib/config/client-settings';

export const useEnvironmentConfig = () => {
  const [envConfig, setEnvConfig] = useState<ClientSafeAppConfig>(getDefaultClientSafeConfig());
  const [pendingSensitiveData, setPendingSensitiveData] = useState<{
    gitlabToken?: string;
    githubToken?: string;
    claudeApiKey?: string;
  }>({});
  const [touchedFields, setTouchedFields] = useState<{
    gitlabToken?: boolean;
    githubToken?: boolean;
    claudeApiKey?: boolean;
  }>({});
  const [loading, setLoading] = useState(false);

  const loadEnvironmentConfig = async () => {
    try {
      const config = await getClientSafeConfig();
      setEnvConfig(config);
      // Clear any pending sensitive data and touched state when loading fresh config
      setPendingSensitiveData({});
      setTouchedFields({});
    } catch (error) {
      console.error('Failed to load config:', error);
      // Fall back to defaults
      setEnvConfig(getDefaultClientSafeConfig());
    }
  };

  const saveEnvironmentConfig = async () => {
    try {
      setLoading(true);

      // Only include sensitive data for fields that were actually touched
      // Use empty string as fallback since touched means user interacted with the field
      const sensitiveDataToSend: {
        gitlabToken?: string;
        githubToken?: string;
        claudeApiKey?: string;
      } = {};
      if (touchedFields.gitlabToken) {
        sensitiveDataToSend.gitlabToken = pendingSensitiveData.gitlabToken ?? '';
      }
      if (touchedFields.githubToken) {
        sensitiveDataToSend.githubToken = pendingSensitiveData.githubToken ?? '';
      }
      if (touchedFields.claudeApiKey) {
        sensitiveDataToSend.claudeApiKey = pendingSensitiveData.claudeApiKey ?? '';
      }

      const result = await updateConfigFromClient(envConfig, sensitiveDataToSend);
      if (result.success) {
        // Clear pending sensitive data and touched state after successful save
        setPendingSensitiveData({});
        setTouchedFields({});
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

  const updateSensitiveData = (
    type: 'gitlabToken' | 'githubToken' | 'claudeApiKey',
    value: string
  ) => {
    setPendingSensitiveData((prev) => ({
      ...prev,
      [type]: value,
    }));
    // Mark this field as touched so we know to include it in save
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

  /**
   * Detect if user is about to clear existing API keys
   * Returns list of keys that would be removed
   */
  const getApiKeyChanges = () => {
    const clearing: string[] = [];

    // Check if GitLab token is being cleared (touched, empty, and was previously set)
    if (
      touchedFields.gitlabToken &&
      !pendingSensitiveData.gitlabToken &&
      envConfig.gitlab.tokenSet
    ) {
      clearing.push('GitLab Token');
    }

    // Check if GitHub token is being cleared (touched, empty, and was previously set)
    if (
      touchedFields.githubToken &&
      !pendingSensitiveData.githubToken &&
      envConfig.github.tokenSet
    ) {
      clearing.push('GitHub Token');
    }

    // Check if Claude API key is being cleared (touched, empty, and was previously set)
    if (
      touchedFields.claudeApiKey &&
      !pendingSensitiveData.claudeApiKey &&
      envConfig.claude.apiKeySet
    ) {
      clearing.push('Claude API Key');
    }

    return { clearing };
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
    getApiKeyChanges,
  };
};
