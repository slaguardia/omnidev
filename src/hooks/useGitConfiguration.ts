import { useState } from 'react';
import { GitConfigForm, Workspace } from '@/lib/dashboard/types';
import { setWorkspaceGitConfig, getWorkspaceGitConfig } from '@/lib/workspace';
import type { WorkspaceId } from '@/lib/common/types';

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
      const config: { userEmail?: string; userName?: string; signingKey?: string } = {};
      if (gitConfigForm.userEmail) config.userEmail = gitConfigForm.userEmail;
      if (gitConfigForm.userName) config.userName = gitConfigForm.userName;  
      if (gitConfigForm.signingKey) config.signingKey = gitConfigForm.signingKey;

      await setWorkspaceGitConfig(workspaceId as WorkspaceId, config);

      setSelectedWorkspaceForGitConfig(null);
      setGitConfigForm(initialGitConfigForm);
      return { success: true, message: 'Git configuration updated successfully' };
    } catch (error) {
      return { success: false, message: 'Error updating git configuration', error };
    } finally {
      setLoading(false);
    }
  };

  const handleGetGitConfig = async (workspaceId: string, workspace: Workspace) => {
    setLoading(true);
    try {
      const data = await getWorkspaceGitConfig(workspaceId as WorkspaceId);
      
      setGitConfigForm({
        workspaceId,
        userEmail: data.userEmail || '',
        userName: data.userName || '',
        signingKey: data.signingKey || ''
      });
      setSelectedWorkspaceForGitConfig(workspace);
      return { success: true };
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