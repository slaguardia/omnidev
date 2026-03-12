'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button } from '@heroui/button';
import { Chip } from '@heroui/chip';
import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from '@heroui/dropdown';
import { Input, Textarea } from '@heroui/input';
import { Modal, ModalContent, ModalBody, ModalFooter } from '@heroui/modal';
import {
  GitBranch,
  Folder,
  AlertTriangle,
  FileCode,
  Loader2,
  BookOpen,
  ChevronDown,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useRalphWorkspaces } from '@/hooks/queries/useRalphWorkspaces';
import { useCreateRalphTask } from '@/hooks/queries/useCreateRalphTask';
import { useRalphProjects } from '@/hooks/queries/useRalphProjects';
import { useRalphPlaybooks } from '@/hooks/queries/useRalphPlaybooks';
import type { RalphTaskData } from './types';

/**
 * Form state for creating a new task
 */
interface CreateTaskForm {
  title: string;
  workspaceId: string;
  description: string;
  filePaths: string[];
  baseBranch: string;
  featureBranch: string;
  prTargetBranch: string;
  deliveryMethod: 'merge-request' | 'direct-commit';
  parentId: string | null;
  parentTitle: string | null;
  projectId: string | null;
  playbookId: string | null;
}

const INITIAL_CREATE_FORM: CreateTaskForm = {
  title: '',
  workspaceId: '',
  description: '',
  filePaths: [],
  baseBranch: '',
  featureBranch: '',
  prTargetBranch: '',
  deliveryMethod: 'direct-commit',
  parentId: null,
  parentTitle: null,
  projectId: null,
  playbookId: null,
};

/**
 * Generate a suggested feature branch name from task title
 */
function generateFeatureBranchName(title: string, baseBranch: string): string {
  if (!title.trim()) return '';

  // Convert to lowercase, replace spaces with hyphens, remove special chars
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 30);

  const prefix = baseBranch === 'main' || baseBranch === 'master' ? 'feature' : baseBranch;
  return `${prefix}/${slug}`;
}

/**
 * Props for CreateTaskModal component
 */
export interface CreateTaskModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean, submitted?: boolean) => void;
  parentTask?: { id: string; title: string; workspaceId: string } | null;
}

/**
 * Modal for creating a new Ralph task
 */
export default function CreateTaskModal({
  isOpen,
  onOpenChange,
  parentTask,
}: CreateTaskModalProps) {
  const [form, setForm] = useState<CreateTaskForm>(INITIAL_CREATE_FORM);
  const { data: workspaces = [], isLoading: isLoadingWorkspaces } = useRalphWorkspaces({
    enabled: isOpen,
  });
  const { data: projectOptions = [] } = useRalphProjects();
  const { data: playbookOptions = [] } = useRalphPlaybooks();
  const queryClient = useQueryClient();
  const createTask = useCreateRalphTask();
  const [error, setError] = useState<string | null>(null);
  const [filePathInput, setFilePathInput] = useState('');
  const [fileSuggestions, setFileSuggestions] = useState<string[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openDropdownCountRef = useRef(0);

  // Guard modal close when a dropdown is open (HeroUI portals trigger false dismissals)
  const handleDropdownOpenChange = useCallback((isOpen: boolean) => {
    if (isOpen) {
      openDropdownCountRef.current += 1;
    } else {
      requestAnimationFrame(() => {
        openDropdownCountRef.current -= 1;
      });
    }
  }, []);

  const handleModalOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen && openDropdownCountRef.current > 0) {
        return;
      }
      onOpenChange(isOpen);
    },
    [onOpenChange]
  );

  // Get selected workspace for branch options
  const selectedWorkspace = useMemo(
    () => workspaces.find((ws) => ws.id === form.workspaceId),
    [workspaces, form.workspaceId]
  );

  // Auto-suggest feature branch when title changes (only for merge-request mode)
  useEffect(() => {
    if (
      form.deliveryMethod === 'merge-request' &&
      form.title &&
      form.baseBranch &&
      !form.featureBranch
    ) {
      setForm((prev) => ({
        ...prev,
        featureBranch: generateFeatureBranchName(prev.title, prev.baseBranch),
      }));
    }
  }, [form.title, form.baseBranch, form.featureBranch, form.deliveryMethod]);

  // Set default branches when workspace changes
  useEffect(() => {
    if (selectedWorkspace) {
      setForm((prev) => ({
        ...prev,
        baseBranch: prev.baseBranch || selectedWorkspace.targetBranch,
        prTargetBranch: prev.prTargetBranch || selectedWorkspace.targetBranch,
      }));
    }
  }, [selectedWorkspace]);

  // Pre-fill form when modal opens with parent task
  useEffect(() => {
    if (isOpen) {
      if (parentTask) {
        setForm((prev) => ({
          ...prev,
          workspaceId: parentTask.workspaceId,
          parentId: parentTask.id,
          parentTitle: parentTask.title,
        }));
      }
    } else {
      // Reset form when modal closes
      setForm(INITIAL_CREATE_FORM);
      setError(null);
      setFilePathInput('');
      setFileSuggestions([]);
      setShowSuggestions(false);
    }
  }, [isOpen, parentTask]);

  // Fetch file suggestions from workspace
  const fetchFileSuggestions = useCallback(
    async (query: string) => {
      if (!form.workspaceId || query.length < 1) {
        setFileSuggestions([]);
        setShowSuggestions(false);
        return;
      }
      setIsLoadingFiles(true);
      try {
        const params = new URLSearchParams({ q: query, limit: '20' });
        const response = await fetch(`/api/ralph/workspaces/${form.workspaceId}/files?${params}`);
        if (response.ok) {
          const data = await response.json();
          const filtered = (data.files as string[]).filter(
            (f: string) => !form.filePaths.includes(f)
          );
          setFileSuggestions(filtered);
          setShowSuggestions(filtered.length > 0);
          setSelectedSuggestionIndex(-1);
        } else {
          console.error(
            '[CREATE TASK MODAL] File search failed:',
            response.status,
            await response.text().catch(() => '')
          );
        }
      } catch (err) {
        console.error('[CREATE TASK MODAL] File search error:', err);
      } finally {
        setIsLoadingFiles(false);
      }
    },
    [form.workspaceId, form.filePaths]
  );

  // Debounced file path input handler
  const handleFilePathInputChange = useCallback(
    (value: string) => {
      setFilePathInput(value);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (value.trim().length >= 1) {
        debounceTimerRef.current = setTimeout(() => {
          fetchFileSuggestions(value.trim());
        }, 250);
      } else {
        setFileSuggestions([]);
        setShowSuggestions(false);
      }
    },
    [fetchFileSuggestions]
  );

  // Close suggestions on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectSuggestion = (path: string) => {
    if (!form.filePaths.includes(path)) {
      setForm((prev) => ({
        ...prev,
        filePaths: [...prev.filePaths, path],
      }));
    }
    setFilePathInput('');
    setFileSuggestions([]);
    setShowSuggestions(false);
  };

  const handleAddFilePath = () => {
    const path = filePathInput.trim();
    if (path && !form.filePaths.includes(path)) {
      setForm((prev) => ({
        ...prev,
        filePaths: [...prev.filePaths, path],
      }));
      setFilePathInput('');
      setShowSuggestions(false);
    }
  };

  const handleRemoveFilePath = (pathToRemove: string) => {
    setForm((prev) => ({
      ...prev,
      filePaths: prev.filePaths.filter((p) => p !== pathToRemove),
    }));
  };

  const handleSubmit = () => {
    // Validate required fields
    if (!form.title.trim()) {
      setError('Title is required');
      return;
    }
    if (!form.workspaceId) {
      setError('Workspace is required');
      return;
    }
    if (!form.description.trim()) {
      setError('Description is required');
      return;
    }

    setError(null);

    // Hydrate the placeholder with form data so it looks like a real row instantly
    const listKey = ['ralph-tasks', { archived: false }];
    queryClient.setQueryData(listKey, (old: RalphTaskData[] | undefined) =>
      (old || []).map((t) =>
        t.id === 'placeholder-new-task'
          ? {
              ...t,
              title: form.title.trim(),
              workspaceId: form.workspaceId,
              workspaceName: selectedWorkspace?.name ?? '',
              description: form.description.trim(),
              filePaths: form.filePaths,
              baseBranch: form.baseBranch || null,
              featureBranch:
                form.deliveryMethod === 'merge-request' ? form.featureBranch.trim() || null : null,
              prTargetBranch:
                form.deliveryMethod === 'merge-request' ? form.prTargetBranch || null : null,
              deliveryMethod: form.deliveryMethod,
              parentId: form.parentId || null,
              projectId: form.projectId || null,
              isPlaceholder: false,
            }
          : t
      )
    );

    createTask.mutate({
      title: form.title.trim(),
      workspaceId: form.workspaceId,
      description: form.description.trim(),
      filePaths: form.filePaths,
      baseBranch: form.baseBranch || null,
      featureBranch:
        form.deliveryMethod === 'merge-request' ? form.featureBranch.trim() || null : null,
      prTargetBranch: form.deliveryMethod === 'merge-request' ? form.prTargetBranch || null : null,
      deliveryMethod: form.deliveryMethod,
      parentId: form.parentId || null,
      projectId: form.projectId || null,
      playbookId: form.playbookId || null,
      _workspaceName: selectedWorkspace?.name ?? '',
    });

    // Close immediately — placeholder is already hydrated with real data.
    onOpenChange(false, true);
  };

  // Block direct-commit when the cached target branch is protected and user can't push
  const isDirectCommitBlocked =
    form.deliveryMethod === 'direct-commit' &&
    form.baseBranch !== '' &&
    form.baseBranch === selectedWorkspace?.targetBranch &&
    selectedWorkspace?.permissions?.targetBranchProtected === true &&
    selectedWorkspace?.permissions?.canPushToProtected === false;

  const isFormValid =
    form.title.trim() && form.workspaceId && form.description.trim() && !isDirectCommitBlocked;

  // Resolve display names for toolbar buttons
  const selectedProject = projectOptions.find((p) => p.id === form.projectId);
  const selectedPlaybook = playbookOptions.find((p) => p.id === form.playbookId);

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={handleModalOpenChange}
      placement="center"
      size="4xl"
      scrollBehavior="inside"
      classNames={{
        base: 'bg-background/85 backdrop-blur-lg border border-divider/60',
      }}
    >
      <ModalContent>
        {() => (
          <>
            <ModalBody className="px-6 pt-6 pb-4">
              <div className="space-y-5">
                {/* Error message */}
                {error && (
                  <div className="p-3 bg-danger-50 dark:bg-danger-500/10 border border-danger-200 dark:border-danger-500/30 rounded-lg">
                    <p className="text-sm text-danger-700 dark:text-danger-400">{error}</p>
                  </div>
                )}

                {/* Title — borderless */}
                <Input
                  placeholder={form.parentId ? 'Subtask title' : 'Task title'}
                  value={form.title}
                  onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                  variant="underlined"
                  classNames={{
                    input: 'text-lg font-medium placeholder:text-default-300',
                    inputWrapper:
                      'border-transparent hover:border-transparent focus-within:border-transparent bg-transparent px-0 after:bg-transparent',
                  }}
                  autoFocus
                />

                {/* Subtask context line */}
                {form.parentId && form.parentTitle && (
                  <p className="text-xs text-default-400 px-0.5">
                    Subtask of{' '}
                    <span className="font-medium text-foreground/70">{form.parentTitle}</span>
                  </p>
                )}

                {/* Description — borderless */}
                <Textarea
                  placeholder="Add description..."
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  variant="underlined"
                  minRows={8}
                  classNames={{
                    input: 'text-sm placeholder:text-default-300',
                    inputWrapper:
                      'border-transparent hover:border-transparent focus-within:border-transparent bg-transparent px-0 after:bg-transparent',
                  }}
                />

                {/* File Paths — only when workspace is set */}
                {form.workspaceId && (
                  <div className="flex flex-col gap-1.5">
                    <div className="relative" ref={suggestionsRef}>
                      <Input
                        placeholder="Search files..."
                        value={filePathInput}
                        onChange={(e) => handleFilePathInputChange(e.target.value)}
                        onFocus={() => {
                          if (fileSuggestions.length > 0) setShowSuggestions(true);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (
                              showSuggestions &&
                              selectedSuggestionIndex >= 0 &&
                              selectedSuggestionIndex < fileSuggestions.length
                            ) {
                              selectSuggestion(fileSuggestions[selectedSuggestionIndex]!);
                            } else {
                              handleAddFilePath();
                            }
                          } else if (e.key === 'ArrowDown' && showSuggestions) {
                            e.preventDefault();
                            setSelectedSuggestionIndex((prev) =>
                              prev < fileSuggestions.length - 1 ? prev + 1 : 0
                            );
                          } else if (e.key === 'ArrowUp' && showSuggestions) {
                            e.preventDefault();
                            setSelectedSuggestionIndex((prev) =>
                              prev > 0 ? prev - 1 : fileSuggestions.length - 1
                            );
                          } else if (e.key === 'Escape') {
                            setShowSuggestions(false);
                          }
                        }}
                        variant="bordered"
                        size="sm"
                        startContent={<FileCode className="w-3.5 h-3.5 text-default-400" />}
                        endContent={
                          isLoadingFiles ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-default-400" />
                          ) : null
                        }
                      />
                      {showSuggestions && fileSuggestions.length > 0 && (
                        <div className="absolute z-50 w-full mt-1 max-h-48 overflow-y-auto rounded-md border border-divider bg-content1 shadow-sm">
                          {fileSuggestions.map((suggestion, index) => (
                            <button
                              key={suggestion}
                              type="button"
                              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-default-100 cursor-pointer flex items-center gap-2 ${
                                index === selectedSuggestionIndex ? 'bg-default-100' : ''
                              }`}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                selectSuggestion(suggestion);
                              }}
                            >
                              <FileCode className="w-3 h-3 text-default-400 flex-shrink-0" />
                              <span className="truncate">{suggestion}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {form.filePaths.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {form.filePaths.map((path) => (
                          <Chip
                            key={path}
                            size="sm"
                            variant="flat"
                            onClose={() => handleRemoveFilePath(path)}
                            classNames={{ closeButton: 'text-default-500' }}
                          >
                            {path}
                          </Chip>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Branch protection blocker */}
                {isDirectCommitBlocked && selectedWorkspace?.permissions && (
                  <div className="flex items-center gap-2 text-xs text-danger-600 bg-danger-50 dark:bg-danger-50/10 rounded-lg px-3 py-2">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>
                      <strong>{form.baseBranch}</strong> is a protected branch and your account (
                      {selectedWorkspace.permissions.accessLevelName}) cannot push directly to it.
                      Switch to Merge Request delivery to proceed.
                    </span>
                  </div>
                )}
              </div>
            </ModalBody>
            <ModalFooter className="flex items-center justify-between px-6 pb-5 pt-3">
              {/* Left: metadata toolbar */}
              <div className="flex items-center gap-3 flex-wrap">
                {/* Workspace Dropdown */}
                <Dropdown onOpenChange={handleDropdownOpenChange}>
                  <DropdownTrigger>
                    <Button
                      size="sm"
                      variant="bordered"
                      className="h-8 min-w-0 px-3 gap-2 text-xs rounded-md shadow-small"
                      isDisabled={!!form.parentId}
                      isLoading={isLoadingWorkspaces}
                    >
                      <Folder className="w-3.5 h-3.5" />
                      <span>{selectedWorkspace ? selectedWorkspace.name : 'Workspace'}</span>
                      <ChevronDown className="w-3 h-3 opacity-50" />
                    </Button>
                  </DropdownTrigger>
                  <DropdownMenu
                    aria-label="Select workspace"
                    selectionMode="single"
                    selectedKeys={
                      form.workspaceId ? new Set([form.workspaceId]) : new Set<string>()
                    }
                    onAction={(key) => {
                      setForm((prev) => ({
                        ...prev,
                        workspaceId: key as string,
                        baseBranch: '',
                        featureBranch: '',
                        prTargetBranch: '',
                      }));
                    }}
                  >
                    {workspaces.map((ws) => (
                      <DropdownItem key={ws.id} description={ws.repoUrl} textValue={ws.name}>
                        {ws.name}
                      </DropdownItem>
                    ))}
                  </DropdownMenu>
                </Dropdown>

                {/* Project Dropdown */}
                {projectOptions.length > 0 && (
                  <Dropdown onOpenChange={handleDropdownOpenChange}>
                    <DropdownTrigger>
                      <Button
                        size="sm"
                        variant="bordered"
                        className="h-8 min-w-0 px-3 gap-2 text-xs rounded-md shadow-small"
                      >
                        {selectedProject ? (
                          <span
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: selectedProject.color }}
                          />
                        ) : (
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-default-300" />
                        )}
                        <span>{selectedProject ? selectedProject.name : 'Project'}</span>
                        <ChevronDown className="w-3 h-3 opacity-50" />
                      </Button>
                    </DropdownTrigger>
                    <DropdownMenu
                      aria-label="Select project"
                      selectionMode="single"
                      selectedKeys={form.projectId ? new Set([form.projectId]) : new Set<string>()}
                      onAction={(key) => {
                        const id = key as string;
                        setForm((prev) => ({
                          ...prev,
                          projectId: id === '__none__' ? null : id,
                        }));
                      }}
                    >
                      {[
                        ...(form.projectId
                          ? [
                              <DropdownItem
                                key="__none__"
                                textValue="No project"
                                className="text-default-400"
                              >
                                No project
                              </DropdownItem>,
                            ]
                          : []),
                        ...projectOptions.map((proj) => (
                          <DropdownItem
                            key={proj.id}
                            textValue={proj.name}
                            startContent={
                              <span
                                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                style={{ backgroundColor: proj.color }}
                              />
                            }
                          >
                            {proj.name}
                          </DropdownItem>
                        )),
                      ]}
                    </DropdownMenu>
                  </Dropdown>
                )}

                {/* Playbook Dropdown */}
                {playbookOptions.length > 0 && (
                  <Dropdown onOpenChange={handleDropdownOpenChange}>
                    <DropdownTrigger>
                      <Button
                        size="sm"
                        variant="bordered"
                        className="h-8 min-w-0 px-3 gap-2 text-xs rounded-md shadow-small"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>{selectedPlaybook ? selectedPlaybook.name : 'Playbook'}</span>
                        <ChevronDown className="w-3 h-3 opacity-50" />
                      </Button>
                    </DropdownTrigger>
                    <DropdownMenu
                      aria-label="Select playbook"
                      selectionMode="single"
                      selectedKeys={
                        form.playbookId ? new Set([form.playbookId]) : new Set<string>()
                      }
                      onAction={(key) => {
                        const id = key as string;
                        setForm((prev) => ({
                          ...prev,
                          playbookId: id === '__none__' ? null : id,
                        }));
                      }}
                    >
                      {[
                        ...(form.playbookId
                          ? [
                              <DropdownItem
                                key="__none__"
                                textValue="No playbook"
                                className="text-default-400"
                              >
                                No playbook
                              </DropdownItem>,
                            ]
                          : []),
                        ...playbookOptions.map((pb) => (
                          <DropdownItem
                            key={pb.id}
                            textValue={pb.name}
                            description={pb.isDefault ? 'Default' : undefined}
                          >
                            {pb.name}
                          </DropdownItem>
                        )),
                      ]}
                    </DropdownMenu>
                  </Dropdown>
                )}

                {/* Delivery Method Dropdown */}
                {!form.parentId && (
                  <Dropdown onOpenChange={handleDropdownOpenChange}>
                    <DropdownTrigger>
                      <Button
                        size="sm"
                        variant="bordered"
                        className="h-8 min-w-0 px-3 gap-2 text-xs rounded-md shadow-small"
                      >
                        <GitBranch className="w-3.5 h-3.5" />
                        <span>{form.deliveryMethod === 'merge-request' ? 'MR' : 'Direct'}</span>
                        <ChevronDown className="w-3 h-3 opacity-50" />
                      </Button>
                    </DropdownTrigger>
                    <DropdownMenu
                      aria-label="Select delivery method"
                      selectionMode="single"
                      selectedKeys={new Set([form.deliveryMethod])}
                      onAction={(key) => {
                        const method = key as 'direct-commit' | 'merge-request';
                        if (method === 'direct-commit') {
                          setForm((prev) => ({
                            ...prev,
                            deliveryMethod: 'direct-commit',
                            featureBranch: '',
                            prTargetBranch: '',
                          }));
                        } else {
                          setForm((prev) => ({ ...prev, deliveryMethod: 'merge-request' }));
                        }
                      }}
                    >
                      <DropdownItem
                        key="direct-commit"
                        textValue="Direct Commit"
                        description="Commit directly to target branch"
                      >
                        Direct Commit
                      </DropdownItem>
                      <DropdownItem
                        key="merge-request"
                        textValue="Merge Request"
                        description="Create feature branch, then PR/MR"
                      >
                        Merge Request
                      </DropdownItem>
                    </DropdownMenu>
                  </Dropdown>
                )}

                {/* Branch Dropdown */}
                {!form.parentId && (
                  <Dropdown isDisabled={!selectedWorkspace} onOpenChange={handleDropdownOpenChange}>
                    <DropdownTrigger>
                      <Button
                        size="sm"
                        variant="bordered"
                        className="h-8 min-w-0 px-3 gap-2 text-xs rounded-md shadow-small"
                        isDisabled={!selectedWorkspace}
                      >
                        <span className="truncate max-w-[120px]">
                          {form.baseBranch ||
                            (selectedWorkspace ? 'Branch' : 'Select workspace first')}
                        </span>
                        <ChevronDown className="w-3 h-3 opacity-50" />
                      </Button>
                    </DropdownTrigger>
                    <DropdownMenu
                      aria-label="Select branch"
                      selectionMode="single"
                      selectedKeys={
                        form.baseBranch ? new Set([form.baseBranch]) : new Set<string>()
                      }
                      onAction={(key) => {
                        const selectedBranch = key as string;
                        if (form.deliveryMethod === 'merge-request') {
                          setForm((prev) => ({
                            ...prev,
                            baseBranch: selectedBranch,
                            featureBranch: generateFeatureBranchName(prev.title, selectedBranch),
                            prTargetBranch: selectedBranch,
                          }));
                        } else {
                          setForm((prev) => ({
                            ...prev,
                            baseBranch: selectedBranch,
                          }));
                        }
                      }}
                    >
                      {(selectedWorkspace?.branches ?? []).map((branch) => (
                        <DropdownItem key={branch} textValue={branch}>
                          {branch}
                        </DropdownItem>
                      ))}
                    </DropdownMenu>
                  </Dropdown>
                )}
              </div>

              {/* Right: action button */}
              <Button color="primary" onPress={handleSubmit} isDisabled={!isFormValid}>
                Create Task
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
