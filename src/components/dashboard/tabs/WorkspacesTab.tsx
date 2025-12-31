'use client';

import React, { useState } from 'react';
import { Button } from '@heroui/button';
import { Snippet } from '@heroui/snippet';
import { addToast } from '@heroui/toast';
import { Card, CardBody, CardHeader } from '@heroui/card';
import { Chip } from '@heroui/chip';
import { Skeleton } from '@heroui/skeleton';
import {
  GitBranch,
  FolderOpen,
  Trash2,
  Clock,
  Hash,
  Lock,
  AlertTriangle,
  Shield,
  Settings,
} from 'lucide-react';
import { Tooltip } from '@heroui/tooltip';
import { motion, AnimatePresence } from 'framer-motion';
import { Workspace } from '@/lib/dashboard/types';
import WorkspaceDetailModal from '@/components/dashboard/WorkspaceDetailModal';

interface WorkspacesTabProps {
  workspaces: Workspace[];
  loading: boolean;
  onRefreshWorkspaces: () => void;
  onOpenCloneModal: () => void;
  onDeleteWorkspace: (workspaceId: string) => void;
  getProjectDisplayName: (repoUrl: string) => string;
}

export default function WorkspacesTab({
  workspaces,
  loading,
  onRefreshWorkspaces,
  onOpenCloneModal,
  onDeleteWorkspace,
  getProjectDisplayName,
}: WorkspacesTabProps) {
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  const openWorkspaceDetails = (workspace: Workspace) => {
    setSelectedWorkspace(workspace);
    setDetailModalOpen(true);
  };

  const handleWorkspaceUpdated = () => {
    // Refresh the workspaces list after an update
    onRefreshWorkspaces();
  };

  const copyWorkspaceId = async (workspaceId: string) => {
    try {
      await navigator.clipboard.writeText(workspaceId);
      addToast({
        title: 'Copied',
        description: 'Workspace ID copied to clipboard',
        color: 'success',
      });
    } catch (error: unknown) {
      console.error('Failed to copy workspace ID:', error);
      addToast({
        title: 'Copy failed',
        description: 'Unable to copy workspace ID to clipboard',
        color: 'danger',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold flex items-center gap-2">
          <FolderOpen className="w-6 h-6 text-default-500" />
          Workspaces
        </h2>
        <div className="flex items-center gap-2">
          <Button
            color="primary"
            size="sm"
            variant="flat"
            onClick={onRefreshWorkspaces}
            isLoading={loading}
          >
            Refresh
          </Button>
          <Button
            color="primary"
            size="sm"
            onClick={onOpenCloneModal}
            startContent={<GitBranch className="w-4 h-4" />}
          >
            Clone Repository
          </Button>
        </div>
      </div>

      {/* Workspace Cards */}
      <div className="grid grid-cols-1 gap-4">
        <AnimatePresence mode="wait">
          {/* Loading skeleton - only show on initial load when no workspaces exist */}
          {loading && workspaces.length === 0 && (
            <motion.div
              key="skeleton"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {[1, 2, 3].map((i) => (
                <Card key={i} className="glass-card">
                  <CardHeader className="px-4 py-3">
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-2 min-w-0">
                        <Skeleton className="w-4 h-4 rounded" />
                        <Skeleton className="h-5 w-40 rounded-lg" />
                        <Skeleton className="h-6 w-16 rounded-full" />
                      </div>
                      <Skeleton className="h-8 w-20 rounded-lg" />
                    </div>
                  </CardHeader>
                  <CardBody className="px-4 pt-1 pb-4">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Skeleton className="w-3.5 h-3.5 rounded" />
                        <Skeleton className="h-4 w-16 rounded" />
                        <Skeleton className="h-4 w-20 rounded" />
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                          <Skeleton className="h-3 w-6 rounded" />
                          <Skeleton className="h-7 w-64 rounded-lg" />
                        </div>
                        <div className="flex items-center gap-2">
                          <Skeleton className="w-3.5 h-3.5 rounded" />
                          <Skeleton className="h-4 w-24 rounded" />
                          <Skeleton className="h-4 w-32 rounded" />
                        </div>
                      </div>
                    </div>
                  </CardBody>
                </Card>
              ))}
            </motion.div>
          )}

          {/* Workspaces list - show when we have workspaces, regardless of loading state */}
          {workspaces.length > 0 && (
            <motion.div
              key="workspaces"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {workspaces.map((workspace, index) => (
                <motion.div
                  key={workspace.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: index * 0.05 }}
                >
                  <Card className="glass-card">
                    <CardHeader className="px-4 py-3">
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-2 min-w-0">
                          <FolderOpen className="w-4 h-4 text-default-500 flex-shrink-0" />
                          <h3 className="font-semibold text-foreground truncate">
                            {getProjectDisplayName(workspace.repoUrl)}
                          </h3>
                          <Tooltip
                            content={
                              workspace.metadata?.permissions?.targetBranchProtected
                                ? 'This branch is protected'
                                : 'This branch is not protected'
                            }
                          >
                            <Chip
                              size="sm"
                              variant="flat"
                              color={
                                workspace.metadata?.permissions?.targetBranchProtected
                                  ? 'warning'
                                  : 'primary'
                              }
                              className="flex-shrink-0"
                              startContent={
                                workspace.metadata?.permissions?.targetBranchProtected ? (
                                  <Lock className="w-3 h-3" />
                                ) : null
                              }
                            >
                              <span className="font-mono text-xs">{workspace.branch}</span>
                            </Chip>
                          </Tooltip>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Button
                            color="default"
                            size="sm"
                            variant="flat"
                            onClick={() => openWorkspaceDetails(workspace)}
                            startContent={<Settings className="w-3.5 h-3.5" />}
                          >
                            Details
                          </Button>
                          <Button
                            color="danger"
                            size="sm"
                            variant="flat"
                            onClick={() => onDeleteWorkspace(workspace.id)}
                            isDisabled={loading}
                            startContent={<Trash2 className="w-3.5 h-3.5" />}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardBody className="px-4 pt-1 pb-4">
                      <div className="space-y-3">
                        {workspace.metadata?.commitHash && (
                          <div className="flex items-center gap-2 text-sm">
                            <Hash className="w-3.5 h-3.5 text-default-400" />
                            <span className="text-default-500">Commit:</span>
                            <span className="text-default-700 font-mono">
                              {workspace.metadata.commitHash.slice(0, 8)}
                            </span>
                          </div>
                        )}

                        {/* Permissions row */}
                        {workspace.metadata?.permissions ? (
                          <div className="flex items-center gap-2 text-sm">
                            <Shield className="w-3.5 h-3.5 text-default-400" />
                            <span className="text-default-500">Access:</span>
                            <span
                              className={
                                workspace.metadata.permissions.targetBranchProtected &&
                                !workspace.metadata.permissions.canPushToProtected
                                  ? 'text-warning-600 font-medium'
                                  : 'text-default-700'
                              }
                            >
                              {workspace.metadata.permissions.accessLevelName}
                            </span>
                            {workspace.metadata.permissions.targetBranchProtected &&
                              !workspace.metadata.permissions.canPushToProtected && (
                                <Tooltip
                                  content={
                                    workspace.metadata.permissions.warning ||
                                    'MRs required for protected branches'
                                  }
                                >
                                  <AlertTriangle className="w-3.5 h-3.5 text-warning-500 cursor-help" />
                                </Tooltip>
                              )}
                            <span className="text-default-400 text-xs">
                              ({workspace.metadata.permissions.authenticatedUser})
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-sm">
                            <Shield className="w-3.5 h-3.5 text-default-400" />
                            <span className="text-default-500">Access:</span>
                            <span className="text-default-400 italic">
                              Unknown (no credentials)
                            </span>
                          </div>
                        )}

                        {/* Bottom row - workspace ID left, last accessed right */}
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-default-500">ID:</span>
                            <Snippet
                              hideSymbol
                              size="sm"
                              variant="flat"
                              classNames={{ pre: 'text-xs' }}
                              onCopy={() => {
                                void copyWorkspaceId(workspace.id);
                              }}
                            >
                              {workspace.id}
                            </Snippet>
                          </div>

                          <div className="flex items-center gap-2 text-sm">
                            <Clock className="w-3.5 h-3.5 text-default-400" />
                            <span className="text-default-500">Last accessed:</span>
                            <span className="text-default-700">
                              {new Date(workspace.lastAccessed).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>
                    </CardBody>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          )}

          {/* Empty state - only show when not loading and no workspaces */}
          {!loading && workspaces.length === 0 && (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="text-center py-12"
            >
              <p className="text-default-600">No workspaces found.</p>
              <p className="text-sm text-default-500">Clone a repository to get started.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Workspace Detail Modal */}
      <WorkspaceDetailModal
        isOpen={detailModalOpen}
        onOpenChange={setDetailModalOpen}
        workspace={selectedWorkspace}
        onWorkspaceUpdated={handleWorkspaceUpdated}
        getProjectDisplayName={getProjectDisplayName}
      />
    </div>
  );
}
