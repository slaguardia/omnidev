'use client';

import React from 'react';
import { Button } from '@heroui/button';
import { Input } from '@heroui/input';
import { Bot, Cog } from 'lucide-react';
import { Select, SelectItem } from '@heroui/select';
import { ClientSafeAppConfig } from '@/lib/types/index';
import { Card, CardBody, CardHeader } from '@heroui/card';

interface SettingsTabProps {
  envConfig: ClientSafeAppConfig;
  setEnvConfig: React.Dispatch<React.SetStateAction<ClientSafeAppConfig>>;
  loading: boolean;
  onSaveConfig: () => void;
  onResetToDefaults: () => void;
}

export default function SettingsTab({
  envConfig,
  setEnvConfig,
  loading,
  onSaveConfig,
  onResetToDefaults,
}: SettingsTabProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-end items-center">
        <div className="flex items-center gap-2">
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
              <h3 className="font-medium text-default-700 dark:text-default-500">
                Claude Configuration
              </h3>
            </div>
          </CardHeader>
          <CardBody className="px-4 py-5">
            <p className="text-sm text-default-500">
              Claude Code uses CLI subscription authentication. No API key configuration is needed.
            </p>
          </CardBody>
        </Card>

        {/* Application Settings Card */}
        <Card className="glass-card-static">
          <CardHeader className="px-4 py-3">
            <div className="flex items-center gap-2">
              <Cog className="w-4 h-4 text-default-500" />
              <h3 className="font-medium text-default-700 dark:text-default-500">
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
