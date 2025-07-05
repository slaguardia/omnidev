'use client';

import React from 'react';
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { GitBranch, FolderOpen } from "lucide-react";
import { Workspace } from '@/lib/dashboard/types';

interface WorkspacesTabProps {
  workspaces: Workspace[];
  loading: boolean;
  onRefreshWorkspaces: () => void;
  onOpenCloneModal: () => void;
  onConfigureGit: (workspaceId: string, workspace: Workspace) => void;
  onDeleteWorkspace: (workspaceId: string) => void;
  getProjectDisplayName: (repoUrl: string) => string;
}

export default function WorkspacesTab({
  workspaces,
  loading,
  onRefreshWorkspaces,
  onOpenCloneModal,
  onConfigureGit,
  onDeleteWorkspace,
  getProjectDisplayName
}: WorkspacesTabProps) {
  return (
    <div className="space-y-6 w-full overflow-hidden">
      {/* Clone Repository Button */}
      <div className="flex justify-center">
        <Button
          color="success"
          size="md"
          onClick={onOpenCloneModal}
          className="flex items-center gap-2"
        >
          <GitBranch className="w-4 h-4" />
          Clone Repository
        </Button>
      </div>

      {/* Workspace List */}
      <Card className="glass-card">
        <CardHeader className="flex justify-between items-center">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-blue-500" />
            All Workspaces
          </h3>
          <Button 
            color="primary" 
            size="sm"
            onClick={onRefreshWorkspaces}
            isLoading={loading}
          >
            Refresh
          </Button>
        </CardHeader>
        <CardBody>
          <div className="space-y-4">
            {workspaces.map((workspace) => (
              <div key={workspace.id} className="p-4 border border-default-200 rounded-lg">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h4 className="font-semibold text-lg">{getProjectDisplayName(workspace.repoUrl)}</h4>
                    <p className="text-sm text-default-500">Branch: {workspace.branch}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      color="primary"
                      size="sm"
                      variant="flat"
                      onClick={() => onConfigureGit(workspace.id, workspace)}
                      isLoading={loading}
                    >
                      Configure Git
                    </Button>
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
                </div>
                <div className="text-sm text-default-600">
                  <p>Path: {workspace.path}</p>
                  <p>Last accessed: {new Date(workspace.lastAccessed).toLocaleString()}</p>
                  {workspace.metadata?.commitHash && (
                    <p>Commit: {workspace.metadata.commitHash.slice(0, 8)}</p>
                  )}
                  {workspace.metadata?.gitConfig && (
                    <div className="mt-2 p-2 bg-default-50 rounded">
                      <p className="text-xs font-semibold text-default-700 mb-1">Git Configuration:</p>
                      {workspace.metadata.gitConfig.userName && (
                        <p className="text-xs">Name: {workspace.metadata.gitConfig.userName}</p>
                      )}
                      {workspace.metadata.gitConfig.userEmail && (
                        <p className="text-xs">Email: {workspace.metadata.gitConfig.userEmail}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {workspaces.length === 0 && (
              <div className="text-center py-8">
                <p className="text-default-600 mb-4">No workspaces found</p>
                <Button color="primary" onClick={onOpenCloneModal}>
                  Clone your first repository
                </Button>
              </div>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
} 