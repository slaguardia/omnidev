'use client';

import React, { useState } from 'react';
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { addToast } from "@heroui/toast";
import { Settings } from "lucide-react";
import { Divider } from '@heroui/divider';
import { Snippet } from '@heroui/snippet';
import { generateAndSaveApiKey } from '@/lib/config/api-key-store';
import { useEnvironmentConfig } from '@/hooks';

export default function SettingsTab() {
  const [apiKey, setApiKey] = useState('');
  const { 
    envConfig, 
    setEnvConfig, 
    pendingSensitiveData, 
    updateSensitiveData, 
    loading, 
    saveEnvironmentConfig, 
    resetToDefaults 
  } = useEnvironmentConfig();

  // Handler with toast notifications
  const handleSaveEnvConfigWithToast = async () => {
    const result = await saveEnvironmentConfig();
    if (result.success) {
      addToast({ title: "Success", description: result.message, color: "success" });
    } else {
      addToast({ title: "Error", description: result.message, color: "danger" });
    }
  };

  async function generateApiKey() {
    try {
      const apiKey = await generateAndSaveApiKey();
      setApiKey(apiKey);
    } catch (error) {
      console.error('Failed to generate key:', error);
    }
  }

  return (
    <div className="space-y-6 w-full overflow-hidden">
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
                  value={envConfig.gitlab.url}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEnvConfig(prev => ({ 
                    ...prev, 
                    gitlab: { ...prev.gitlab, url: e.target.value }
                  }))}
                  variant="bordered"
                />
                <Input
                  label="GitLab Token"
                  type="password"
                  value={pendingSensitiveData.gitlabToken || ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateSensitiveData('gitlabToken', e.target.value)}
                  variant="bordered"
                  placeholder={envConfig.gitlab.tokenSet ? '••••••••••••••••' : 'Enter your GitLab token'}
                  description={envConfig.gitlab.tokenSet ? 'Token is configured (enter new token to update)' : 'Your GitLab personal access token'}
                />
              </div>
              <Input
                label="Allowed GitLab Hosts"
                value={envConfig.gitlab.allowedHosts.join(', ')}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEnvConfig(prev => ({ 
                  ...prev, 
                  gitlab: { 
                    ...prev.gitlab, 
                    allowedHosts: e.target.value.split(',').map(h => h.trim()).filter(h => h)
                  }
                }))}
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
                  value={pendingSensitiveData.claudeApiKey || ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateSensitiveData('claudeApiKey', e.target.value)}
                  variant="bordered"
                  placeholder={envConfig.claude.apiKeySet ? '••••••••••••••••' : 'Enter your Claude API key'}
                  description={envConfig.claude.apiKeySet ? 'API key is configured (enter new key to update)' : 'Your Claude API key for AI operations'}
                />
                <Input
                  label="Claude Code Path"
                  value={envConfig.claude.codeCliPath}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEnvConfig(prev => ({ 
                    ...prev, 
                    claude: { ...prev.claude, codeCliPath: e.target.value }
                  }))}
                  variant="bordered"
                  description="Path to claude-code CLI"
                />
              </div>
            </div>

            {/* Application Settings */}
            <div>
              <h4 className="text-lg font-semibold text-success-500">Application Settings</h4>
              <Divider className="mb-4" />
              <div className="space-y-6">
                {/* API Key Generation */}
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row gap-4 items-center">
                    <Button
                      color="success"
                      onPress={generateApiKey}
                      isLoading={loading}
                      className="w-full sm:w-auto"
                      variant="flat"
                    >
                      Generate New API Key
                    </Button>
                    <p className="text-sm text-gray-600">
                      Generate a new API key for external access to this application.
                    </p>
                  </div>
                  
                  {apiKey && (
                    <div className="p-4 bg-success-50 border border-success-200 rounded-lg space-y-4">
                      <div className="flex items-center gap-2">
                        <span className="text-success-600 font-semibold">✓ API Key Generated and Saved Successfully!</span>
                      </div>
                      
                      <div className="space-y-3">
                        <Snippet
                          hideSymbol
                          variant="solid"
                          className="text-sm font-mono w-full"
                          color="default"
                          onCopy={() => navigator.clipboard.writeText(apiKey)}
                        >
                          {'••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••'}
                        </Snippet>
                        
                        <p className="text-sm text-success-700">
                          <strong>Important:</strong> Copy this key now — you won&apos;t be able to see it again for security reasons.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Save Configuration */}
            <div className="flex justify-end gap-4 pt-4">
              <Button
                color="danger"
                variant="flat"
                onPress={resetToDefaults}
              >
                Reset to Defaults
              </Button>
              <Button
                color="primary"
                onPress={handleSaveEnvConfigWithToast}
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