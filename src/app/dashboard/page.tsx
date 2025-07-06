'use client';

import React, { useState } from 'react';
import { Tab, Tabs } from "@heroui/tabs";
// Components
import { 
  CloneRepositoryModal, 
  GitConfigModal, 
  WorkspacesTab, 
  OperationsTab, 
  SettingsTab,
  ClaudeMDTab,
} from '@/components/dashboard';

// Types
import type { Workspace } from '@/lib/dashboard/types';

// Hooks
import { 
  useWorkspaces,
  useGitConfiguration
} from '@/hooks';

// Utils
import { Divider } from '@heroui/divider';

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState("workspaces");
  
  // Custom hooks
  const { loadWorkspaces } = useWorkspaces();
  const {
    selectedWorkspaceForGitConfig,
    closeGitConfigModal,
    handleGetGitConfig
  } = useGitConfiguration();

  // Modal states
  const [isCloneModalOpen, setIsCloneModalOpen] = useState(false);

  // Handlers for git configuration modal
  const handleGitConfigModal = async (workspaceId: string, workspace: Workspace) => {
    await handleGetGitConfig(workspaceId, workspace);
  };

  return (
    <div className="w-full max-w-4xl mx-auto relative mb-16">
      {/* Blur effects for natural inset/outset */}
      <div className="absolute -inset-8 bg-gradient-to-r from-transparent via-red-50/20 to-transparent blur-xl rounded-3xl dark:via-red-950/10"></div>
      <div className="absolute -inset-4 bg-gradient-to-b from-background/60 to-background/80 rounded-2xl shadow-inner"></div>
      
      <div className="relative z-10 p-8 w-full overflow-hidden">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">
            <span style={{ background: 'linear-gradient(to right, #dc2626, #1e40af)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              Code
            </span>
            <span style={{ background: 'linear-gradient(to right, #1e40af, #dc2626)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              Spider
            </span>
            <span className="text-white">
              {" "}Dashboard
            </span>
          </h1>
          <p className="text-default-600">
            Manage your development workspaces, configure environment settings, and interact with Claude AI
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
        <Tab key="claude" title="CLAUDE.md" />
        <Tab key="settings" title="Environment Config" />
      </Tabs>

      <Divider className="my-4" />

      <div className="mt-6 w-full min-h-[700px]">
        {activeTab === "workspaces" && (
          <WorkspacesTab
            onOpenCloneModal={() => setIsCloneModalOpen(true)}
            onConfigureGit={handleGitConfigModal}
          />
        )}

        {activeTab === "operations" && (
          <OperationsTab />
        )}
        
        {activeTab === "claude" && (
          <ClaudeMDTab />
        )}

        {activeTab === "settings" && (
          <SettingsTab />
        )}
      </div>

      {/* Clone Repository Modal */}
      <CloneRepositoryModal
        isOpen={isCloneModalOpen}
        onOpenChange={setIsCloneModalOpen}
        onCloneSuccess={loadWorkspaces}
      />

      {/* Git Configuration Modal */}
      <GitConfigModal
        workspace={selectedWorkspaceForGitConfig}
        onClose={closeGitConfigModal}
        onSaveSuccess={loadWorkspaces}
      />
    </div>
    </div>
  );
}
