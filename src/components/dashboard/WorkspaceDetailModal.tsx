'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@heroui/button';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/modal';
import { Select, SelectItem } from '@heroui/select';
import { Tooltip } from '@heroui/tooltip';
import { Snippet } from '@heroui/snippet';
import { Chip } from '@heroui/chip';
import { Divider } from '@heroui/divider';
import { addToast } from '@heroui/toast';
import {
  FolderOpen,
  Info,
  GitBranch,
  Hash,
  Clock,
  Shield,
  Lock,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { Workspace } from '@/lib/dashboard/types';
import { useBranches } from '@/hooks/useBranches';

interface WorkspaceDetailModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  workspace: Workspace | null;
  onWorkspaceUpdated: () => void;
  getProjectDisplayName: (repoUrl: string) => string;
}

export default function WorkspaceDetailModal({
  isOpen,
  onOpenChange,
  workspace,
  onWorkspaceUpdated,
  getProjectDisplayName,
}: WorkspaceDetailModalProps) {
  const { branches, loading: branchesLoading, fetchBranches } = useBranches();
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [refreshingPermissions, setRefreshingPermissions] = useState(false);

  // Fetch branches when modal opens
  useEffect(() => {
    if (isOpen && workspace) {
      setSelectedBranch(workspace.branch);
      void fetchBranches(workspace.id);
    }
  }, [isOpen, workspace, fetchBranches]);

  const handleSave = async () => {
    if (!workspace || selectedBranch === workspace.branch) {
      onOpenChange(false);
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/workspaces/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: workspace.id,
          targetBranch: selectedBranch,
          refreshPermissions: true,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update workspace');
      }

      addToast({
        title: 'Workspace updated',
        description: `Default branch changed to ${selectedBranch}`,
        color: 'success',
      });

      onWorkspaceUpdated();
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to update workspace:', error);
      addToast({
        title: 'Update failed',
        description: error instanceof Error ? error.message : 'Failed to update workspace',
        color: 'danger',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRefreshPermissions = async () => {
    if (!workspace) return;

    setRefreshingPermissions(true);
    try {
      const response = await fetch('/api/workspaces/refresh-permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: workspace.id }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to refresh permissions');
      }

      addToast({
        title: 'Permissions refreshed',
        description: 'Workspace permissions have been updated',
        color: 'success',
      });

      onWorkspaceUpdated();
    } catch (error) {
      console.error('Failed to refresh permissions:', error);
      addToast({
        title: 'Refresh failed',
        description: error instanceof Error ? error.message : 'Failed to refresh permissions',
        color: 'danger',
      });
    } finally {
      setRefreshingPermissions(false);
    }
  };

  if (!workspace) return null;

  const permissions = workspace.metadata?.permissions;
  const hasPermissionWarning =
    permissions?.targetBranchProtected && !permissions?.canPushToProtected;

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      placement="center"
      size="2xl"
      scrollBehavior="inside"
      classNames={{
        base: 'bg-background/85 backdrop-blur-lg border border-divider/60',
      }}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1 px-6 pt-6 pb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <FolderOpen className="w-5 h-5 text-default-500" />
                {getProjectDisplayName(workspace.repoUrl)}
              </h3>
              <p className="text-sm text-default-500 font-normal">{workspace.repoUrl}</p>
            </ModalHeader>
            <ModalBody className="px-6 py-4">
              <div className="space-y-5">
                {/* Default Branch Selection */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium">Default Branch</label>
                    <Tooltip
                      content={
                        <div className="max-w-xs p-1">
                          <p className="font-medium mb-1">What is the default branch?</p>
                          <p className="text-xs text-default-400">
                            The default branch is the target branch for merge/pull requests when
                            using the Edit API with <code>createMR=true</code>. Claude Code will
                            create a working branch from this branch and open an MR back to it.
                          </p>
                        </div>
                      }
                      placement="right"
                      showArrow
                    >
                      <button className="flex items-center justify-center w-4 h-4 rounded-full bg-default-200 hover:bg-default-300 transition-colors">
                        <Info className="w-3 h-3 text-default-600" />
                      </button>
                    </Tooltip>
                  </div>
                  <Select
                    label="Select default branch"
                    labelPlacement="inside"
                    selectedKeys={selectedBranch ? [selectedBranch] : []}
                    onSelectionChange={(keys) => {
                      const selected = Array.from(keys)[0] as string;
                      if (selected) setSelectedBranch(selected);
                    }}
                    isLoading={branchesLoading}
                    variant="bordered"
                    classNames={{
                      trigger: 'h-12',
                    }}
                  >
                    {branches.map((branch) => (
                      <SelectItem key={branch} textValue={branch}>
                        <div className="flex items-center gap-2">
                          <GitBranch className="w-4 h-4 text-default-400" />
                          <span>{branch}</span>
                          {branch === workspace.branch && (
                            <Chip size="sm" variant="flat" color="primary" className="ml-auto">
                              current
                            </Chip>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </Select>
                  {selectedBranch !== workspace.branch && (
                    <p className="text-xs text-warning-600">
                      Changing the default branch will refresh permissions for the new branch.
                    </p>
                  )}
                </div>

                <Divider />

                {/* Permissions Section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-default-500" />
                      <span className="text-sm font-medium">Permissions</span>
                    </div>
                    <Button
                      size="sm"
                      variant="flat"
                      startContent={<RefreshCw className="w-3.5 h-3.5" />}
                      isLoading={refreshingPermissions}
                      onPress={handleRefreshPermissions}
                    >
                      Refresh
                    </Button>
                  </div>

                  {permissions ? (
                    <div className="bg-default-100 rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-default-600">Access Level</span>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-sm font-medium ${hasPermissionWarning ? 'text-warning-600' : ''}`}
                          >
                            {permissions.accessLevelName}
                          </span>
                          {hasPermissionWarning && (
                            <Tooltip content={permissions.warning || 'MRs required for this branch'}>
                              <AlertTriangle className="w-4 h-4 text-warning-500" />
                            </Tooltip>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-default-600">Branch Protected</span>
                        <Chip
                          size="sm"
                          variant="flat"
                          color={permissions.targetBranchProtected ? 'warning' : 'success'}
                          startContent={
                            permissions.targetBranchProtected ? (
                              <Lock className="w-3 h-3" />
                            ) : null
                          }
                        >
                          {permissions.targetBranchProtected ? 'Yes' : 'No'}
                        </Chip>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-default-600">Can Push to Protected</span>
                        <Chip
                          size="sm"
                          variant="flat"
                          color={permissions.canPushToProtected ? 'success' : 'danger'}
                        >
                          {permissions.canPushToProtected ? 'Yes' : 'No'}
                        </Chip>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-default-600">Authenticated As</span>
                        <span className="text-sm font-mono">{permissions.authenticatedUser}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-default-600">Provider</span>
                        <Chip size="sm" variant="flat">
                          {permissions.provider === 'github' ? 'GitHub' : 'GitLab'}
                        </Chip>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-default-600">Last Checked</span>
                        <span className="text-xs text-default-400">
                          {new Date(permissions.checkedAt).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-warning-50 dark:bg-warning-500/10 border border-warning-200 dark:border-warning-500/30 rounded-lg p-4">
                      <p className="text-sm text-warning-700 dark:text-warning-400">
                        Permissions unknown. This workspace may have been cloned without credentials
                        configured, or before permission caching was added.
                      </p>
                      <p className="text-xs text-warning-600 dark:text-warning-500 mt-2">
                        Click &quot;Refresh&quot; to check permissions now.
                      </p>
                    </div>
                  )}
                </div>

                <Divider />

                {/* Workspace Details */}
                <div className="space-y-3">
                  <span className="text-sm font-medium">Workspace Details</span>

                  <div className="bg-default-100 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Hash className="w-4 h-4 text-default-400" />
                        <span className="text-sm text-default-600">Workspace ID</span>
                      </div>
                      <Snippet
                        hideSymbol
                        size="sm"
                        variant="flat"
                        classNames={{ pre: 'text-xs' }}
                      >
                        {workspace.id}
                      </Snippet>
                    </div>

                    {workspace.metadata?.commitHash && (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <GitBranch className="w-4 h-4 text-default-400" />
                          <span className="text-sm text-default-600">Commit</span>
                        </div>
                        <span className="text-sm font-mono">
                          {workspace.metadata.commitHash.slice(0, 8)}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-default-400" />
                        <span className="text-sm text-default-600">Last Accessed</span>
                      </div>
                      <span className="text-sm">
                        {new Date(workspace.lastAccessed).toLocaleString()}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ExternalLink className="w-4 h-4 text-default-400" />
                        <span className="text-sm text-default-600">Repository</span>
                      </div>
                      <a
                        href={workspace.repoUrl.replace(/\.git$/, '')}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline"
                      >
                        Open in browser
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </ModalBody>
            <ModalFooter className="px-6 pb-6 pt-4">
              <Button color="default" variant="flat" onPress={onClose}>
                Cancel
              </Button>
              <Button
                color="primary"
                onPress={handleSave}
                isLoading={saving}
                isDisabled={selectedBranch === workspace.branch}
              >
                {selectedBranch === workspace.branch ? 'Close' : 'Save Changes'}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
