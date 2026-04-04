'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { addToast } from '@heroui/toast';
import {
  useWorkspaces,
  useEnvironmentConfig,
  useCloneRepository,
  useClaudeOperations,
  useChangePassword,
} from '@/hooks';
import { getProjectDisplayName } from '@/lib/dashboard/helpers';
import type { ClientSafeAppConfig } from '@/lib/types/index';
import type { Workspace, CloneForm, ClaudeForm, ChangePasswordForm } from '@/lib/dashboard/types';
import type {
  ConnectionStatus,
  ConnectionTestResult,
} from '@/components/dashboard/tabs/GitSourceConfigTab';

const toast = {
  success: (message: string) => {
    addToast({ title: 'Success', description: message, color: 'success' });
  },
  error: (message: string) => {
    addToast({ title: 'Error', description: message, color: 'danger' });
  },
};

// ---------------------------------------------------------------------------
// Context value type
// ---------------------------------------------------------------------------

export interface DashboardContextValue {
  // Workspaces
  workspaces: Workspace[];
  workspacesLoading: boolean;
  loadWorkspaces: () => void;
  handleCleanupWithToast: (
    workspaceId?: string,
    all?: boolean,
    deleteTasks?: boolean
  ) => Promise<void>;

  // Environment Config
  envConfig: ClientSafeAppConfig;
  setEnvConfig: React.Dispatch<React.SetStateAction<ClientSafeAppConfig>>;
  setEnvConfigForGitSource: React.Dispatch<React.SetStateAction<ClientSafeAppConfig>>;
  pendingSensitiveData: { gitlabToken?: string; githubToken?: string };
  updateSensitiveData: (type: 'gitlabToken' | 'githubToken', value: string) => void;
  envLoading: boolean;
  handleSaveEnvConfigWithToast: () => Promise<void>;
  resetToDefaults: () => void;

  // Connection Status
  connectionStatus: ConnectionStatus;
  handleTestConnection: (provider: 'github' | 'gitlab') => Promise<void>;

  // Clone Repository
  cloneForm: CloneForm;
  setCloneForm: React.Dispatch<React.SetStateAction<CloneForm>>;
  isCloneModalOpen: boolean;
  setIsCloneModalOpen: (open: boolean) => void;
  handleCloneWithToast: () => Promise<void>;

  // Claude Operations
  claudeForm: ClaudeForm;
  setClaudeForm: React.Dispatch<React.SetStateAction<ClaudeForm>>;
  claudeResponse: string | null;
  setClaudeResponse: (value: string | null) => void;
  claudeLoading: boolean;
  handleClaudeWithToast: (mode: 'ask' | 'edit') => Promise<void>;

  // Change Password
  changePasswordForm: ChangePasswordForm;
  setChangePasswordForm: React.Dispatch<React.SetStateAction<ChangePasswordForm>>;
  isChangePasswordModalOpen: boolean;
  setIsChangePasswordModalOpen: (open: boolean) => void;
  changePasswordLoading: boolean;
  handleChangePasswordWithToast: () => Promise<{ success: boolean; message: string }>;
  closeChangePasswordModal: () => void;

  // Delete workspace confirmation
  deleteConfirmation: { isOpen: boolean; workspaceId: string; workspaceName: string };
  handleRequestDelete: (workspaceId: string) => void;
  handleConfirmDelete: (deleteTasks: boolean) => Promise<void>;
  setDeleteConfirmation: React.Dispatch<
    React.SetStateAction<{ isOpen: boolean; workspaceId: string; workspaceName: string }>
  >;

  // Clear API key confirmation
  clearApiKeyConfirmation: { isOpen: boolean; keysToRemove: string[] };
  setClearApiKeyConfirmation: React.Dispatch<
    React.SetStateAction<{ isOpen: boolean; keysToRemove: string[] }>
  >;
  handleConfirmClearApiKeys: () => Promise<void>;

  // Command Palette
  isPaletteOpen: boolean;
  openPalette: () => void;
  closePalette: () => void;

  // Aggregated loading
  loading: boolean;

  // Helpers
  getProjectDisplayName: (repoUrl: string) => string;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function useDashboard(): DashboardContextValue {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error('useDashboard must be used within DashboardProvider');
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  // ---- Hooks ----
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

  // ---- Local state ----
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({});
  const [clearApiKeyConfirmation, setClearApiKeyConfirmation] = useState<{
    isOpen: boolean;
    keysToRemove: string[];
  }>({ isOpen: false, keysToRemove: [] });
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    workspaceId: string;
    workspaceName: string;
  }>({ isOpen: false, workspaceId: '', workspaceName: '' });
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const openPalette = useCallback(() => setIsPaletteOpen(true), []);
  const closePalette = useCallback(() => setIsPaletteOpen(false), []);

  // ---- Connection test ----
  const handleTestConnection = useCallback(
    async (provider: 'github' | 'gitlab') => {
      setConnectionStatus((prev) => ({ ...prev, [provider]: { testing: true } }));
      try {
        const body: { provider: string; token?: string; gitlabUrl?: string } = { provider };
        if (provider === 'github' && pendingSensitiveData.githubToken) {
          body.token = pendingSensitiveData.githubToken;
        } else if (provider === 'gitlab' && pendingSensitiveData.gitlabToken) {
          body.token = pendingSensitiveData.gitlabToken;
        }
        if (provider === 'gitlab') body.gitlabUrl = envConfig.gitlab.url;

        const response = await fetch('/api/config/test-connection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await response.json();

        if (data.success) {
          const username = data.data?.username as string | undefined;
          const configuredUsername =
            provider === 'github' ? envConfig.github.username : envConfig.gitlab.username;
          const mismatch = !!(configuredUsername && username && configuredUsername !== username);
          setConnectionStatus((prev) => ({
            ...prev,
            [provider]: { testing: false, result: { username, mismatch } as ConnectionTestResult },
          }));
          if (mismatch) {
            toast.error(
              `Token belongs to "${username}" but username is set to "${configuredUsername}"`
            );
          } else {
            toast.success(`Connected as ${username}`);
          }
        } else {
          setConnectionStatus((prev) => ({
            ...prev,
            [provider]: { testing: false, result: { error: data.error } as ConnectionTestResult },
          }));
          toast.error(data.error || 'Connection test failed');
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Connection test failed';
        setConnectionStatus((prev) => ({
          ...prev,
          [provider]: { testing: false, result: { error: message } as ConnectionTestResult },
        }));
        toast.error(message);
      }
    },
    [
      pendingSensitiveData,
      envConfig.gitlab.url,
      envConfig.github.username,
      envConfig.gitlab.username,
    ]
  );

  // Load persisted connection test results on mount
  useEffect(() => {
    fetch('/api/config/test-connection')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          const saved = data.data as Record<string, { username: string }>;
          const restored: ConnectionStatus = {};
          if (saved.github) {
            restored.github = { testing: false, result: { username: saved.github.username } };
          }
          if (saved.gitlab) {
            restored.gitlab = { testing: false, result: { username: saved.gitlab.username } };
          }
          if (restored.github || restored.gitlab) setConnectionStatus(restored);
        }
      })
      .catch(() => {});
  }, []);

  // ---- Sensitive data update (clears connection badges) ----
  const handleUpdateSensitiveData = useCallback(
    (type: 'gitlabToken' | 'githubToken', value: string) => {
      updateSensitiveData(type, value);
      if (type === 'githubToken') {
        setConnectionStatus((prev) => {
          const { github: _, ...rest } = prev;
          return rest;
        });
      } else if (type === 'gitlabToken') {
        setConnectionStatus((prev) => {
          const { gitlab: _, ...rest } = prev;
          return rest;
        });
      }
    },
    [updateSensitiveData]
  );

  // ---- Git source config wrapper (clears badges on username/url change) ----
  const setEnvConfigForGitSource: typeof setEnvConfig = useCallback(
    (action) => {
      setEnvConfig((prev) => {
        const next = typeof action === 'function' ? action(prev) : action;
        if (next.github.username !== prev.github.username) {
          setConnectionStatus((cs) => {
            const { github: _, ...rest } = cs;
            return rest;
          });
        }
        if (next.gitlab.username !== prev.gitlab.username || next.gitlab.url !== prev.gitlab.url) {
          setConnectionStatus((cs) => {
            const { gitlab: _, ...rest } = cs;
            return rest;
          });
        }
        return next;
      });
    },
    [setEnvConfig]
  );

  // ---- Auto-test connections after saving ----
  const autoTestConnections = useCallback(
    async (clearedKeys: string[] = []) => {
      const hadPendingGithub = pendingSensitiveData.githubToken;
      const hadPendingGitlab = pendingSensitiveData.gitlabToken;

      let savedResults: Record<string, unknown> = {};
      try {
        const res = await fetch('/api/config/test-connection');
        const data = await res.json();
        if (data.success && data.data) savedResults = data.data;
      } catch {
        // test everything to be safe
      }

      if (
        !clearedKeys.includes('githubToken') &&
        (hadPendingGithub || !savedResults.github) &&
        (hadPendingGithub || envConfig.github.tokenSet)
      ) {
        handleTestConnection('github');
      }
      if (
        !clearedKeys.includes('gitlabToken') &&
        (hadPendingGitlab || !savedResults.gitlab) &&
        (hadPendingGitlab || envConfig.gitlab.tokenSet)
      ) {
        handleTestConnection('gitlab');
      }
    },
    [
      pendingSensitiveData,
      envConfig.github.tokenSet,
      envConfig.gitlab.tokenSet,
      handleTestConnection,
    ]
  );

  // ---- Toast-wrapped handlers ----
  const handleCloneWithToast = useCallback(async () => {
    const result = await handleCloneRepository();
    if (result.success) {
      toast.success(result.message);
      loadWorkspaces();
    } else {
      toast.error(result.message);
    }
  }, [handleCloneRepository, loadWorkspaces]);

  const handleClaudeWithToast = useCallback(
    async (mode: 'ask' | 'edit') => {
      const result = mode === 'edit' ? await handleEditClaude() : await handleAskClaude();
      if (result.success) toast.success(result.message);
      else toast.error(result.message);
    },
    [handleAskClaude, handleEditClaude]
  );

  const handleCleanupWithToast = useCallback(
    async (workspaceId?: string, all = false, deleteTasks = false) => {
      const result = await handleCleanupWorkspace(workspaceId, all, deleteTasks);
      if (result.success) toast.success(result.message);
      else toast.error(result.message);
    },
    [handleCleanupWorkspace]
  );

  const handleSaveEnvConfigWithToast = useCallback(async () => {
    const changes = getApiKeyChanges();
    if (changes.clearing.length > 0) {
      setClearApiKeyConfirmation({ isOpen: true, keysToRemove: changes.clearing });
      return;
    }
    const result = await saveEnvironmentConfig();
    if (result.success) {
      toast.success(result.message);
      autoTestConnections();
    } else {
      toast.error(result.message);
    }
  }, [getApiKeyChanges, saveEnvironmentConfig, autoTestConnections]);

  const handleConfirmClearApiKeys = useCallback(async () => {
    const keysBeingCleared = clearApiKeyConfirmation.keysToRemove;
    const result = await saveEnvironmentConfig();
    setClearApiKeyConfirmation({ isOpen: false, keysToRemove: [] });
    if (result.success) {
      toast.success(result.message);
      autoTestConnections(keysBeingCleared);
    } else {
      toast.error(result.message);
    }
  }, [clearApiKeyConfirmation, saveEnvironmentConfig, autoTestConnections]);

  const handleChangePasswordWithToast = useCallback(async () => {
    const result = await handleChangePassword();
    if (result.success) toast.success(result.message);
    else toast.error(result.message);
    return result;
  }, [handleChangePassword]);

  const handleRequestDelete = useCallback(
    (workspaceId: string) => {
      const workspace = workspaces.find((ws) => ws.id === workspaceId);
      const workspaceName = workspace ? getProjectDisplayName(workspace.repoUrl) : workspaceId;
      setDeleteConfirmation({ isOpen: true, workspaceId, workspaceName });
    },
    [workspaces]
  );

  const handleConfirmDelete = useCallback(
    async (deleteTasks: boolean) => {
      const { workspaceId } = deleteConfirmation;
      setDeleteConfirmation({ isOpen: false, workspaceId: '', workspaceName: '' });
      await handleCleanupWithToast(workspaceId, false, deleteTasks);
    },
    [deleteConfirmation, handleCleanupWithToast]
  );

  const loading =
    workspacesLoading || envLoading || cloneLoading || claudeLoading || changePasswordLoading;

  // ---- Cmd+K keyboard shortcut ----
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsPaletteOpen(true);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const value: DashboardContextValue = {
    workspaces,
    workspacesLoading,
    loadWorkspaces,
    handleCleanupWithToast,
    envConfig,
    setEnvConfig,
    setEnvConfigForGitSource,
    pendingSensitiveData,
    updateSensitiveData: handleUpdateSensitiveData,
    envLoading,
    handleSaveEnvConfigWithToast,
    resetToDefaults,
    connectionStatus,
    handleTestConnection,
    cloneForm,
    setCloneForm,
    isCloneModalOpen,
    setIsCloneModalOpen,
    handleCloneWithToast,
    claudeForm,
    setClaudeForm,
    claudeResponse,
    setClaudeResponse,
    claudeLoading,
    handleClaudeWithToast,
    changePasswordForm,
    setChangePasswordForm,
    isChangePasswordModalOpen,
    setIsChangePasswordModalOpen,
    changePasswordLoading,
    handleChangePasswordWithToast,
    closeChangePasswordModal,
    deleteConfirmation,
    handleRequestDelete,
    handleConfirmDelete,
    setDeleteConfirmation,
    clearApiKeyConfirmation,
    setClearApiKeyConfirmation,
    handleConfirmClearApiKeys,
    isPaletteOpen,
    openPalette,
    closePalette,
    loading,
    getProjectDisplayName,
  };

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}
