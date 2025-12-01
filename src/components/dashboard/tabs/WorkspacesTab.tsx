'use client';

import React from 'react';
import { Button } from '@heroui/button';
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
          <div key={workspace.id} className="p-4 border border-default-200 rounded-lg">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h4 className="font-semibold text-lg">
                  {getProjectDisplayName(workspace.repoUrl)}
                </h4>
                <p className="text-sm text-default-500">Branch: {workspace.branch}</p>
              </div>
              <Button
                color="danger"
                size="sm"
                variant="flat"
                onClick={() => onDeleteWorkspace(workspace.id)}
                isLoading={loading}
              >
                Delete
              </Button>
            </div>
            <div className="text-sm text-default-600">
              <p>Path: {workspace.path}</p>
              <p>Last accessed: {new Date(workspace.lastAccessed).toLocaleString()}</p>
              {workspace.metadata?.commitHash && (
                <p>Commit: {workspace.metadata.commitHash.slice(0, 8)}</p>
              )}
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
