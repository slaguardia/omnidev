'use client';

import React from 'react';
import { Button } from '@heroui/button';
import { Input } from '@heroui/input';
import { Settings, Bot, Cog } from 'lucide-react';
import { Select, SelectItem } from '@heroui/select';
import { ClientSafeAppConfig } from '@/lib/types/index';
import { Card, CardBody, CardHeader } from '@heroui/card';
import { LabelWithTooltip } from '@/components/LabelWithTooltip';

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
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold flex items-center gap-2">
          <Settings className="w-6 h-6 text-default-500" />
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

      {/* Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Claude Configuration Card */}
        <Card className="glass-card-static">
          <CardHeader className="px-4 py-3">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-default-500" />
              <h3 className="font-semibold text-default-700 dark:text-default-500">
                Claude Configuration
              </h3>
            </div>
          </CardHeader>
          <CardBody className="px-4 py-5 space-y-5">
            <div className="flex flex-col gap-1.5">
              <Select
                labelPlacement="outside"
                label={
                  <LabelWithTooltip
                    label="Claude Auth Mode"
                    tooltip={
                      envConfig.claude.authMode === 'cli'
                        ? "Use subscription/manual login. The app will not pass ANTHROPIC_API_KEY to the 'claude' subprocess."
                        : 'Auto: use an API key if available, otherwise rely on CLI login.'
                    }
                  />
                }
                placeholder="Select auth mode"
                selectedKeys={[envConfig.claude.authMode]}
                onSelectionChange={(keys: React.Key | Set<React.Key>) => {
                  const keyArray = Array.from(keys as Set<React.Key>);
                  setEnvConfig((prev) => ({
                    ...prev,
                    claude: {
                      ...prev.claude,
                      authMode: keyArray[0] as 'auto' | 'cli',
                    },
                  }));
                }}
                variant="bordered"
                size="sm"
              >
                <SelectItem key="auto">Auto (API key if available)</SelectItem>
                <SelectItem key="cli">CLI Login (Subscription)</SelectItem>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Input
                labelPlacement="outside"
                label={
                  <LabelWithTooltip
                    label="Claude API Key"
                    tooltip={
                      envConfig.claude.apiKeySet
                        ? envConfig.claude.authMode === 'cli'
                          ? 'API key is configured but auth mode is CLI login (API key will be ignored).'
                          : 'API key is configured (enter new key to update)'
                        : envConfig.claude.authMode === 'cli'
                          ? 'Optional in CLI login mode (subscription accounts).'
                          : 'Your Claude API key for AI operations'
                    }
                  />
                }
                type="password"
                value={pendingSensitiveData.claudeApiKey || ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  updateSensitiveData('claudeApiKey', e.target.value)
                }
                variant="bordered"
                size="sm"
                placeholder={
                  envConfig.claude.apiKeySet ? '••••••••••••••••' : 'Enter your Claude API key'
                }
              />
            </div>
          </CardBody>
        </Card>

        {/* Application Settings Card */}
        <Card className="glass-card-static">
          <CardHeader className="px-4 py-3">
            <div className="flex items-center gap-2">
              <Cog className="w-4 h-4 text-default-500" />
              <h3 className="font-semibold text-default-700 dark:text-default-500">
                Application Settings
              </h3>
            </div>
          </CardHeader>
          <CardBody className="px-4 py-5 space-y-5">
            <div className="flex flex-col gap-1.5">
              <Input
                label="Temp Directory Prefix"
                labelPlacement="outside"
                value={envConfig.workspace.tempDirPrefix}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setEnvConfig((prev) => ({
                    ...prev,
                    workspace: { ...prev.workspace, tempDirPrefix: e.target.value },
                  }))
                }
                variant="bordered"
                size="sm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Select
                label="Log Level"
                labelPlacement="outside"
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
                size="sm"
              >
                <SelectItem key="error">Error</SelectItem>
                <SelectItem key="warn">Warning</SelectItem>
                <SelectItem key="info">Info</SelectItem>
                <SelectItem key="debug">Debug</SelectItem>
              </Select>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
