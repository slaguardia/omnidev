'use client';

import React from 'react';
import { Button } from '@heroui/button';
import { Input } from '@heroui/input';
import { Workspace, GitConfigForm } from '@/lib/dashboard/types';

interface GitConfigModalProps {
  workspace: Workspace | null;
  onClose: () => void;
  onSave: (workspaceId: string) => Promise<void>;
  gitConfigForm: GitConfigForm;
  setGitConfigForm: React.Dispatch<React.SetStateAction<GitConfigForm>>;
  loading: boolean;
  getProjectDisplayName: (repoUrl: string) => string;
}

export default function GitConfigModal({
  workspace,
  onClose,
  onSave,
  gitConfigForm,
  setGitConfigForm,
  loading,
  getProjectDisplayName,
}: GitConfigModalProps) {
  if (!workspace) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Configure Git Settings</h3>
          <Button size="sm" variant="light" onClick={onClose}>
            ✕
          </Button>
        </div>

        <div className="mb-4">
          <p className="text-sm text-default-600 mb-2">
            Project: <strong>{getProjectDisplayName(workspace.repoUrl)}</strong>
          </p>
          <p className="text-xs text-default-500">
            Configure git user.name and user.email for this workspace only. This will not affect
            your global git configuration.
          </p>
        </div>

        <div className="space-y-4">
          <Input
            label="Git User Name"
            placeholder="Your Name"
            value={gitConfigForm.userName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setGitConfigForm((prev) => ({ ...prev, userName: e.target.value }))
            }
            variant="bordered"
            description="This will be used for commits in this workspace"
          />

          <Input
            label="Git User Email"
            placeholder="your.email@example.com"
            value={gitConfigForm.userEmail}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setGitConfigForm((prev) => ({ ...prev, userEmail: e.target.value }))
            }
            variant="bordered"
            description="This will be used for commits in this workspace"
          />

          <Input
            label="Signing Key (Optional)"
            placeholder="GPG key ID for commit signing"
            value={gitConfigForm.signingKey}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setGitConfigForm((prev) => ({ ...prev, signingKey: e.target.value }))
            }
            variant="bordered"
            description="Optional: GPG key for signing commits"
          />
        </div>

        <div className="flex gap-3 mt-6">
          <Button color="default" variant="flat" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            color="primary"
            className="flex-1"
            onClick={() => onSave(gitConfigForm.workspaceId)}
            isLoading={loading}
          >
            Save Configuration
          </Button>
        </div>
      </div>
    </div>
  );
}
