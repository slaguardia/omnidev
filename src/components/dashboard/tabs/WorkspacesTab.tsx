'use client';

import React from 'react';
import { Button } from '@heroui/button';
import { Snippet } from '@heroui/snippet';
import { addToast } from '@heroui/toast';
import { Card, CardBody, CardHeader } from '@heroui/card';
import { Chip } from '@heroui/chip';
import { Skeleton } from '@heroui/skeleton';
import { GitBranch, FolderOpen, Trash2, Clock, Hash } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Workspace } from '@/lib/dashboard/types';

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
          {/* Loading skeleton */}
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

          {/* Loaded workspaces */}
          {!loading && workspaces.length > 0 && (
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
                          <Chip size="sm" variant="flat" color="primary" className="flex-shrink-0">
                            <span className="font-mono text-xs">{workspace.branch}</span>
                          </Chip>
                        </div>
                        <Button
                          color="danger"
                          size="sm"
                          variant="flat"
                          onClick={() => onDeleteWorkspace(workspace.id)}
                          isLoading={loading}
                          startContent={<Trash2 className="w-3.5 h-3.5" />}
                          className="flex-shrink-0"
                        >
                          Delete
                        </Button>
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

          {/* Already loaded but still loading more (refresh) */}
          {loading &&
            workspaces.length > 0 &&
            workspaces.map((workspace) => (
              <Card key={workspace.id} className="glass-card">
                <CardHeader className="px-4 py-3">
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2 min-w-0">
                      <FolderOpen className="w-4 h-4 text-default-500 flex-shrink-0" />
                      <h3 className="font-semibold text-foreground truncate">
                        {getProjectDisplayName(workspace.repoUrl)}
                      </h3>
                      <Chip size="sm" variant="flat" color="primary" className="flex-shrink-0">
                        <span className="font-mono text-xs">{workspace.branch}</span>
                      </Chip>
                    </div>
                    <Button
                      color="danger"
                      size="sm"
                      variant="flat"
                      onClick={() => onDeleteWorkspace(workspace.id)}
                      isLoading={loading}
                      startContent={<Trash2 className="w-3.5 h-3.5" />}
                      className="flex-shrink-0"
                    >
                      Delete
                    </Button>
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
            ))}

          {/* Empty state */}
          {!loading && workspaces.length === 0 && (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Card className="glass-card">
                <CardBody className="py-12">
                  <div className="flex flex-col items-center justify-center text-center">
                    <FolderOpen className="w-12 h-12 text-default-300 mb-3" />
                    <p className="text-sm text-default-500">
                      No workspaces found. Clone a repository to get started.
                    </p>
                  </div>
                </CardBody>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
