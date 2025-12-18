'use client';

import React from 'react';
import { Button } from '@heroui/button';
import { Input } from '@heroui/input';
import { GitBranch, ExternalLink } from 'lucide-react';
import { Divider } from '@heroui/divider';
import { ClientSafeAppConfig } from '@/lib/types/index';
import { LabelWithTooltip } from '@/components/LabelWithTooltip';

interface GitSourceConfigTabProps {
  envConfig: ClientSafeAppConfig;
  setEnvConfig: React.Dispatch<React.SetStateAction<ClientSafeAppConfig>>;
  pendingSensitiveData: {
    gitlabToken?: string;
  };
  updateSensitiveData: (type: 'gitlabToken' | 'claudeApiKey', value: string) => void;
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
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold flex items-center gap-2">
          <GitBranch className="w-6 h-6 text-primary-500" />
          Git Source Config
        </h2>
        <Button color="primary" size="sm" onClick={onSaveConfig} isLoading={loading}>
          Save Configuration
        </Button>
      </div>

      {/* GitLab Configuration */}
      <section className="flex flex-col gap-6">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-primary-500">GitLab Connection</h3>
          <Divider />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
              placeholder="your-gitlab-username"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-default-700">
              <LabelWithTooltip
                label="GitLab Personal Access Token"
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
            />
          </div>
        </div>
      </section>

      {/* Git Identity (for commits) */}
      <section className="flex flex-col gap-6">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-primary-500">Git Identity (for commits)</h3>
          <Divider />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
              placeholder="you@example.com"
            />
          </div>
        </div>
      </section>

      {/* Bot User Setup Guide */}
      <section className="flex flex-col gap-4">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-purple-500">Bot User Setup</h3>
          <Divider />
        </div>
        <div className="space-y-4">
          <p className="text-sm text-foreground-600 dark:text-foreground-400">
            For automation tasks like creating merge requests, you&apos;ll need a dedicated bot
            account on GitLab.com.
          </p>

          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium text-foreground mb-1">1. Create the Bot Account</p>
              <ul className="text-sm text-foreground-500 list-disc list-inside space-y-1 ml-2">
                <li>
                  Go to{' '}
                  <a
                    href="https://gitlab.com/users/sign_up"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-500 hover:underline"
                  >
                    gitlab.com/users/sign_up
                  </a>
                </li>
                <li>
                  Register with a dedicated email (e.g.,{' '}
                  <code className="bg-default-200 dark:bg-default-100 px-1 rounded text-foreground-600">
                    yourproject-bot@yourdomain.com
                  </code>
                  )
                </li>
                <li>
                  Use a clear username like{' '}
                  <code className="bg-default-200 dark:bg-default-100 px-1 rounded text-foreground-600">
                    yourproject-bot
                  </code>
                </li>
                <li>Verify the email and complete account setup</li>
              </ul>
            </div>

            <div>
              <p className="text-sm font-medium text-foreground mb-1">2. Generate Access Token</p>
              <ul className="text-sm text-foreground-500 list-disc list-inside space-y-1 ml-2">
                <li>Log in as the bot account</li>
                <li>
                  Go to <strong>Edit Profile</strong> → <strong>Access Tokens</strong>
                </li>
                <li>
                  Create a token with{' '}
                  <code className="bg-default-200 dark:bg-default-100 px-1 rounded text-foreground-600">
                    api
                  </code>{' '}
                  scope (full API access)
                </li>
                <li>Set an expiration date and save the token securely</li>
              </ul>
            </div>

            <div>
              <p className="text-sm font-medium text-foreground mb-1">
                3. Add Bot to Your Projects
              </p>
              <ul className="text-sm text-foreground-500 list-disc list-inside space-y-1 ml-2">
                <li>
                  Go to your project → <strong>Manage</strong> → <strong>Members</strong>
                </li>
                <li>
                  Invite the bot user with <strong>Developer</strong> or <strong>Maintainer</strong>{' '}
                  role
                </li>
                <li>Developer can create MRs; Maintainer can also merge them</li>
              </ul>
            </div>
          </div>

          <div className="text-sm text-default-600">
            <p>
              <strong>Tip:</strong> Store the bot account credentials securely. Use a password
              manager and consider setting up 2FA with backup codes for recovery.
            </p>
          </div>

          <div className="flex gap-4">
            <a
              href="https://gitlab.com/users/sign_up"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary-600 hover:underline"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Create GitLab Account
            </a>
            <a
              href="https://docs.gitlab.com/ee/user/profile/personal_access_tokens.html"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary-600 hover:underline"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Access Token Docs
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
