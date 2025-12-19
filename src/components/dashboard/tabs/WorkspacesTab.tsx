'use client';

import React from 'react';
import { Button } from '@heroui/button';
import { Snippet } from '@heroui/snippet';
import { addToast } from '@heroui/toast';
import { Card, CardBody, CardHeader } from '@heroui/card';
import { Chip } from '@heroui/chip';
import { GitBranch, FolderOpen, Trash2, Clock, Hash } from 'lucide-react';
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
        {workspaces.map((workspace) => (
          <Card key={workspace.id} className="bg-content1/60 border border-divider/60 shadow-sm">
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

        {workspaces.length === 0 && (
          <Card className="bg-content1/50 border border-divider/60 shadow-sm">
            <CardBody className="py-12">
              <div className="flex flex-col items-center justify-center text-center">
                <FolderOpen className="w-12 h-12 text-default-300 mb-3" />
                <p className="text-sm text-default-500">
                  No workspaces found. Clone a repository to get started.
                </p>
              </div>
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
