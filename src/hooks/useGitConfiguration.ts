import { useState } from 'react';
import { GitConfigForm, Workspace } from '@/components/dashboard/types';

const initialGitConfigForm: GitConfigForm = {
  workspaceId: '',
  userEmail: '',
  userName: '',
  signingKey: ''
};

export const useGitConfiguration = () => {
  const [gitConfigForm, setGitConfigForm] = useState<GitConfigForm>(initialGitConfigForm);
  const [selectedWorkspaceForGitConfig, setSelectedWorkspaceForGitConfig] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSetGitConfig = async (workspaceId: string) => {
    if (!gitConfigForm.userEmail && !gitConfigForm.userName) {
      return { success: false, message: 'Please provide at least an email or name' };
    }

    setLoading(true);
    try {
      const response = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'setGitConfig',
          workspaceId,
          userEmail: gitConfigForm.userEmail || undefined,
          userName: gitConfigForm.userName || undefined,
          signingKey: gitConfigForm.signingKey || undefined
        })
      });

      const data = await response.json();
      if (data.success) {
        setSelectedWorkspaceForGitConfig(null);
        setGitConfigForm(initialGitConfigForm);
        return { success: true, message: 'Git configuration updated successfully' };
      } else {
        return { success: false, message: data.error || 'Failed to update git configuration' };
      }
    } catch (error) {
      return { success: false, message: 'Error updating git configuration', error };
    } finally {
      setLoading(false);
    }
  };

  const handleGetGitConfig = async (workspaceId: string, workspace: Workspace) => {
    setLoading(true);
    try {
      const response = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'getGitConfig',
          workspaceId
        })
      });

      const data = await response.json();
      if (data.success) {
        setGitConfigForm({
          workspaceId,
          userEmail: data.data.userEmail || '',
          userName: data.data.userName || '',
          signingKey: data.data.signingKey || ''
        });
        setSelectedWorkspaceForGitConfig(workspace);
        return { success: true };
      } else {
        return { success: false, message: data.error || 'Failed to get git configuration' };
      }
    } catch (error) {
      return { success: false, message: 'Error getting git configuration', error };
    } finally {
      setLoading(false);
    }
  };

  const closeGitConfigModal = () => {
    setSelectedWorkspaceForGitConfig(null);
    setGitConfigForm(initialGitConfigForm);
  };

  return {
    gitConfigForm,
    setGitConfigForm,
    selectedWorkspaceForGitConfig,
    setSelectedWorkspaceForGitConfig,
    loading,
    handleSetGitConfig,
    handleGetGitConfig,
    closeGitConfigModal
  };
}; 