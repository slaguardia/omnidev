import { useState, useEffect } from 'react';
import { EnvironmentConfig } from '@/components/dashboard/types';

const DEFAULT_ENV_CONFIG: EnvironmentConfig = {
  GITLAB_URL: 'https://gitlab.com',
  GITLAB_TOKEN: '',
  CLAUDE_API_KEY: '',
  CLAUDE_CODE_PATH: '/usr/local/bin/claude-code',
  MAX_WORKSPACE_SIZE_MB: '1000',
  CACHE_EXPIRY_DAYS: '7',
  TEMP_DIR_PREFIX: 'gitlab-claude-',
  LOG_LEVEL: 'info',
  ALLOWED_GITLAB_HOSTS: 'gitlab.com,your-internal-gitlab.com',
  MAX_CONCURRENT_WORKSPACES: '5'
};

export const useEnvironmentConfig = () => {
  const [envConfig, setEnvConfig] = useState<EnvironmentConfig>(DEFAULT_ENV_CONFIG);
  const [loading, setLoading] = useState(false);

  const loadEnvironmentConfig = async () => {
    try {
      const response = await fetch('/api/config');
      if (response.ok) {
        const data = await response.json();
        setEnvConfig(prev => ({ ...prev, ...data.config }));
      }
    } catch (error) {
      console.error('Failed to load environment config:', error);
    }
  };

  const saveEnvironmentConfig = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: envConfig })
      });
      
      if (response.ok) {
        return { success: true, message: 'Environment configuration saved!' };
      } else {
        throw new Error('Failed to save configuration');
      }
    } catch (error) {
      return { success: false, message: 'Failed to save configuration', error };
    } finally {
      setLoading(false);
    }
  };

  const resetToDefaults = () => {
    setEnvConfig(DEFAULT_ENV_CONFIG);
  };

  useEffect(() => {
    loadEnvironmentConfig();
  }, []);

  return {
    envConfig,
    setEnvConfig,
    loading,
    loadEnvironmentConfig,
    saveEnvironmentConfig,
    resetToDefaults,
    DEFAULT_ENV_CONFIG
  };
}; 