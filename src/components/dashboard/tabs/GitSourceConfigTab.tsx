'use client';

import React from 'react';
import { Button } from '@heroui/button';
import { Input } from '@heroui/input';
import { GitBranch, ExternalLink, Globe, User, BookOpen } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@heroui/card';
import { ClientSafeAppConfig } from '@/lib/types/index';
import { LabelWithTooltip } from '@/components/LabelWithTooltip';

interface GitSourceConfigTabProps {
  envConfig: ClientSafeAppConfig;
  setEnvConfig: React.Dispatch<React.SetStateAction<ClientSafeAppConfig>>;
  pendingSensitiveData: {
    gitlabToken?: string;
    githubToken?: string;
  };
  updateSensitiveData: (
    type: 'gitlabToken' | 'githubToken' | 'claudeApiKey',
    value: string
  ) => void;
  loading: boolean;
  onSaveConfig: () => void;
}

export default function GitSourceConfigTab({
  envConfig,
  setEnvConfig,
  pendingSensitiveData,
  updateSensitiveData,
  loading,
  onSaveConfig,
}: GitSourceConfigTabProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold flex items-center gap-2">
          <GitBranch className="w-6 h-6 text-default-500" />
          Git Source Config
        </h2>
        <Button color="primary" size="sm" onClick={onSaveConfig} isLoading={loading}>
          Save Configuration
        </Button>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* GitLab Connection Card */}
        <Card className="glass-card-static">
          <CardHeader className="px-4 py-3">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-default-500" />
              <h3 className="font-semibold text-default-700 dark:text-default-500">
                GitLab Connection
              </h3>
            </div>
          </CardHeader>
          <CardBody className="px-4 py-5 space-y-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-default-700">
                <LabelWithTooltip
                  label="GitLab URL"
                  tooltip="Base URL for your GitLab instance (e.g. https://gitlab.com)"
                />
              </label>
              <Input
                value={envConfig.gitlab.url}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setEnvConfig((prev) => ({
                    ...prev,
                    gitlab: { ...prev.gitlab, url: e.target.value },
                  }))
                }
                variant="bordered"
                size="sm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-default-700">
                <LabelWithTooltip
                  label="GitLab Username"
                  tooltip="Used for git clone authentication"
                />
              </label>
              <Input
                value={envConfig.gitlab.username}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setEnvConfig((prev) => ({
                    ...prev,
                    gitlab: { ...prev.gitlab, username: e.target.value },
                  }))
                }
                variant="bordered"
                size="sm"
                placeholder="your-gitlab-username"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-default-700">
                <LabelWithTooltip
                  label="Personal Access Token"
                  tooltip={
                    envConfig.gitlab.tokenSet
                      ? 'Token is configured (enter new value to update)'
                      : 'Personal access token with api scope'
                  }
                />
              </label>
              <Input
                type="password"
                value={pendingSensitiveData.gitlabToken || ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  updateSensitiveData('gitlabToken', e.target.value)
                }
                variant="bordered"
                size="sm"
                placeholder={
                  envConfig.gitlab.tokenSet ? '••••••••••••••••' : 'Enter your GitLab token'
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-default-700">
                <LabelWithTooltip
                  label="Allowed GitLab Hosts"
                  tooltip="Comma-separated list of allowed hosts"
                />
              </label>
              <Input
                value={envConfig.gitlab.allowedHosts.join(', ')}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setEnvConfig((prev) => ({
                    ...prev,
                    gitlab: {
                      ...prev.gitlab,
                      allowedHosts: e.target.value
                        .split(',')
                        .map((h) => h.trim())
                        .filter((h) => h),
                    },
                  }))
                }
                variant="bordered"
                size="sm"
              />
            </div>
          </CardBody>
        </Card>

        {/* GitHub Connection Card */}
        <Card className="glass-card-static">
          <CardHeader className="px-4 py-3">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-default-500" />
              <h3 className="font-semibold text-default-700 dark:text-default-500">
                GitHub Connection
              </h3>
            </div>
          </CardHeader>
          <CardBody className="px-4 py-5 space-y-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-default-700">
                <LabelWithTooltip
                  label="GitHub Username"
                  tooltip="Used for git clone authentication"
                />
              </label>
              <Input
                value={envConfig.github.username}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setEnvConfig((prev) => ({
                    ...prev,
                    github: { ...prev.github, username: e.target.value },
                  }))
                }
                variant="bordered"
                size="sm"
                placeholder="your-github-username"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-default-700">
                <LabelWithTooltip
                  label="Personal Access Token"
                  tooltip={
                    envConfig.github.tokenSet
                      ? 'Token is configured (enter new value to update)'
                      : 'Personal access token with repo scope'
                  }
                />
              </label>
              <Input
                type="password"
                value={pendingSensitiveData.githubToken || ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  updateSensitiveData('githubToken', e.target.value)
                }
                variant="bordered"
                size="sm"
                placeholder={
                  envConfig.github.tokenSet ? '••••••••••••••••' : 'Enter your GitHub token'
                }
              />
            </div>
            <div className="pt-2">
              <a
                href="https://github.com/settings/tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Generate GitHub Token
              </a>
            </div>
          </CardBody>
        </Card>

        {/* Git Identity Card */}
        <Card className="glass-card-static">
          <CardHeader className="px-4 py-3">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-default-500" />
              <h3 className="font-semibold text-default-700 dark:text-default-500">Git Identity</h3>
            </div>
          </CardHeader>
          <CardBody className="px-4 py-5 space-y-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-default-700">
                <LabelWithTooltip
                  label="Commit Name"
                  tooltip="Used as git user.name for commits (applies to all workspaces)"
                />
              </label>
              <Input
                value={envConfig.gitlab.commitName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setEnvConfig((prev) => ({
                    ...prev,
                    gitlab: { ...prev.gitlab, commitName: e.target.value },
                  }))
                }
                variant="bordered"
                size="sm"
                placeholder="Your Name"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-default-700">
                <LabelWithTooltip
                  label="Commit Email"
                  tooltip="Used as git user.email for commits (applies to all workspaces)"
                />
              </label>
              <Input
                value={envConfig.gitlab.commitEmail}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setEnvConfig((prev) => ({
                    ...prev,
                    gitlab: { ...prev.gitlab, commitEmail: e.target.value },
                  }))
                }
                variant="bordered"
                size="sm"
                placeholder="you@example.com"
              />
            </div>
          </CardBody>
        </Card>

        {/* Bot User Setup Guide Card */}
        <Card className="glass-card-static lg:col-span-2">
          <CardHeader className="px-4 py-3">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-default-500" />
              <h3 className="font-semibold text-default-700 dark:text-default-500">
                Bot User Setup Guide
              </h3>
            </div>
          </CardHeader>
          <CardBody className="px-4 py-5">
            <div className="space-y-4">
              <p className="text-sm text-default-600">
                For automation tasks like creating merge requests, you&apos;ll need a dedicated bot
                account on GitLab.com.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-content2/60 border border-divider/50 rounded-xl space-y-2">
                  <p className="text-sm font-medium text-foreground">1. Create the Bot Account</p>
                  <ul className="text-xs text-default-500 list-disc list-inside space-y-1">
                    <li>Go to gitlab.com/users/sign_up</li>
                    <li>Register with a dedicated email</li>
                    <li>Use a clear username like yourproject-bot</li>
                  </ul>
                </div>

                <div className="p-4 bg-content2/60 border border-divider/50 rounded-xl space-y-2">
                  <p className="text-sm font-medium text-foreground">2. Generate Access Token</p>
                  <ul className="text-xs text-default-500 list-disc list-inside space-y-1">
                    <li>Log in as the bot account</li>
                    <li>Go to Edit Profile → Access Tokens</li>
                    <li>
                      Create token with <code className="bg-default-200 px-1 rounded">api</code>{' '}
                      scope
                    </li>
                  </ul>
                </div>

                <div className="p-4 bg-content2/60 border border-divider/50 rounded-xl space-y-2">
                  <p className="text-sm font-medium text-foreground">3. Add Bot to Projects</p>
                  <ul className="text-xs text-default-500 list-disc list-inside space-y-1">
                    <li>Go to project → Manage → Members</li>
                    <li>Invite bot with Developer or Maintainer role</li>
                    <li>Developer can create MRs; Maintainer can merge</li>
                  </ul>
                </div>
              </div>

              <div className="flex gap-4 pt-2">
                <a
                  href="https://gitlab.com/users/sign_up"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Create GitLab Account
                </a>
                <a
                  href="https://docs.gitlab.com/ee/user/profile/personal_access_tokens.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Access Token Docs
                </a>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
