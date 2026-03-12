'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { addToast } from '@heroui/toast';
import { Select, SelectItem, SelectSection } from '@heroui/select';
import clsx from 'clsx';
import dynamic from 'next/dynamic';
// Components (non-tab, kept static)
import {
  CloneRepositoryModal,
  ChangePasswordModal,
  ConfirmClearApiKeyModal,
  ConfirmDeleteWorkspaceModal,
  DashboardNavigation,
} from '@/components/dashboard';
import CommandPalette from '@/components/dashboard/CommandPalette';
import type { ConnectionStatus } from '@/components/dashboard/tabs/GitSourceConfigTab';

// Dynamic imports for tab components — only loaded when the tab is first visited
function TabLoading() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-default-300 border-t-primary" />
    </div>
  );
}

const RalphBoardTab = dynamic(() => import('@/components/dashboard/tabs/RalphBoardTab'), {
  loading: TabLoading,
});
const ChatTab = dynamic(() => import('@/components/dashboard/tabs/ChatTab'), {
  loading: TabLoading,
});
const OperationsTab = dynamic(() => import('@/components/dashboard/tabs/OperationsTab'), {
  loading: TabLoading,
});
const WorkspacesTab = dynamic(() => import('@/components/dashboard/tabs/WorkspacesTab'), {
  loading: TabLoading,
});
const SettingsTab = dynamic(() => import('@/components/dashboard/tabs/SettingsTab'), {
  loading: TabLoading,
});
const GitSourceConfigTab = dynamic(() => import('@/components/dashboard/tabs/GitSourceConfigTab'), {
  loading: TabLoading,
});
const AccountSecurityTab = dynamic(() => import('@/components/dashboard/tabs/AccountSecurityTab'), {
  loading: TabLoading,
});
const ExternalTaskingHistoryTab = dynamic(
  () => import('@/components/dashboard/tabs/ExternalTaskingHistoryTab'),
  {
    loading: TabLoading,
  }
);

const dashboardTabGroups = [
  {
    key: 'main',
    title: 'Main',
    tabs: [
      { key: 'ralph-board', title: 'Ralph Board' },
      { key: 'chat', title: 'Chat' },
      { key: 'operations', title: 'Operations' },
      { key: 'external-tasking', title: 'External Tasking' },
    ],
  },
  {
    key: 'configuration',
    title: 'Configuration',
    tabs: [
      { key: 'workspaces', title: 'Workspaces' },
      { key: 'git-source', title: 'Git Source Config' },
      { key: 'settings', title: 'Environment Settings' },
      { key: 'security', title: 'Account Security' },
    ],
  },
];

// Hooks
import {
  useWorkspaces,
  useEnvironmentConfig,
  useCloneRepository,
  useClaudeOperations,
  useChangePassword,
  usePersistedState,
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

const SIDEBAR_MIN = 64;
const SIDEBAR_MAX = 400;
const SIDEBAR_COLLAPSE_THRESHOLD = 120;
const SIDEBAR_DEFAULT = 256;

export default function DashboardPage() {
  const [activeTab, setActiveTabRaw] = useState('ralph-board');
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(() => new Set(['ralph-board']));

  const setActiveTab = useCallback((tab: string) => {
    setActiveTabRaw(tab);
    setVisitedTabs((prev) => {
      if (prev.has(tab)) return prev;
      const next = new Set(prev);
      next.add(tab);
      return next;
    });
  }, []);
  const [sidebarWidth, setSidebarWidth] = usePersistedState('dashboard-sidebar-width', 256);
  const [sidebarReady, setSidebarReady] = useState(false);
  useEffect(() => setSidebarReady(true), []);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const sidebarCollapsed = sidebarWidth < SIDEBAR_COLLAPSE_THRESHOLD;
  // Drag-to-resize sidebar handlers
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragRef.current = { startX: e.clientX, startWidth: sidebarWidth };
      setIsDragging(true);
    },
    [sidebarWidth]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = e.clientX - dragRef.current.startX;
      const newWidth = Math.min(
        SIDEBAR_MAX,
        Math.max(SIDEBAR_MIN, dragRef.current.startWidth + delta)
      );
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragRef.current = null;
      // Snap to collapsed if below threshold
      setSidebarWidth((w) => (w < SIDEBAR_COLLAPSE_THRESHOLD ? SIDEBAR_MIN : w));
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    // Prevent text selection while dragging
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isDragging, setSidebarWidth]);

  const handleDragHandleDoubleClick = useCallback(() => {
    setSidebarWidth((w) => (w <= SIDEBAR_MIN ? SIDEBAR_DEFAULT : SIDEBAR_MIN));
  }, [setSidebarWidth]);

  // Command palette state
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const openPalette = useCallback(() => setIsPaletteOpen(true), []);
  const closePalette = useCallback(() => setIsPaletteOpen(false), []);

  // Cmd+K / Ctrl+K to open command palette
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

  // Navigate to a task on the Ralph board
  const handleNavigateToTask = useCallback(
    (taskId: string) => {
      setActiveTab('ralph-board');
      // Dispatch event so RalphBoardTab can open the task detail
      window.dispatchEvent(new CustomEvent('ralph:navigateToTask', { detail: { taskId } }));
    },
    [setActiveTab]
  );

  const [clearApiKeyConfirmation, setClearApiKeyConfirmation] = useState<{
    isOpen: boolean;
    keysToRemove: string[];
  }>({ isOpen: false, keysToRemove: [] });
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({});
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    workspaceId: string;
    workspaceName: string;
  }>({ isOpen: false, workspaceId: '', workspaceName: '' });

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

  // Load persisted connection test results from server on mount
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
          if (restored.github || restored.gitlab) {
            setConnectionStatus(restored);
          }
        }
      })
      .catch(() => {
        // Silently fail — badges just won't show until next test
      });
  }, []);

  // Clear connection status when a token input changes (prevents stale badges)
  const handleUpdateSensitiveData = (type: 'gitlabToken' | 'githubToken', value: string) => {
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
  };

  // Wrap setEnvConfig for GitSourceConfigTab to clear badges on username/url changes
  const handleSetEnvConfigForGitSource: typeof setEnvConfig = (action) => {
    setEnvConfig((prev) => {
      const next = typeof action === 'function' ? action(prev) : action;
      // Clear github badge if github username changed
      if (next.github.username !== prev.github.username) {
        setConnectionStatus((cs) => {
          const { github: _, ...rest } = cs;
          return rest;
        });
      }
      // Clear gitlab badge if gitlab username or url changed
      if (next.gitlab.username !== prev.gitlab.username || next.gitlab.url !== prev.gitlab.url) {
        setConnectionStatus((cs) => {
          const { gitlab: _, ...rest } = cs;
          return rest;
        });
      }
      return next;
    });
  };

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

    if (result.success) {
      toast.success(result.message);
    } else {
      toast.error(result.message);
    }
  };

  const handleCleanupWithToast = async (workspaceId?: string, all = false, deleteTasks = false) => {
    const result = await handleCleanupWorkspace(workspaceId, all, deleteTasks);
    if (result.success) {
      toast.success(result.message);
    } else {
      toast.error(result.message);
    }
  };

  const handleRequestDelete = (workspaceId: string) => {
    const workspace = workspaces.find((ws) => ws.id === workspaceId);
    const workspaceName = workspace ? getProjectDisplayName(workspace.repoUrl) : workspaceId;
    setDeleteConfirmation({ isOpen: true, workspaceId, workspaceName });
  };

  const handleConfirmDelete = async (deleteTasks: boolean) => {
    const { workspaceId } = deleteConfirmation;
    setDeleteConfirmation({ isOpen: false, workspaceId: '', workspaceName: '' });
    await handleCleanupWithToast(workspaceId, false, deleteTasks);
  };

  // Auto-test connections after saving, but only if something changed for that provider.
  // Checks server-side saved results to avoid re-testing when nothing changed.
  const autoTestConnections = async (clearedKeys: string[] = []) => {
    // Snapshot what the user actually changed before the save cleared pendingSensitiveData
    const hadPendingGithub = pendingSensitiveData.githubToken;
    const hadPendingGitlab = pendingSensitiveData.gitlabToken;

    // Fetch persisted results from server to avoid stale closure issues
    let savedResults: Record<string, unknown> = {};
    try {
      const res = await fetch('/api/config/test-connection');
      const data = await res.json();
      if (data.success && data.data) {
        savedResults = data.data;
      }
    } catch {
      // If fetch fails, test everything to be safe
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
      autoTestConnections();
    } else {
      toast.error(result.message);
    }
  };

  const handleConfirmClearApiKeys = async () => {
    // User confirmed clearing, proceed with save
    const keysBeingCleared = clearApiKeyConfirmation.keysToRemove;
    const result = await saveEnvironmentConfig();
    setClearApiKeyConfirmation({ isOpen: false, keysToRemove: [] });

    if (result.success) {
      toast.success(result.message);
      autoTestConnections(keysBeingCleared);
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

  const handleTestConnection = async (provider: 'github' | 'gitlab') => {
    setConnectionStatus((prev) => ({
      ...prev,
      [provider]: { testing: true },
    }));

    try {
      const body: { provider: string; token?: string; gitlabUrl?: string } = { provider };

      // Send the pending (unsaved) token if one has been typed
      if (provider === 'github' && pendingSensitiveData.githubToken) {
        body.token = pendingSensitiveData.githubToken;
      } else if (provider === 'gitlab' && pendingSensitiveData.gitlabToken) {
        body.token = pendingSensitiveData.gitlabToken;
      }

      // For GitLab, send the current URL from the form
      if (provider === 'gitlab') {
        body.gitlabUrl = envConfig.gitlab.url;
      }

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
          [provider]: { testing: false, result: { username, mismatch } },
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
          [provider]: { testing: false, result: { error: data.error } },
        }));
        toast.error(data.error || 'Connection test failed');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection test failed';
      setConnectionStatus((prev) => ({
        ...prev,
        [provider]: { testing: false, result: { error: message } },
      }));
      toast.error(message);
    }
  };

  const loading =
    workspacesLoading || envLoading || cloneLoading || claudeLoading || changePasswordLoading;

  return (
    <>
      {/* Left Sidebar - Fixed */}
      <aside
        className={clsx(
          'fixed left-0 top-0 bottom-0 hidden overflow-hidden bg-background border-r border-divider/60 lg:block',
          !isDragging && 'transition-[width] duration-200 ease-in-out',
          !sidebarReady && 'invisible'
        )}
        style={{ width: sidebarWidth }}
      >
        <div className="h-full py-6 px-3">
          <DashboardNavigation
            activeTab={activeTab}
            onTabChange={setActiveTab}
            collapsed={sidebarCollapsed}
            onOpenPalette={openPalette}
          />
        </div>
        {/* Drag handle */}
        <div
          className="absolute top-0 right-0 w-2 h-full cursor-col-resize group/handle flex items-center justify-center"
          onMouseDown={handleDragStart}
          onDoubleClick={handleDragHandleDoubleClick}
        >
          {/* Track line */}
          <div className="absolute inset-y-0 right-0 w-px bg-transparent group-hover/handle:bg-primary/30 transition-colors" />
          {/* Grip dots */}
          <div className="flex flex-col gap-1 opacity-0 group-hover/handle:opacity-100 transition-opacity z-10">
            <div className="w-1 h-1 rounded-full bg-default-400" />
            <div className="w-1 h-1 rounded-full bg-default-400" />
            <div className="w-1 h-1 rounded-full bg-default-400" />
            <div className="w-1 h-1 rounded-full bg-default-400" />
            <div className="w-1 h-1 rounded-full bg-default-400" />
          </div>
        </div>
      </aside>

      {/* Main Content Area - scrolls independently */}
      <div
        className={clsx(
          'h-full overflow-hidden lg:[padding-left:var(--sidebar-width)]',
          !isDragging && 'lg:transition-[padding] lg:duration-200 lg:ease-in-out'
        )}
        style={{ '--sidebar-width': `${sidebarWidth}px` } as React.CSSProperties}
      >
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
              {dashboardTabGroups.map((group) => (
                <SelectSection key={group.key} title={group.title}>
                  {group.tabs.map((tab) => (
                    <SelectItem key={tab.key}>{tab.title}</SelectItem>
                  ))}
                </SelectSection>
              ))}
            </Select>
          </div>

          <div className="relative min-h-[50vh]">
            <div style={{ display: activeTab === 'ralph-board' ? undefined : 'none' }}>
              {visitedTabs.has('ralph-board') && <RalphBoardTab isPaletteOpen={isPaletteOpen} />}
            </div>

            <div style={{ display: activeTab === 'chat' ? undefined : 'none' }}>
              {visitedTabs.has('chat') && <ChatTab />}
            </div>

            <div style={{ display: activeTab === 'operations' ? undefined : 'none' }}>
              {visitedTabs.has('operations') && (
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
            </div>

            <div style={{ display: activeTab === 'external-tasking' ? undefined : 'none' }}>
              {visitedTabs.has('external-tasking') && (
                <ExternalTaskingHistoryTab
                  workspaces={workspaces}
                  getProjectDisplayName={getProjectDisplayName}
                />
              )}
            </div>

            <div style={{ display: activeTab === 'workspaces' ? undefined : 'none' }}>
              {visitedTabs.has('workspaces') && (
                <WorkspacesTab
                  workspaces={workspaces}
                  loading={workspacesLoading}
                  onRefreshWorkspaces={loadWorkspaces}
                  onOpenCloneModal={() => setIsCloneModalOpen(true)}
                  onDeleteWorkspace={handleRequestDelete}
                  getProjectDisplayName={getProjectDisplayName}
                />
              )}
            </div>

            <div style={{ display: activeTab === 'git-source' ? undefined : 'none' }}>
              {visitedTabs.has('git-source') && (
                <GitSourceConfigTab
                  envConfig={envConfig}
                  setEnvConfig={handleSetEnvConfigForGitSource}
                  pendingSensitiveData={pendingSensitiveData}
                  updateSensitiveData={handleUpdateSensitiveData}
                  loading={loading}
                  onSaveConfig={handleSaveEnvConfigWithToast}
                  connectionStatus={connectionStatus}
                />
              )}
            </div>

            <div style={{ display: activeTab === 'settings' ? undefined : 'none' }}>
              {visitedTabs.has('settings') && (
                <SettingsTab
                  envConfig={envConfig}
                  setEnvConfig={setEnvConfig}
                  loading={loading}
                  onSaveConfig={handleSaveEnvConfigWithToast}
                  onResetToDefaults={resetToDefaults}
                />
              )}
            </div>

            <div style={{ display: activeTab === 'security' ? undefined : 'none' }}>
              {visitedTabs.has('security') && (
                <AccountSecurityTab
                  onOpenChangePassword={() => setIsChangePasswordModalOpen(true)}
                />
              )}
            </div>
          </div>
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
        hasGitHubToken={!!envConfig.github.tokenSet}
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

      <ConfirmDeleteWorkspaceModal
        isOpen={deleteConfirmation.isOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteConfirmation({ isOpen: false, workspaceId: '', workspaceName: '' });
          }
        }}
        workspaceName={deleteConfirmation.workspaceName}
        onConfirm={handleConfirmDelete}
        loading={workspacesLoading}
      />

      <CommandPalette
        isOpen={isPaletteOpen}
        onClose={closePalette}
        onTabChange={(tab) => {
          setActiveTab(tab);
          closePalette();
        }}
        onNavigateToTask={(taskId) => {
          handleNavigateToTask(taskId);
          closePalette();
        }}
      />
    </>
  );
}
