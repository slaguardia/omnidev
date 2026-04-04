'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Select, SelectItem, SelectSection } from '@heroui/select';
import clsx from 'clsx';
import { usePersistedState } from '@/hooks';
import {
  CloneRepositoryModal,
  ChangePasswordModal,
  ConfirmClearApiKeyModal,
  ConfirmDeleteWorkspaceModal,
  DashboardNavigation,
} from '@/components/dashboard';
import CommandPalette from '@/components/dashboard/CommandPalette';
import { useDashboard } from '@/components/dashboard/DashboardContext';

const SIDEBAR_MIN = 64;
const SIDEBAR_MAX = 400;
const SIDEBAR_COLLAPSE_THRESHOLD = 120;
const SIDEBAR_DEFAULT = 256;

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

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const activeTab = pathname.split('/')[2] || 'ralph-board';

  const ctx = useDashboard();

  // ---- Sidebar resize ----
  const [sidebarWidth, setSidebarWidth] = usePersistedState('dashboard-sidebar-width', 256);
  const [sidebarReady, setSidebarReady] = useState(false);
  useEffect(() => setSidebarReady(true), []);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const sidebarCollapsed = sidebarWidth < SIDEBAR_COLLAPSE_THRESHOLD;

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
      setSidebarWidth((w) => (w < SIDEBAR_COLLAPSE_THRESHOLD ? SIDEBAR_MIN : w));
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
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
          <DashboardNavigation collapsed={sidebarCollapsed} onOpenPalette={ctx.openPalette} />
        </div>
        {/* Drag handle */}
        <div
          className="absolute top-0 right-0 w-2 h-full cursor-col-resize group/handle flex items-center justify-center"
          onMouseDown={handleDragStart}
          onDoubleClick={handleDragHandleDoubleClick}
        >
          <div className="absolute inset-y-0 right-0 w-px bg-transparent group-hover/handle:bg-primary/30 transition-colors" />
          <div className="flex flex-col gap-1 opacity-0 group-hover/handle:opacity-100 transition-opacity z-10">
            <div className="w-1 h-1 rounded-full bg-default-400" />
            <div className="w-1 h-1 rounded-full bg-default-400" />
            <div className="w-1 h-1 rounded-full bg-default-400" />
            <div className="w-1 h-1 rounded-full bg-default-400" />
            <div className="w-1 h-1 rounded-full bg-default-400" />
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div
        className={clsx(
          'h-full overflow-hidden lg:[padding-left:var(--sidebar-width)]',
          !isDragging && 'lg:transition-[padding] lg:duration-200 lg:ease-in-out'
        )}
        style={{ '--sidebar-width': `${sidebarWidth}px` } as React.CSSProperties}
      >
        <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8 h-full overflow-y-auto [scrollbar-gutter:stable]">
          {/* Mobile Navigation */}
          <div className="lg:hidden mb-6">
            <Select
              label="Navigate to"
              labelPlacement="outside"
              selectedKeys={[activeTab]}
              onChange={(e) => router.push(`/dashboard/${e.target.value}`)}
              classNames={{ trigger: 'bg-content2/60' }}
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

          <div className="relative min-h-[50vh]">{children}</div>
        </main>
      </div>

      {/* Modals */}
      <CloneRepositoryModal
        isOpen={ctx.isCloneModalOpen}
        onOpenChange={ctx.setIsCloneModalOpen}
        onClone={ctx.handleCloneWithToast}
        cloneForm={ctx.cloneForm}
        setCloneForm={ctx.setCloneForm}
        loading={ctx.loading}
        hasCredentials={!!(ctx.envConfig.gitlab.username && ctx.envConfig.gitlab.tokenSet)}
        hasGitHubToken={!!ctx.envConfig.github.tokenSet}
      />

      <ChangePasswordModal
        isOpen={ctx.isChangePasswordModalOpen}
        onOpenChange={(open) => {
          if (!open) ctx.closeChangePasswordModal();
          else ctx.setIsChangePasswordModalOpen(true);
        }}
        onChangePassword={ctx.handleChangePasswordWithToast}
        form={ctx.changePasswordForm}
        setForm={ctx.setChangePasswordForm}
        loading={ctx.changePasswordLoading}
      />

      <ConfirmClearApiKeyModal
        isOpen={ctx.clearApiKeyConfirmation.isOpen}
        onOpenChange={(open) => {
          if (!open) ctx.setClearApiKeyConfirmation({ isOpen: false, keysToRemove: [] });
        }}
        keysToRemove={ctx.clearApiKeyConfirmation.keysToRemove}
        onConfirm={ctx.handleConfirmClearApiKeys}
        loading={ctx.envLoading}
      />

      <ConfirmDeleteWorkspaceModal
        isOpen={ctx.deleteConfirmation.isOpen}
        onOpenChange={(open) => {
          if (!open)
            ctx.setDeleteConfirmation({ isOpen: false, workspaceId: '', workspaceName: '' });
        }}
        workspaceName={ctx.deleteConfirmation.workspaceName}
        onConfirm={ctx.handleConfirmDelete}
        loading={ctx.workspacesLoading}
      />

      <CommandPalette isOpen={ctx.isPaletteOpen} onClose={ctx.closePalette} />
    </>
  );
}
