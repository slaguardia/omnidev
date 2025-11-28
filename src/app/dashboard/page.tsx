'use client';

import React, { useState } from 'react';
import { addToast } from '@heroui/toast';
import { Tab, Tabs } from '@heroui/tabs';
// Components
import {
  CloneRepositoryModal,
  GitConfigModal,
  WorkspacesTab,
  OperationsTab,
  SettingsTab,
} from '@/components/dashboard';

// Types
import type { Workspace } from '@/lib/dashboard/types';

// Hooks
import {
  useWorkspaces,
  useEnvironmentConfig,
  useCloneRepository,
  useClaudeOperations,
  useGitConfiguration,
} from '@/hooks';

// Utils
import { getProjectDisplayName } from '@/lib/dashboard/helpers';
import { Divider } from '@heroui/divider';

// Replace the simple toast system with HeroUI toast
const toast = {
  success: (message: string) => {
    addToast({ title: 'Success', description: message, color: 'success' });
  },
  error: (message: string) => {
    addToast({ title: 'Error', description: message, color: 'danger' });
  },
};

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState('workspaces');

  // Custom hooks
  const {
    workspaces,
    loading: workspacesLoading,
    loadWorkspaces,
    handleCleanupWorkspace,
  } = useWorkspaces();
  const {
    envConfig,
    setEnvConfig,
    pendingSensitiveData,
    updateSensitiveData,
    loading: envLoading,
    saveEnvironmentConfig,
    resetToDefaults,
  } = useEnvironmentConfig();
  const {
    cloneForm,
    setCloneForm,
    isCloneModalOpen,
    setIsCloneModalOpen,
    loading: cloneLoading,
    handleCloneRepository,
  } = useCloneRepository();
  const {
    claudeForm,
    setClaudeForm,
    claudeResponse,
    loading: claudeLoading,
    handleAskClaude,
  } = useClaudeOperations();
  const {
    gitConfigForm,
    setGitConfigForm,
    selectedWorkspaceForGitConfig,
    loading: gitConfigLoading,
    handleSetGitConfig,
    handleGetGitConfig,
    closeGitConfigModal,
  } = useGitConfiguration();

  // Handlers with toast notifications
  const handleCloneWithToast = async () => {
    const result = await handleCloneRepository();
    if (result.success) {
      toast.success(result.message);
      loadWorkspaces(); // Refresh workspaces
    } else {
      toast.error(result.message);
    }
  };

  const handleClaudeWithToast = async () => {
    const result = await handleAskClaude();
    if (result.success) {
      toast.success(result.message);
    } else {
      toast.error(result.message);
    }
  };

  const handleCleanupWithToast = async (workspaceId?: string, all = false) => {
    const result = await handleCleanupWorkspace(workspaceId, all);
    if (result.success) {
      toast.success(result.message);
    } else {
      toast.error(result.message);
    }
  };

  const handleSaveEnvConfigWithToast = async () => {
    const result = await saveEnvironmentConfig();
    if (result.success) {
      toast.success(result.message);
    } else {
      toast.error(result.message);
    }
  };

  const handleGitConfigWithToast = async (workspaceId: string, workspace: Workspace) => {
    const result = await handleGetGitConfig(workspaceId, workspace);
    if (!result.success && result.message) {
      toast.error(result.message);
    }
  };

  const handleSetGitConfigWithToast = async (workspaceId: string) => {
    const result = await handleSetGitConfig(workspaceId);
    if (result.success) {
      toast.success(result.message);
      loadWorkspaces(); // Refresh workspaces to show updated config
    } else {
      toast.error(result.message);
    }
  };

  const loading =
    workspacesLoading || envLoading || cloneLoading || claudeLoading || gitConfigLoading;

  return (
    <div className="max-w-7xl mx-auto relative mb-16 mt-8">
      {/* Blur effects for natural inset/outset */}
      <div className="absolute -inset-8 bg-gradient-to-r from-transparent via-red-50/20 to-transparent blur-xl rounded-3xl dark:via-red-950/10"></div>
      <div className="absolute -inset-4 bg-gradient-to-b from-background/60 to-background/80 rounded-2xl shadow-inner"></div>

      <div className="relative z-10 p-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">
            <span
              style={{
                background: 'linear-gradient(to right, #dc2626, #1e40af)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              Code
            </span>
            <span
              style={{
                background: 'linear-gradient(to right, #1e40af, #dc2626)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              Spider
            </span>
            <span className="text-white"> Dashboard</span>
          </h1>
          <p className="text-default-600">
            Manage your development workspaces, configure environment settings, and interact with
            Claude AI
          </p>
        </div>

        <Tabs
          selectedKey={activeTab}
          onSelectionChange={(key: React.Key) => setActiveTab(key as string)}
          className="w-full"
          variant="light"
          color="primary"
        >
          <Tab key="workspaces" title="Workspaces" />
          <Tab key="operations" title="Operations" />
          <Tab key="settings" title="Environment Config" />
        </Tabs>

        <Divider className="my-4" />

        <div className="mt-6">
          {activeTab === 'workspaces' && (
            <WorkspacesTab
              workspaces={workspaces}
              loading={loading}
              onRefreshWorkspaces={loadWorkspaces}
              onOpenCloneModal={() => setIsCloneModalOpen(true)}
              onConfigureGit={handleGitConfigWithToast}
              onDeleteWorkspace={handleCleanupWithToast}
              getProjectDisplayName={getProjectDisplayName}
            />
          )}

          {activeTab === 'operations' && (
            <OperationsTab
              workspaces={workspaces}
              claudeForm={claudeForm}
              setClaudeForm={setClaudeForm}
              claudeResponse={claudeResponse}
              loading={loading}
              onAskClaude={handleClaudeWithToast}
              getProjectDisplayName={getProjectDisplayName}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsTab
              envConfig={envConfig}
              setEnvConfig={setEnvConfig}
              pendingSensitiveData={pendingSensitiveData}
              updateSensitiveData={updateSensitiveData}
              loading={loading}
              onSaveConfig={handleSaveEnvConfigWithToast}
              onResetToDefaults={resetToDefaults}
            />
          )}
        </div>

        {/* Clone Repository Modal */}
        <CloneRepositoryModal
          isOpen={isCloneModalOpen}
          onOpenChange={setIsCloneModalOpen}
          onClone={handleCloneWithToast}
          cloneForm={cloneForm}
          setCloneForm={setCloneForm}
          loading={loading}
        />

        {/* Git Configuration Modal */}
        <GitConfigModal
          workspace={selectedWorkspaceForGitConfig}
          onClose={closeGitConfigModal}
          onSave={handleSetGitConfigWithToast}
          gitConfigForm={gitConfigForm}
          setGitConfigForm={setGitConfigForm}
          loading={loading}
          getProjectDisplayName={getProjectDisplayName}
        />
      </div>
    </div>
  );
}
