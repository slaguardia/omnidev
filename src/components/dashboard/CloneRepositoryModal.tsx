'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@heroui/button';
import { Input } from '@heroui/input';
import { Chip } from '@heroui/chip';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/modal';
import { Tooltip } from '@heroui/tooltip';
import { Tabs, Tab } from '@heroui/tabs';
import { Skeleton } from '@heroui/skeleton';
import {
  GitBranch,
  AlertCircle,
  Search,
  RefreshCw,
  Globe,
  Lock,
  Eye,
  Archive,
  Check,
} from 'lucide-react';
import { CloneForm } from '@/lib/dashboard/types';
import { useDiscoveredRepos } from '@/hooks/useDiscoveredRepos';
import type { DiscoveredRepository, GitProvider } from '@/lib/types/index';

interface CloneRepositoryModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onClone: () => Promise<void>;
  cloneForm: CloneForm;
  setCloneForm: React.Dispatch<React.SetStateAction<CloneForm>>;
  loading: boolean;
  hasCredentials?: boolean;
  hasGitHubToken?: boolean;
}

function ProviderIcon({ provider }: { provider: GitProvider }) {
  if (provider === 'github') {
    return (
      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
      </svg>
    );
  }
  if (provider === 'gitlab') {
    return (
      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
        <path d="M15.97 9.058l-.895-2.756L13.3.842a.477.477 0 00-.907 0L10.618 6.3H5.382L3.607.842a.477.477 0 00-.907 0L.925 6.3.03 9.058a.95.95 0 00.345 1.062L8 15.456l7.625-5.336a.95.95 0 00.345-1.062" />
      </svg>
    );
  }
  return <Globe className="w-4 h-4" />;
}

function VisibilityIcon({ visibility }: { visibility: string }) {
  if (visibility === 'private') return <Lock className="w-3 h-3" />;
  if (visibility === 'internal') return <Eye className="w-3 h-3" />;
  return <Globe className="w-3 h-3" />;
}

function RepoCard({
  repo,
  onSelect,
}: {
  repo: DiscoveredRepository;
  onSelect: (repo: DiscoveredRepository) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(repo)}
      className="w-full text-left p-3 rounded-lg border border-divider/60 hover:border-primary/50 hover:bg-content2/50 transition-all group"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <ProviderIcon provider={repo.provider} />
          <span className="font-medium text-sm truncate">{repo.fullPath}</span>
          {repo.archived && (
            <Chip
              size="sm"
              variant="flat"
              color="warning"
              startContent={<Archive className="w-3 h-3" />}
            >
              Archived
            </Chip>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Tooltip content={repo.visibility}>
            <span>
              <VisibilityIcon visibility={repo.visibility} />
            </span>
          </Tooltip>
          {repo.isCloned && (
            <Chip
              size="sm"
              variant="flat"
              color="success"
              startContent={<Check className="w-3 h-3" />}
            >
              Cloned
            </Chip>
          )}
        </div>
      </div>
      {repo.description && (
        <p className="text-xs text-default-500 mt-1.5 line-clamp-2">{repo.description}</p>
      )}
      <div className="flex items-center gap-3 mt-2 text-xs text-default-400">
        <span className="flex items-center gap-1">
          <GitBranch className="w-3 h-3" />
          {repo.defaultBranch}
        </span>
        {repo.language && <span>{repo.language}</span>}
        {(repo.starCount ?? 0) > 0 && <span>{repo.starCount} stars</span>}
      </div>
    </button>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="p-3 rounded-lg border border-divider/60">
          <Skeleton className="w-3/4 h-4 rounded-lg" />
          <Skeleton className="w-1/2 h-3 rounded-lg mt-2" />
          <Skeleton className="w-1/3 h-3 rounded-lg mt-1" />
        </div>
      ))}
    </div>
  );
}

export default function CloneRepositoryModal({
  isOpen,
  onOpenChange,
  onClone,
  cloneForm,
  setCloneForm,
  loading,
  hasCredentials = false,
  hasGitHubToken = false,
}: CloneRepositoryModalProps) {
  const [activeTab, setActiveTab] = useState<'available' | 'manual'>('available');
  const {
    filteredRepos,
    loading: reposLoading,
    discovering,
    error: reposError,
    loadRepos,
    discover,
    searchQuery,
    setSearchQuery,
    providerFilter,
    setProviderFilter,
    repos,
  } = useDiscoveredRepos();

  const hasAnyToken = hasCredentials || hasGitHubToken;

  // Reset tab to "Available" whenever the modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab('available');
    }
  }, [isOpen]);

  // Discover repos on first open, cache thereafter
  useEffect(() => {
    if (isOpen && repos.length === 0) {
      if (hasAnyToken) {
        discover('all');
      } else {
        loadRepos();
      }
    }
  }, [isOpen]);

  const handleSelectRepo = (repo: DiscoveredRepository) => {
    setCloneForm((prev) => ({
      ...prev,
      repoUrl: repo.httpUrl,
      branch: repo.defaultBranch,
    }));
    setActiveTab('manual');
  };

  const clonedCount = repos.filter((r) => r.isCloned).length;

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      placement="center"
      size="3xl"
      scrollBehavior="inside"
      classNames={{
        base: 'bg-background/85 backdrop-blur-lg border border-divider/60 h-[70vh]',
        body: activeTab === 'available' ? 'flex-1 overflow-y-auto' : 'flex-none overflow-y-auto',
      }}
    >
      <ModalContent>
        {(_onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1 px-6 pt-6 pb-2">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <GitBranch className="w-5 h-5 text-default-500" />
                Clone Repository
              </h3>
              <div className="flex items-center justify-between mt-2">
                <Tabs
                  selectedKey={activeTab}
                  onSelectionChange={(key) => setActiveTab(key as 'available' | 'manual')}
                  size="sm"
                >
                  <Tab key="available" title="Available" />
                  <Tab key="manual" title="Manual" />
                </Tabs>
                {activeTab === 'available' && (
                  <Button
                    size="sm"
                    variant="light"
                    isIconOnly={!discovering}
                    isLoading={discovering}
                    onPress={() => discover('all')}
                    isDisabled={!hasAnyToken}
                  >
                    {!discovering && <RefreshCw className="w-4 h-4" />}
                  </Button>
                )}
              </div>
            </ModalHeader>
            <ModalBody className="px-6 py-4">
              {activeTab === 'available' ? (
                <div className="space-y-4">
                  {/* Search and Filter Row */}
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Input
                      placeholder="Search repositories..."
                      value={searchQuery}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setSearchQuery(e.target.value)
                      }
                      startContent={<Search className="w-4 h-4 text-default-400" />}
                      variant="bordered"
                      size="sm"
                      className="flex-1"
                    />
                    <div className="flex items-center gap-2">
                      {(['all', 'github', 'gitlab'] as const).map((p) => (
                        <Chip
                          key={p}
                          variant={providerFilter === p ? 'solid' : 'bordered'}
                          color={providerFilter === p ? 'primary' : 'default'}
                          className="cursor-pointer"
                          onClick={() => setProviderFilter(p)}
                        >
                          {p === 'all' ? 'All' : p === 'github' ? 'GitHub' : 'GitLab'}
                        </Chip>
                      ))}
                      {repos.length > 0 && (
                        <span className="text-xs text-default-400 ml-1">
                          {repos.length} ({clonedCount} cloned)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Error */}
                  {reposError && (
                    <div className="p-3 bg-danger-50 dark:bg-danger-500/10 border border-danger-200 dark:border-danger-500/30 rounded-lg flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-danger-600 dark:text-danger-400 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-danger-700 dark:text-danger-400">{reposError}</p>
                    </div>
                  )}

                  {/* Repo List */}
                  {reposLoading || discovering ? (
                    <LoadingSkeleton />
                  ) : filteredRepos.length > 0 ? (
                    <div className="space-y-2">
                      {filteredRepos.map((repo) => (
                        <RepoCard key={repo.id} repo={repo} onSelect={handleSelectRepo} />
                      ))}
                    </div>
                  ) : repos.length === 0 ? (
                    <div className="text-center py-8 text-default-400">
                      <Globe className="w-10 h-10 mx-auto mb-3 opacity-50" />
                      <p className="text-sm font-medium">No repositories discovered</p>
                      <p className="text-xs mt-1">
                        {hasAnyToken
                          ? 'No accessible repositories found. Try clicking Refresh.'
                          : 'Configure a GitHub or GitLab token in Git Source Config first.'}
                      </p>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-default-400">
                      <Search className="w-10 h-10 mx-auto mb-3 opacity-50" />
                      <p className="text-sm">No repos match your search.</p>
                    </div>
                  )}
                </div>
              ) : (
                /* Manual Tab - existing form */
                <div className="space-y-5">
                  <div className="flex flex-col gap-1.5">
                    <Input
                      label="Repository URL"
                      labelPlacement="outside"
                      placeholder="https://gitlab.com/user/repo.git"
                      value={cloneForm.repoUrl}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setCloneForm((prev) => ({ ...prev, repoUrl: e.target.value }))
                      }
                      variant="bordered"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Input
                      label="Branch (optional)"
                      labelPlacement="outside"
                      placeholder="main"
                      value={cloneForm.branch}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setCloneForm((prev) => ({ ...prev, branch: e.target.value }))
                      }
                      variant="bordered"
                    />
                  </div>

                  {hasCredentials ? (
                    <div className="p-3 bg-success-50 dark:bg-success-500/10 border border-success-200 dark:border-success-500/30 rounded-lg">
                      <p className="text-sm text-success-700 dark:text-success-400">
                        Credentials configured in Git Source Config will be used for private
                        repositories.
                      </p>
                    </div>
                  ) : (
                    <div className="p-3 bg-warning-50 dark:bg-warning-500/10 border border-warning-200 dark:border-warning-500/30 rounded-lg flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-warning-600 dark:text-warning-400 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-warning-700 dark:text-warning-400">
                        No credentials configured. Only public repositories can be cloned. Configure
                        your GitLab username and token in <strong>Git Source Config</strong> for
                        private repos.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </ModalBody>
            <ModalFooter className="px-6 pb-6 pt-4">
              {activeTab === 'manual' && (
                <Button
                  color="primary"
                  onClick={onClone}
                  isLoading={loading}
                  isDisabled={!cloneForm.repoUrl}
                >
                  Clone Repository
                </Button>
              )}
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
