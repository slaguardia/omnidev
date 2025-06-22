'use client';

import React from 'react';
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Settings } from "lucide-react";
import { Select, SelectItem } from '@heroui/select';
import { EnvironmentConfig } from '../types';
import { Divider } from '@heroui/divider';

interface SettingsTabProps {
  envConfig: EnvironmentConfig;
  setEnvConfig: React.Dispatch<React.SetStateAction<EnvironmentConfig>>;
  loading: boolean;
  onSaveConfig: () => void;
  onResetToDefaults: () => void;
}

export default function SettingsTab({
  envConfig,
  setEnvConfig,
  loading,
  onSaveConfig,
  onResetToDefaults
}: SettingsTabProps) {
  return (
    <div className="space-y-6">
      <Card className="glass-card">
        <CardHeader>
          <h3 className="text-xl font-semibold flex items-center gap-2">
            <Settings className="w-5 h-5 text-gray-500" />
            Environment Configuration
          </h3>
        </CardHeader>
        <CardBody>
          <div className="space-y-6">
            {/* GitLab Configuration */}
            <div>
              <h4 className="text-lg font-semibold text-primary-500">GitLab Configuration</h4>
              <Divider className="mb-4" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="GitLab URL"
                  value={envConfig.GITLAB_URL}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEnvConfig(prev => ({ ...prev, GITLAB_URL: e.target.value }))}
                  variant="bordered"
                />
                <Input
                  label="GitLab Token"
                  type="password"
                  value={envConfig.GITLAB_TOKEN}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEnvConfig(prev => ({ ...prev, GITLAB_TOKEN: e.target.value }))}
                  variant="bordered"
                />
              </div>
              <Input
                label="Allowed GitLab Hosts"
                value={envConfig.ALLOWED_GITLAB_HOSTS}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEnvConfig(prev => ({ ...prev, ALLOWED_GITLAB_HOSTS: e.target.value }))}
                variant="bordered"
                className="mt-4"
                description="Comma-separated list of allowed hosts"
              />
            </div>

            {/* Claude Configuration */}
            <div>
              <h4 className="text-lg font-semibold text-secondary-500">Claude Configuration</h4>
              <Divider className="mb-4" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Claude API Key"
                  type="password"
                  value={envConfig.CLAUDE_API_KEY}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEnvConfig(prev => ({ ...prev, CLAUDE_API_KEY: e.target.value }))}
                  variant="bordered"
                />
                <Input
                  label="Claude Code Path"
                  value={envConfig.CLAUDE_CODE_PATH}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEnvConfig(prev => ({ ...prev, CLAUDE_CODE_PATH: e.target.value }))}
                  variant="bordered"
                />
              </div>
            </div>

            {/* Application Settings */}
            <div>
              <h4 className="text-lg font-semibold text-success-500">Application Settings</h4>
              <Divider className="mb-4" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Max Workspace Size (MB)"
                  type="number"
                  value={envConfig.MAX_WORKSPACE_SIZE_MB}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEnvConfig(prev => ({ ...prev, MAX_WORKSPACE_SIZE_MB: e.target.value }))}
                  variant="bordered"
                />
                <Input
                  label="Cache Expiry (Days)"
                  type="number"
                  value={envConfig.CACHE_EXPIRY_DAYS}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEnvConfig(prev => ({ ...prev, CACHE_EXPIRY_DAYS: e.target.value }))}
                  variant="bordered"
                />
                <Input
                  label="Temp Directory Prefix"
                  value={envConfig.TEMP_DIR_PREFIX}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEnvConfig(prev => ({ ...prev, TEMP_DIR_PREFIX: e.target.value }))}
                  variant="bordered"
                />
                <Select
                  label="Log Level"
                  placeholder="Select log level"
                  selectedKeys={[envConfig.LOG_LEVEL]}
                  onSelectionChange={(keys: any) => setEnvConfig(prev => ({ ...prev, LOG_LEVEL: Array.from(keys)[0] as string }))}
                  variant="bordered"
                >
                  <SelectItem key="error">Error</SelectItem>
                  <SelectItem key="warn">Warning</SelectItem>
                  <SelectItem key="info">Info</SelectItem>
                  <SelectItem key="debug">Debug</SelectItem>
                </Select>
                <Input
                  label="Max Concurrent Workspaces"
                  type="number"
                  value={envConfig.MAX_CONCURRENT_WORKSPACES}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEnvConfig(prev => ({ ...prev, MAX_CONCURRENT_WORKSPACES: e.target.value }))}
                  variant="bordered"
                  className="md:col-span-2"
                />
              </div>
            </div>


            {/* Save Configuration */}
            <div className="flex justify-end gap-4">
              <Button
                color="default"
                variant="flat"
                onClick={onResetToDefaults}
              >
                Reset to Defaults
              </Button>
              <Button
                color="primary"
                onClick={onSaveConfig}
                isLoading={loading}
              >
                Save Configuration
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
} 