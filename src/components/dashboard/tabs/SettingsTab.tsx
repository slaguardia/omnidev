'use client';

import React, { useState } from 'react';
import { Button } from '@heroui/button';
import { Input } from '@heroui/input';
import { Settings } from 'lucide-react';
import { Select, SelectItem } from '@heroui/select';
import { ClientSafeAppConfig } from '@/lib/types/index';
import { Divider } from '@heroui/divider';
import { Snippet } from '@heroui/snippet';

interface SettingsTabProps {
  envConfig: ClientSafeAppConfig;
  setEnvConfig: React.Dispatch<React.SetStateAction<ClientSafeAppConfig>>;
  pendingSensitiveData: {
    claudeApiKey?: string;
  };
  updateSensitiveData: (type: 'gitlabToken' | 'claudeApiKey', value: string) => void;
  loading: boolean;
  onSaveConfig: () => void;
  onResetToDefaults: () => void;
}

export default function SettingsTab({
  envConfig,
  setEnvConfig,
  pendingSensitiveData,
  updateSensitiveData,
  loading,
  onSaveConfig,
  onResetToDefaults,
}: SettingsTabProps) {
  const [apiKey, setApiKey] = useState('');

  async function generateApiKey() {
    const res = await fetch('/api/generate-key', {
      method: 'POST',
    });

    if (!res.ok) {
      const err = await res.json();
      console.error(err.error || 'Failed to generate key');
      return;
    }

    const data = await res.json();
    setApiKey(data.apiKey);
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold flex items-center gap-2">
          <Settings className="w-6 h-6 text-gray-500" />
          Environment Settings
        </h2>
        <div className="flex gap-2">
          <Button color="danger" variant="flat" size="sm" onClick={onResetToDefaults}>
            Reset to Defaults
          </Button>
          <Button color="primary" size="sm" onClick={onSaveConfig} isLoading={loading}>
            Save Configuration
          </Button>
        </div>
      </div>

      {/* Claude Configuration */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-secondary-500">Claude Configuration</h3>
        <Divider />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Claude API Key"
            type="password"
            value={pendingSensitiveData.claudeApiKey || ''}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              updateSensitiveData('claudeApiKey', e.target.value)
            }
            variant="bordered"
            placeholder={
              envConfig.claude.apiKeySet ? '••••••••••••••••' : 'Enter your Claude API key'
            }
            description={
              envConfig.claude.apiKeySet
                ? 'API key is configured (enter new key to update)'
                : 'Your Claude API key for AI operations'
            }
          />
        </div>
      </section>

      {/* Application Settings */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-success-500">Application Settings</h3>
        <Divider />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Temp Directory Prefix"
            value={envConfig.workspace.tempDirPrefix}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setEnvConfig((prev) => ({
                ...prev,
                workspace: { ...prev.workspace, tempDirPrefix: e.target.value },
              }))
            }
            variant="bordered"
          />
          <Select
            label="Log Level"
            placeholder="Select log level"
            selectedKeys={[envConfig.logging.level]}
            onSelectionChange={(keys: React.Key | Set<React.Key>) => {
              const keyArray = Array.from(keys as Set<React.Key>);
              setEnvConfig((prev) => ({
                ...prev,
                logging: {
                  ...prev.logging,
                  level: keyArray[0] as 'debug' | 'info' | 'warn' | 'error',
                },
              }));
            }}
            variant="bordered"
          >
            <SelectItem key="error">Error</SelectItem>
            <SelectItem key="warn">Warning</SelectItem>
            <SelectItem key="info">Info</SelectItem>
            <SelectItem key="debug">Debug</SelectItem>
          </Select>
        </div>

        {/* API Key Generation */}
        <div className="space-y-4 pt-2">
          <div className="flex flex-col sm:flex-row gap-4 items-center">
            <Button
              color="success"
              onClick={generateApiKey}
              isLoading={loading}
              className="w-full sm:w-auto"
              variant="flat"
            >
              Generate New API Key
            </Button>
            <p className="text-sm text-default-600">
              Generate a new API key for external access to this application.
            </p>
          </div>

          {apiKey && (
            <div className="p-4 bg-success-50 border border-success-200 rounded-lg space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-success-600 font-semibold">
                  API Key Generated Successfully
                </span>
              </div>
              <div className="space-y-3">
                <Snippet
                  hideSymbol
                  variant="solid"
                  className="text-sm font-mono w-full overflow-hidden"
                  color="default"
                  onCopy={() => navigator.clipboard.writeText(apiKey)}
                >
                  <span className="truncate block">
                    {apiKey.slice(0, 8) + '••••••••••••••••••••••••••••••••'}
                  </span>
                </Snippet>
                <p className="text-sm text-success-700">
                  <strong>Important:</strong> Copy this key now — you won&apos;t be able to see it
                  again for security reasons.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
