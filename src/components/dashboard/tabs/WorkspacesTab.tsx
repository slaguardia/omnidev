'use client';

import React from 'react';
import { Button } from '@heroui/button';
import { Snippet } from '@heroui/snippet';
import { addToast } from '@heroui/toast';
import { GitBranch, FolderOpen } from 'lucide-react';
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
          <FolderOpen className="w-6 h-6 text-blue-500" />
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
            color="success"
            size="sm"
            onClick={onOpenCloneModal}
            startContent={<GitBranch className="w-4 h-4" />}
          >
            Clone Repository
          </Button>
        </div>
      </div>

      {/* Workspace List */}
      <div className="space-y-4">
        {workspaces.map((workspace) => (
          <div key={workspace.id} className="p-5 border border-default-200 rounded-xl">
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_220px] gap-4 items-stretch">
              <div className="min-w-0 space-y-2">
                <div className="space-y-1">
                  <h4 className="font-semibold text-lg truncate">
                    {getProjectDisplayName(workspace.repoUrl)}
                  </h4>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-default-600">
                    <span>
                      <span className="text-default-500">Branch:</span>{' '}
                      <span className="font-mono">{workspace.branch}</span>
                    </span>
                    {workspace.metadata?.commitHash ? (
                      <span>
                        <span className="text-default-500">Commit:</span>{' '}
                        <span className="font-mono">
                          {workspace.metadata.commitHash.slice(0, 8)}
                        </span>
                      </span>
                    ) : null}
                  </div>
                </div>

                <div
                  className="min-w-0 pt-1 flex flex-nowrap items-center gap-2 text-sm"
                  title={workspace.path}
                >
                  <span className="text-default-500 whitespace-nowrap">Path:</span>
                  <div className="text-default-700 min-w-0 flex-1 font-mono overflow-hidden text-ellipsis whitespace-nowrap">
                    {workspace.path}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-xs text-default-500">Workspace ID</span>
                  <Snippet
                    hideSymbol
                    size="sm"
                    variant="flat"
                    className="max-w-full"
                    classNames={{ pre: 'whitespace-pre-wrap break-all' }}
                    onCopy={() => {
                      void copyWorkspaceId(workspace.id);
                    }}
                  >
                    {workspace.id}
                  </Snippet>
                </div>
              </div>

              <div className="flex flex-col items-end gap-2 h-full">
                <Button
                  color="danger"
                  size="sm"
                  variant="flat"
                  onClick={() => onDeleteWorkspace(workspace.id)}
                  isLoading={loading}
                >
                  Delete
                </Button>
                <div className="text-sm text-default-500 whitespace-nowrap mt-auto">
                  Last accessed:{' '}
                  <span className="text-default-700">
                    {new Date(workspace.lastAccessed).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
        {workspaces.length === 0 && (
          <div className="text-center py-8">
            <p className="text-default-600">
              No workspaces found. Clone a repository to get started.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
