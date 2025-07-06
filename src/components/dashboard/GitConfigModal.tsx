'use client';

import React from 'react';
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { addToast } from "@heroui/toast";
import { Workspace } from '@/lib/dashboard/types';
import { useGitConfiguration } from '@/hooks';
import { getProjectDisplayName } from '@/lib/dashboard/helpers';

interface GitConfigModalProps {
  workspace: Workspace | null;
  onClose: () => void;
  onSaveSuccess: () => void;
}

export default function GitConfigModal({
  workspace,
  onClose,
  onSaveSuccess
}: GitConfigModalProps) {
  const {
    gitConfigForm,
    setGitConfigForm,
    loading,
    handleSetGitConfig,
    handleGetGitConfig,
  } = useGitConfiguration();

  // Handler with toast notifications
  const handleSetGitConfigWithToast = async (workspaceId: string) => {
    const result = await handleSetGitConfig(workspaceId);
    if (result.success) {
      addToast({ title: "Success", description: result.message, color: "success" });
      onSaveSuccess(); // Refresh workspaces to show updated config
      onClose(); // Close modal
    } else {
      addToast({ title: "Error", description: result.message, color: "danger" });
    }
  };

  // Load git config when workspace changes
  React.useEffect(() => {
    if (workspace) {
      handleGetGitConfig(workspace.id, workspace);
    }
  }, [workspace, handleGetGitConfig]);

  if (!workspace) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Configure Git Settings</h3>
          <Button
            size="sm"
            variant="light"
            onPress={onClose}
          >
            ✕
          </Button>
        </div>
        
        <div className="mb-4">
          <p className="text-sm text-default-600 mb-2">
            Project: <strong>{getProjectDisplayName(workspace.repoUrl)}</strong>
          </p>
          <p className="text-xs text-default-500">
            Configure git user.name and user.email for this workspace only.
            This will not affect your global git configuration.
          </p>
        </div>

        <div className="space-y-4">
          <Input
            label="Git User Name"
            placeholder="Your Name"
            value={gitConfigForm.userName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => 
              setGitConfigForm(prev => ({ ...prev, userName: e.target.value }))
            }
            variant="bordered"
            description="This will be used for commits in this workspace"
          />
          
          <Input
            label="Git User Email"
            placeholder="your.email@example.com"
            value={gitConfigForm.userEmail}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => 
              setGitConfigForm(prev => ({ ...prev, userEmail: e.target.value }))
            }
            variant="bordered"
            description="This will be used for commits in this workspace"
          />

          <Input
            label="Signing Key (Optional)"
            placeholder="GPG key ID for commit signing"
            value={gitConfigForm.signingKey}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => 
              setGitConfigForm(prev => ({ ...prev, signingKey: e.target.value }))
            }
            variant="bordered"
            description="Optional: GPG key for signing commits"
          />
        </div>

        <div className="flex gap-3 mt-6">
          <Button
            color="default"
            variant="flat"
            className="flex-1"
            onPress={onClose}
          >
            Cancel
          </Button>
          <Button
            color="primary"
            className="flex-1"
            onPress={() => handleSetGitConfigWithToast(gitConfigForm.workspaceId)}
            isLoading={loading}
          >
            Save Configuration
          </Button>
        </div>
      </div>
    </div>
  );
} 