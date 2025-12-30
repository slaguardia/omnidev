'use client';

import React, { useState } from 'react';
import { addToast } from '@heroui/toast';
import { Select, SelectItem } from '@heroui/select';
// Components
import {
  CloneRepositoryModal,
  ChangePasswordModal,
  ConfirmClearApiKeyModal,
  DashboardNavigation,
  WorkspacesTab,
  OperationsTab,
  SnippetsTab,
  SettingsTab,
  GitSourceConfigTab,
  AccountSecurityTab,
  ExecutionHistoryTab,
  QueueTab,
} from '@/components/dashboard';
import { motion, AnimatePresence } from '@/components/motion';

const dashboardTabs = [
  { key: 'workspaces', title: 'Workspaces' },
  { key: 'operations', title: 'Operations' },
  { key: 'queue', title: 'Request Queue' },
  { key: 'history', title: 'Execution History' },
  { key: 'git-source', title: 'Git Source Config' },
  { key: 'snippets', title: 'Snippets' },
  { key: 'settings', title: 'Environment Settings' },
  { key: 'security', title: 'Account Security' },
];

// Hooks
import {
  useWorkspaces,
  useEnvironmentConfig,
  useCloneRepository,
  useClaudeOperations,
  useChangePassword,
  useExecutionHistory,
} from '@/hooks';

// Utils
import { getProjectDisplayName } from '@/lib/dashboard/helpers';

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
  const [clearApiKeyConfirmation, setClearApiKeyConfirmation] = useState<{
    isOpen: boolean;
    keysToRemove: string[];
  }>({ isOpen: false, keysToRemove: [] });

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
    getApiKeyChanges,
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
    handleEditClaude,
    setClaudeResponse,
  } = useClaudeOperations();
  const {
    form: changePasswordForm,
    setForm: setChangePasswordForm,
    isModalOpen: isChangePasswordModalOpen,
    setIsModalOpen: setIsChangePasswordModalOpen,
    loading: changePasswordLoading,
    handleChangePassword,
    closeModal: closeChangePasswordModal,
  } = useChangePassword();
  const {
    history: executionHistory,
    loading: historyLoading,
    loadHistory,
    deleteExecution,
    clearHistory,
  } = useExecutionHistory();

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

  const handleClaudeWithToast = async (mode: 'ask' | 'edit') => {
    const result = mode === 'edit' ? await handleEditClaude() : await handleAskClaude();

    // History is now derived from finished jobs automatically
    // No need to manually save execution history here

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
    // Check if user is about to clear any API keys
    const changes = getApiKeyChanges();

    if (changes.clearing.length > 0) {
      // Show confirmation modal before saving
      setClearApiKeyConfirmation({
        isOpen: true,
        keysToRemove: changes.clearing,
      });
      return;
    }

    // No API keys being cleared, save directly
    const result = await saveEnvironmentConfig();
    if (result.success) {
      toast.success(result.message);
    } else {
      toast.error(result.message);
    }
  };

  const handleConfirmClearApiKeys = async () => {
    // User confirmed clearing, proceed with save
    const result = await saveEnvironmentConfig();
    setClearApiKeyConfirmation({ isOpen: false, keysToRemove: [] });

    if (result.success) {
      toast.success(result.message);
    } else {
      toast.error(result.message);
    }
  };

  const handleChangePasswordWithToast = async () => {
    const result = await handleChangePassword();
    if (result.success) {
      toast.success(result.message);
    } else {
      toast.error(result.message);
    }
    return result;
  };

  const loading =
    workspacesLoading ||
    envLoading ||
    cloneLoading ||
    claudeLoading ||
    changePasswordLoading ||
    historyLoading;

  return (
    <>
      {/* Left Sidebar - Fixed */}
      <aside className="fixed left-0 top-16 bottom-0 hidden w-64 overflow-y-auto bg-background/70 backdrop-blur border-r border-divider/60 lg:block xl:w-72">
        <div className="p-6">
          <DashboardNavigation activeTab={activeTab} onTabChange={setActiveTab} />
        </div>
      </aside>

      {/* Main Content Area - scrolls independently */}
      <div className="lg:pl-64 xl:pl-72 h-[calc(100vh-4rem)] overflow-hidden">
        <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8 h-full overflow-y-auto">
          {/* Mobile Navigation */}
          <div className="lg:hidden mb-6">
            <Select
              label="Navigate to"
              labelPlacement="outside"
              selectedKeys={[activeTab]}
              onChange={(e) => setActiveTab(e.target.value)}
              classNames={{
                trigger: 'bg-content2/60',
              }}
            >
              {dashboardTabs.map((tab) => (
                <SelectItem key={tab.key}>{tab.title}</SelectItem>
              ))}
            </Select>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {activeTab === 'workspaces' && (
                <WorkspacesTab
                  workspaces={workspaces}
                  loading={workspacesLoading}
                  onRefreshWorkspaces={loadWorkspaces}
                  onOpenCloneModal={() => setIsCloneModalOpen(true)}
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
                  setClaudeResponse={setClaudeResponse}
                  loading={loading}
                  onRunClaude={handleClaudeWithToast}
                  getProjectDisplayName={getProjectDisplayName}
                />
              )}

              {activeTab === 'queue' && <QueueTab />}

              {activeTab === 'history' && (
                <ExecutionHistoryTab
                  history={executionHistory}
                  loading={historyLoading}
                  onRefresh={loadHistory}
                  onDelete={deleteExecution}
                  onClearAll={clearHistory}
                />
              )}

              {activeTab === 'git-source' && (
                <GitSourceConfigTab
                  envConfig={envConfig}
                  setEnvConfig={setEnvConfig}
                  pendingSensitiveData={pendingSensitiveData}
                  updateSensitiveData={updateSensitiveData}
                  loading={loading}
                  onSaveConfig={handleSaveEnvConfigWithToast}
                />
              )}

              {activeTab === 'snippets' && (
                <SnippetsTab
                  workspaces={workspaces}
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

              {activeTab === 'security' && (
                <AccountSecurityTab
                  onOpenChangePassword={() => setIsChangePasswordModalOpen(true)}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Modals */}
      <CloneRepositoryModal
        isOpen={isCloneModalOpen}
        onOpenChange={setIsCloneModalOpen}
        onClone={handleCloneWithToast}
        cloneForm={cloneForm}
        setCloneForm={setCloneForm}
        loading={loading}
        hasCredentials={!!(envConfig.gitlab.username && envConfig.gitlab.tokenSet)}
      />

      <ChangePasswordModal
        isOpen={isChangePasswordModalOpen}
        onOpenChange={(open) => {
          if (!open) closeChangePasswordModal();
          else setIsChangePasswordModalOpen(true);
        }}
        onChangePassword={handleChangePasswordWithToast}
        form={changePasswordForm}
        setForm={setChangePasswordForm}
        loading={changePasswordLoading}
      />

      <ConfirmClearApiKeyModal
        isOpen={clearApiKeyConfirmation.isOpen}
        onOpenChange={(open) => {
          if (!open) {
            setClearApiKeyConfirmation({ isOpen: false, keysToRemove: [] });
          }
        }}
        keysToRemove={clearApiKeyConfirmation.keysToRemove}
        onConfirm={handleConfirmClearApiKeys}
        loading={envLoading}
      />
    </>
  );
}
