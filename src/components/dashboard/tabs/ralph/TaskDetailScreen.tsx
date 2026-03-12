'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button } from '@heroui/button';
import { Chip } from '@heroui/chip';
import { Input, Textarea } from '@heroui/input';
import { Divider } from '@heroui/divider';
import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from '@heroui/dropdown';
import {
  statusChipClasses,
  infoChipClasses,
  chipSize,
  chipIconClass,
} from '@/components/Primitives';
import {
  Plus,
  FileText,
  CheckCircle,
  GitBranch,
  MessageCircleQuestion,
  ChevronDown,
  ChevronUp,
  Folder,
  ArrowRight,
  ArrowLeft,
  AlertTriangle,
  Zap,
  CheckCircle2,
  Send,
  ExternalLink,
  FileCode,
  Loader2,
  Link,
  Timer,
  BarChart3,
  Trash2,
  MoreVertical,
  BookOpen,
} from 'lucide-react';
import type { PlanningQuestion, StageQuestion } from '@/lib/managers/ralph-task-manager';
import type { RalphTaskStatus, RalphTaskDetail } from './types';
import { getTaskStates, getStatusColors, formatRelativeTime, formatTaskNumber } from './types';
import { useWorkflowDefinition } from '@/hooks/queries/useWorkflowDefinition';
import { useRalphProjects } from '@/hooks/queries/useRalphProjects';
import { useRalphPlaybooks } from '@/hooks/queries/useRalphPlaybooks';
import { useQueryClient } from '@tanstack/react-query';
import { useRalphTaskDetail, useSetRalphTaskDetailCache } from '@/hooks/queries/useRalphTaskDetail';
import {
  useInvalidateRalphTasks,
  useInvalidateRalphTaskDetail,
} from '@/hooks/queries/useInvalidation';
import StageOutputSection from './StageOutputSection';
import { ChatMarkdown } from '@/components/dashboard/tabs/chat/ChatMarkdown';

/**
 * Props for TaskDetailScreen component
 */
interface TaskDetailScreenProps {
  taskId: string;
  onBack: () => void;
  onNavigateToTask: (taskId: string) => void;
  onAnswerQuestion: (taskId: string, questionId: string, answer: string) => Promise<void>;
  onTransition: (taskId: string, toStatus: RalphTaskStatus) => void;
  onCreateSubtask?: (taskId: string) => void;
  onDelete?: (taskId: string) => void;
}

/**
 * TaskDetailScreen component - Full-screen task detail view
 * Replaces the old TaskDetailDrawer modal with a full-screen layout
 */
export default function TaskDetailScreen({
  taskId,
  onBack,
  onNavigateToTask,
  onAnswerQuestion,
  onTransition,
  onCreateSubtask,
  onDelete,
}: TaskDetailScreenProps) {
  const { definition } = useWorkflowDefinition();
  const taskStates = getTaskStates(definition);
  const statusColors = getStatusColors(definition);
  const { data: task = null, isLoading, error: queryError } = useRalphTaskDetail(taskId);
  const { data: allProjects = [] } = useRalphProjects();
  const { data: allPlaybooks = [] } = useRalphPlaybooks();
  const queryClient = useQueryClient();
  const setTaskCache = useSetRalphTaskDetailCache();
  const invalidateDetail = useInvalidateRalphTaskDetail();
  const invalidateTasks = useInvalidateRalphTasks();
  const error = useMemo(
    () =>
      queryError
        ? queryError instanceof Error
          ? queryError.message
          : 'Failed to load task details'
        : null,
    [queryError]
  );
  const [answerInputs, setAnswerInputs] = useState<Record<string, string>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    questions: false,
    completion: false,
    children: false,
  });
  // Inline editing state
  const [newFilePath, setNewFilePath] = useState('');
  const [editFileSuggestions, setEditFileSuggestions] = useState<string[]>([]);
  const [isLoadingEditFiles, setIsLoadingEditFiles] = useState(false);
  const [showEditSuggestions, setShowEditSuggestions] = useState(false);
  const [selectedEditSuggestionIndex, setSelectedEditSuggestionIndex] = useState(-1);
  const editSuggestionsRef = useRef<HTMLDivElement>(null);
  const editDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [_workspaceBranches, setWorkspaceBranches] = useState<string[]>([]);
  const [savingField, setSavingField] = useState<string | null>(null);

  // Statuses where editing is locked
  const LOCKED_STATUSES = ['executing', 'complete'];
  const canEdit = task ? !LOCKED_STATUSES.includes(task.status) : false;

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (editDebounceRef.current) {
        clearTimeout(editDebounceRef.current);
      }
    };
  }, []);

  // Fetch workspace branches when task loads
  useEffect(() => {
    if (task?.workspaceId) {
      fetchWorkspaceBranches();
    }
  }, [task?.workspaceId]);

  // Auto-expand the section matching the task's current stage
  useEffect(() => {
    if (task?.status && task.status !== 'draft' && task.status !== 'complete') {
      setExpandedSections((prev) => ({ ...prev, [task.status]: true }));
    }
  }, [task?.status]);

  // Auto-expand children section if task has children
  useEffect(() => {
    if (task?.childIds && task.childIds.length > 0) {
      setExpandedSections((prev) => ({ ...prev, children: true }));
    }
  }, [task?.childIds?.length]);

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const handleAnswerChange = (questionId: string, value: string) => {
    setAnswerInputs((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleSubmitAnswer = async (questionId: string) => {
    if (!task) return;
    const answer = answerInputs[questionId]?.trim();
    if (!answer) return;

    setSubmittingId(questionId);
    try {
      await onAnswerQuestion(taskId, questionId, answer);
      setAnswerInputs((prev) => {
        const updated = { ...prev };
        delete updated[questionId];
        return updated;
      });
      invalidateDetail(taskId);
      invalidateTasks();
    } catch (err) {
      console.error('[TASK DETAIL SCREEN] Failed to submit answer:', err);
    } finally {
      setSubmittingId(null);
    }
  };

  const handleRunStage = (stageId: string) => {
    if (!task) return;

    const prevTask = task;

    // Auto-expand the stage section so the loading skeleton is visible
    setExpandedSections((prev) => ({ ...prev, [stageId]: true }));

    // Cancel any in-flight detail queries to prevent stale server data
    // from overwriting our optimistic update before the API call completes
    queryClient.cancelQueries({ queryKey: ['ralph-task-detail', taskId] });

    // Optimistic: mark stage as running immediately in the detail cache
    const optimisticStageOutputs = { ...task.stageOutputs };
    const existing = optimisticStageOutputs[stageId];
    optimisticStageOutputs[stageId] = {
      prompt: existing?.prompt ?? '',
      currentIteration: existing?.currentIteration ?? 0,
      maxIterations: existing?.maxIterations ?? 1,
      returnQuestions: existing?.returnQuestions ?? false,
      iterations: existing?.iterations ?? [],
      pendingQuestions: existing?.pendingQuestions ?? [],
      activeJobId: 'optimistic-pending',
      lastUpdated: new Date().toISOString(),
    };

    const optimisticStatus = task.status !== stageId ? stageId : task.status;

    setTaskCache(taskId, {
      ...task,
      status: optimisticStatus,
      stageOutputs: optimisticStageOutputs,
      executionError: null,
    });

    // Fire the API call in the background
    fetch(`/api/ralph/tasks/${taskId}/run-stage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stageName: stageId }),
    })
      .then(async (response) => {
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }
        // Don't set raw task data into the detail cache — the run-stage
        // response returns a RalphTask, not the enriched RalphTaskDetail.
        // The invalidation in .finally() will refetch the enriched version.
      })
      .catch((err) => {
        console.error(`[TASK DETAIL SCREEN] Failed to run stage '${stageId}', rolling back:`, err);
        setTaskCache(taskId, prevTask);
      })
      .finally(() => {
        // Refetch enriched detail data (with real activeJobId) so
        // refetchInterval polling kicks in correctly
        invalidateDetail(taskId);
        invalidateTasks();
      });
  };

  const handleClearIteration = (stageId: string, iterationIndex: number) => {
    if (!task?.stageOutputs?.[stageId]) return;

    const prevTask = task;
    const stageOutput = task.stageOutputs[stageId];
    const updatedIterations = stageOutput.iterations.filter((_, i) => i !== iterationIndex);
    const updatedStageOutputs = {
      ...task.stageOutputs,
      [stageId]: {
        ...stageOutput,
        iterations: updatedIterations,
        currentIteration: updatedIterations.length,
        lastUpdated: new Date().toISOString(),
      },
    };

    // Optimistic cache update
    setTaskCache(taskId, { ...task, stageOutputs: updatedStageOutputs });

    // Persist via PATCH
    fetch(`/api/ralph/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stageOutputs: updatedStageOutputs }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
      })
      .catch((err) => {
        console.error(`[TASK DETAIL SCREEN] Failed to clear iteration:`, err);
        setTaskCache(taskId, prevTask);
      })
      .finally(() => {
        invalidateDetail(taskId);
      });
  };

  const handleCancelLoop = (stageId: string) => {
    if (!task?.stageOutputs?.[stageId]) return;

    const prevTask = task;

    // Optimistic: mark loop as cancelled
    setTaskCache(taskId, {
      ...task,
      stageOutputs: {
        ...task.stageOutputs,
        [stageId]: {
          ...task.stageOutputs[stageId],
          autoLoopActive: false,
          completionReason: 'cancelled' as const,
          lastUpdated: new Date().toISOString(),
        },
      },
    });

    fetch(`/api/ralph/tasks/${taskId}/cancel-loop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stageName: stageId }),
    })
      .then(async (response) => {
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }
      })
      .catch((err) => {
        console.error(`[TASK DETAIL SCREEN] Failed to cancel loop:`, err);
        setTaskCache(taskId, prevTask);
      })
      .finally(() => {
        invalidateDetail(taskId);
      });
  };

  const fetchWorkspaceBranches = async () => {
    if (!task) return;
    try {
      const response = await fetch('/api/ralph/workspaces');
      if (response.ok) {
        const data = await response.json();
        const workspace = data.workspaces?.find(
          (w: { id: string; branches: string[] }) => w.id === task.workspaceId
        );
        if (workspace?.branches) {
          setWorkspaceBranches(workspace.branches);
        }
      }
    } catch (err) {
      console.error('[TASK DETAIL SCREEN] Failed to fetch workspace branches:', err);
    }
  };

  const saveField = async (fieldName: string, value: string | string[] | null) => {
    if (!task || !canEdit) return;

    const currentValue = task[fieldName as keyof RalphTaskDetail];
    if (value === currentValue) return;
    if (
      Array.isArray(value) &&
      Array.isArray(currentValue) &&
      JSON.stringify(value) === JSON.stringify(currentValue)
    )
      return;

    setSavingField(fieldName);
    try {
      const response = await fetch(`/api/ralph/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [fieldName]: value }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      setTaskCache(taskId, data.task);
      invalidateTasks();
    } catch (err) {
      console.error(`[TASK DETAIL SCREEN] Failed to save ${fieldName}:`, err);
      invalidateDetail(taskId);
    } finally {
      setSavingField(null);
    }
  };

  const addFilePath = async () => {
    if (!task) return;
    const trimmed = newFilePath.trim();
    if (trimmed && !task.filePaths.includes(trimmed)) {
      await saveField('filePaths', [...task.filePaths, trimmed]);
      setNewFilePath('');
      setShowEditSuggestions(false);
    }
  };

  const fetchEditFileSuggestions = useCallback(
    async (query: string) => {
      if (!task?.workspaceId || query.length < 1) {
        setEditFileSuggestions([]);
        setShowEditSuggestions(false);
        return;
      }
      setIsLoadingEditFiles(true);
      try {
        const params = new URLSearchParams({ q: query, limit: '20' });
        const response = await fetch(`/api/ralph/workspaces/${task.workspaceId}/files?${params}`);
        if (response.ok) {
          const data = await response.json();
          const filtered = (data.files as string[]).filter(
            (f: string) => !task.filePaths.includes(f)
          );
          setEditFileSuggestions(filtered);
          setShowEditSuggestions(filtered.length > 0);
          setSelectedEditSuggestionIndex(-1);
        }
      } catch {
        // Silently fail
      } finally {
        setIsLoadingEditFiles(false);
      }
    },
    [task?.workspaceId, task?.filePaths]
  );

  const handleEditFilePathChange = useCallback(
    (value: string) => {
      setNewFilePath(value);
      if (editDebounceRef.current) {
        clearTimeout(editDebounceRef.current);
      }
      if (value.trim().length >= 1) {
        editDebounceRef.current = setTimeout(() => {
          fetchEditFileSuggestions(value.trim());
        }, 250);
      } else {
        setEditFileSuggestions([]);
        setShowEditSuggestions(false);
      }
    },
    [fetchEditFileSuggestions]
  );

  const selectEditSuggestion = async (path: string) => {
    if (!task) return;
    if (!task.filePaths.includes(path)) {
      await saveField('filePaths', [...task.filePaths, path]);
    }
    setNewFilePath('');
    setEditFileSuggestions([]);
    setShowEditSuggestions(false);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (editSuggestionsRef.current && !editSuggestionsRef.current.contains(e.target as Node)) {
        setShowEditSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const removeFilePath = async (path: string) => {
    if (!task) return;
    await saveField(
      'filePaths',
      task.filePaths.filter((p) => p !== path)
    );
  };

  const taskPlaybook = useMemo(
    () => (task?.playbookId ? allPlaybooks.find((p) => p.id === task.playbookId) : null),
    [task?.playbookId, allPlaybooks]
  );
  const allStatuses = useMemo(() => {
    const stages = definition.stages.map((s) => s.id);
    if (taskPlaybook) {
      // Only show draft + playbook stages + complete
      const pbStages = taskPlaybook.stageIds.filter((id) => stages.includes(id));
      return ['draft', ...pbStages, 'complete'];
    }
    return ['draft', ...stages, 'complete'];
  }, [definition.stages, taskPlaybook]);

  // Aggregate questions from all stage outputs
  const aggregatedQuestions = useMemo(() => {
    const questions: (PlanningQuestion | StageQuestion)[] = [];
    if (task?.stageOutputs) {
      for (const [, stageOutput] of Object.entries(task.stageOutputs)) {
        if (stageOutput.pendingQuestions) {
          for (const sq of stageOutput.pendingQuestions) {
            if (!questions.some((q) => q.id === sq.id)) {
              questions.push(sq);
            }
          }
        }
      }
    }
    return questions;
  }, [task?.stageOutputs]);

  const pendingQuestions = aggregatedQuestions.filter((q) => !q.answer);
  const answeredQuestions = aggregatedQuestions.filter((q) => q.answer);
  const allQuestions = aggregatedQuestions;

  // Check if current stage has a prompt configured (for "Continue" button visibility)
  const currentStageDef = task ? definition.stages.find((s) => s.id === task.status) : undefined;
  const currentStageHasPrompt = !!currentStageDef?.config.prompt;

  return (
    <div className="flex flex-col h-full">
      {/* Sticky Header */}
      <div className="flex-shrink-0 px-8 pt-8 pb-6">
        {isLoading && !task ? (
          <div className="flex items-center gap-5">
            <Button size="sm" variant="light" isIconOnly onPress={onBack}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
            <span className="text-default-500">Loading task...</span>
          </div>
        ) : error && !task ? (
          <div className="flex items-center gap-5">
            <Button size="sm" variant="light" isIconOnly onPress={onBack}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="text-danger">{error}</div>
          </div>
        ) : task ? (
          <>
            {/* Parent task label */}
            {task.parentId && (
              <div className="flex items-center gap-6 mb-3">
                <div className="w-8" /> {/* spacer to align with title */}
                <Chip
                  size={chipSize}
                  variant="flat"
                  classNames={infoChipClasses}
                  startContent={
                    <span className={chipIconClass}>
                      <Link className={chipIconClass} />
                    </span>
                  }
                >
                  Child of {task.parentTitle || task.parentId}
                </Chip>
              </div>
            )}

            {/* Slim header: Back + Task Number + Action buttons */}
            <div className="flex items-center gap-6">
              <Button size="sm" variant="light" isIconOnly onPress={onBack}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              {task.taskNumber != null && (
                <span className="text-sm text-default-400 font-mono flex-shrink-0">
                  {formatTaskNumber(task.taskNumber)}
                </span>
              )}
              <div className="flex-1" />
              {/* Action buttons */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {!task.parentId && onCreateSubtask && (
                  <Button
                    size="sm"
                    variant="flat"
                    color="default"
                    startContent={<Plus className="w-4 h-4" />}
                    onPress={() => onCreateSubtask(task.id)}
                  >
                    Add Subtask
                  </Button>
                )}
                {onDelete && (
                  <Dropdown>
                    <DropdownTrigger>
                      <Button isIconOnly size="sm" variant="light">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownTrigger>
                    <DropdownMenu
                      aria-label="Task actions"
                      onAction={(key) => {
                        if (key === 'delete') onDelete(task.id);
                      }}
                    >
                      <DropdownItem
                        key="delete"
                        color="danger"
                        className="text-danger"
                        startContent={<Trash2 className="w-4 h-4" />}
                      >
                        Delete
                      </DropdownItem>
                    </DropdownMenu>
                  </Dropdown>
                )}
              </div>
            </div>
          </>
        ) : null}
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {isLoading && !task ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : error && !task ? (
          <div className="text-center py-8">
            <AlertTriangle className="w-8 h-8 text-danger mx-auto mb-2" />
            <p className="text-danger">{error}</p>
            <Button
              size="sm"
              color="primary"
              variant="flat"
              className="mt-4"
              onPress={() => invalidateDetail(taskId)}
            >
              Retry
            </Button>
          </div>
        ) : task ? (
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-8 items-start">
            {/* Main Content */}
            <div className="space-y-5 order-2 xl:order-1">
              {/* Title - big, editable */}
              <div>
                {canEdit ? (
                  <Input
                    size="lg"
                    defaultValue={task.title}
                    onBlur={(e) => saveField('title', e.target.value)}
                    variant="underlined"
                    placeholder="Task title"
                    classNames={{
                      input: 'text-2xl font-bold',
                      inputWrapper:
                        'border-transparent hover:border-transparent focus-within:border-transparent bg-transparent px-0 after:bg-transparent',
                    }}
                    endContent={
                      savingField === 'title' && (
                        <Loader2 className="w-4 h-4 animate-spin text-default-400" />
                      )
                    }
                  />
                ) : (
                  <h2 className="text-2xl font-bold">{task.title}</h2>
                )}
              </div>

              {/* Description - floating markdown, no label, no container */}
              <div>
                {canEdit ? (
                  <div>
                    <Textarea
                      defaultValue={task.description || ''}
                      onBlur={(e) => saveField('description', e.target.value || null)}
                      variant="underlined"
                      minRows={15}
                      placeholder="Add a description..."
                      classNames={{
                        inputWrapper:
                          'border-transparent hover:border-transparent focus-within:border-transparent bg-transparent px-0 after:bg-transparent',
                        input: 'text-sm',
                      }}
                    />
                    {savingField === 'description' && (
                      <Loader2 className="w-3 h-3 animate-spin text-default-400 mt-1" />
                    )}
                  </div>
                ) : task.description ? (
                  <ChatMarkdown content={task.description} />
                ) : (
                  <p className="text-sm italic text-default-400">Add a description...</p>
                )}
              </div>

              {/* Timestamps */}
              <div className="flex gap-4 text-xs text-default-400">
                <span>Created {formatRelativeTime(task.createdAt)}</span>
                <span>Updated {formatRelativeTime(task.updatedAt)}</span>
              </div>

              {/* Draft + Playbook: Run Playbook action */}
              {task.status === 'draft' &&
                taskPlaybook &&
                (() => {
                  const firstStage = taskPlaybook.stageIds[0];
                  if (!firstStage) return null;
                  return (
                    <div className="p-3 bg-primary-50 dark:bg-primary-500/10 border border-primary-200 dark:border-primary-500/30 rounded-lg space-y-2.5">
                      <div className="flex items-center gap-3">
                        <Zap className="w-4 h-4 text-primary-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">
                            Ready to run{' '}
                            <span className="text-primary-600 dark:text-primary-400">
                              {taskPlaybook.name}
                            </span>
                          </p>
                        </div>
                        <Button
                          size="sm"
                          color="primary"
                          startContent={<Zap className="w-3.5 h-3.5" />}
                          onPress={() => handleRunStage(firstStage)}
                        >
                          Run Playbook
                        </Button>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {taskPlaybook.stageIds.map((stageId, idx) => {
                          const stageLabel =
                            taskStates.find((s) => s.key === stageId)?.label ?? stageId;
                          const color = statusColors[stageId] ?? 'default';
                          return (
                            <React.Fragment key={stageId}>
                              {idx > 0 && (
                                <ArrowRight className="w-3 h-3 text-default-300 flex-shrink-0" />
                              )}
                              <Chip size="sm" variant="flat" color={color}>
                                {stageLabel}
                              </Chip>
                            </React.Fragment>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

              {/* Child Tasks Section */}
              {task.childIds && task.childIds.length > 0 && (
                <div className="border border-divider rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleSection('children')}
                    className="w-full flex items-center justify-between p-3 bg-content2 hover:bg-content3 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Subtasks</span>
                      <Chip size="sm" color="secondary" variant="flat">
                        {task.childIds.length}
                      </Chip>
                    </div>
                    {expandedSections.children ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>

                  {expandedSections.children && (
                    <div className="p-3 space-y-2">
                      {(
                        task.childTasks ||
                        task.childIds.map((id) => ({ id, title: id, status: 'draft' as const }))
                      ).map((child) => (
                        <button
                          key={child.id}
                          type="button"
                          onClick={() => onNavigateToTask(child.id)}
                          className="w-full text-left p-2 bg-content1 rounded border border-divider hover:border-primary/50 transition-colors flex items-center gap-2 group"
                        >
                          <Chip
                            size="sm"
                            color={statusColors[child.status] ?? 'default'}
                            variant="flat"
                            className="flex-shrink-0"
                          >
                            {child.status}
                          </Chip>
                          <span className="text-sm text-default-600 group-hover:text-primary transition-colors truncate">
                            {child.title}
                          </span>
                          <ExternalLink className="w-3 h-3 text-default-300 group-hover:text-primary ml-auto flex-shrink-0 transition-colors" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Questions Section */}
              {allQuestions.length > 0 && (
                <div className="border border-divider rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleSection('questions')}
                    className="w-full flex items-center justify-between p-3 bg-content2 hover:bg-content3 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <MessageCircleQuestion className="w-4 h-4 text-warning-500" />
                      <span className="font-medium">Questions</span>
                      {pendingQuestions.length > 0 && (
                        <Chip size="sm" color="warning" variant="flat">
                          {pendingQuestions.length} pending
                        </Chip>
                      )}
                    </div>
                    {expandedSections.questions ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>

                  {expandedSections.questions && (
                    <div className="p-3 space-y-3">
                      {allQuestions.length === 0 ? (
                        <p className="text-sm text-default-500 text-center py-4">
                          No questions yet. Start planning to generate questions.
                        </p>
                      ) : (
                        <>
                          {pendingQuestions.map(
                            (question: PlanningQuestion | StageQuestion, index: number) => (
                              <div
                                key={question.id}
                                className="p-3 bg-warning-50 dark:bg-warning-500/10 border border-warning-200 dark:border-warning-500/30 rounded-lg space-y-2"
                              >
                                <div className="flex items-start gap-2">
                                  <span className="text-xs font-bold text-warning-600 bg-warning-100 dark:bg-warning-500/20 px-1.5 py-0.5 rounded">
                                    Q{index + 1}
                                  </span>
                                  <div className="flex-1">
                                    <p className="text-sm font-medium">{question.question}</p>
                                    {question.context && (
                                      <p className="text-xs text-default-500 mt-1">
                                        {question.context}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                {'options' in question &&
                                  question.options &&
                                  question.options.length > 0 && (
                                    <div className="flex flex-wrap gap-1 ml-6">
                                      {question.options.map((option: string, optIdx: number) => (
                                        <Button
                                          key={optIdx}
                                          size="sm"
                                          variant="flat"
                                          color="default"
                                          className="text-xs"
                                          onPress={() => handleAnswerChange(question.id, option)}
                                        >
                                          {option}
                                        </Button>
                                      ))}
                                    </div>
                                  )}
                                <div className="flex gap-2 ml-6">
                                  <Textarea
                                    size="sm"
                                    placeholder="Type your answer..."
                                    value={answerInputs[question.id] || ''}
                                    onChange={(e) =>
                                      handleAnswerChange(question.id, e.target.value)
                                    }
                                    variant="bordered"
                                    minRows={2}
                                    className="flex-1"
                                  />
                                  <Button
                                    size="sm"
                                    color="primary"
                                    isLoading={submittingId === question.id}
                                    isDisabled={!answerInputs[question.id]?.trim()}
                                    onPress={() => handleSubmitAnswer(question.id)}
                                  >
                                    <Send className="w-4 h-4" />
                                  </Button>
                                </div>
                              </div>
                            )
                          )}

                          {answeredQuestions.length > 0 && (
                            <>
                              <Divider className="my-3" />
                              <p className="text-xs text-default-500 font-medium flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-success-500" />
                                {answeredQuestions.length} answered
                              </p>
                              {answeredQuestions.map(
                                (question: PlanningQuestion | StageQuestion, index: number) => (
                                  <div
                                    key={question.id}
                                    className="p-3 bg-success-50 dark:bg-success-500/10 border border-success-200 dark:border-success-500/30 rounded-lg space-y-1"
                                  >
                                    <div className="flex items-start gap-2">
                                      <span className="text-xs font-bold text-success-600 bg-success-100 dark:bg-success-500/20 px-1.5 py-0.5 rounded">
                                        Q{pendingQuestions.length + index + 1}
                                      </span>
                                      <div className="flex-1">
                                        <p className="text-sm">{question.question}</p>
                                        {question.answer && (
                                          <p className="text-sm font-medium text-success-700 dark:text-success-400 mt-1">
                                            A: {question.answer}
                                          </p>
                                        )}
                                        {question.answeredAt && (
                                          <p className="text-xs text-default-400 mt-1">
                                            Answered {formatRelativeTime(question.answeredAt)}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                )
                              )}
                            </>
                          )}

                          {pendingQuestions.length === 0 &&
                            answeredQuestions.length > 0 &&
                            currentStageHasPrompt && (
                              <div className="pt-2">
                                <Button
                                  size="sm"
                                  color="primary"
                                  startContent={<ArrowRight className="w-4 h-4" />}
                                  onPress={() => handleRunStage(task.status)}
                                >
                                  Continue {currentStageDef?.label ?? task.status}
                                </Button>
                                <p className="text-xs text-default-500 mt-1">
                                  All questions answered. Continue to generate next iteration.
                                </p>
                              </div>
                            )}

                          {pendingQuestions.length > 0 && currentStageHasPrompt && (
                            <div className="pt-2 mt-2 border-t border-divider">
                              <div className="flex items-center gap-2 mb-2">
                                <AlertTriangle className="w-4 h-4 text-warning-500" />
                                <span className="text-xs text-warning-600 dark:text-warning-400">
                                  {pendingQuestions.length} question
                                  {pendingQuestions.length !== 1 ? 's' : ''} unanswered
                                </span>
                              </div>
                              <Button
                                size="sm"
                                color="warning"
                                variant="flat"
                                startContent={<ArrowRight className="w-4 h-4" />}
                                onPress={() => handleRunStage(task.status)}
                              >
                                Continue with Unanswered
                              </Button>
                              <p className="text-xs text-default-500 mt-1">
                                Stage will continue without answers to pending questions.
                                {answeredQuestions.length > 0 && (
                                  <span className="block mt-0.5 text-success-600 dark:text-success-400">
                                    {answeredQuestions.length} answer
                                    {answeredQuestions.length !== 1 ? 's' : ''} will be included.
                                  </span>
                                )}
                              </p>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Generic Stage Output Sections */}
              {definition.stages.map((stageDef, stageIdx) => {
                const stageOutput = task.stageOutputs?.[stageDef.id];
                const isCurrentStage = task.status === stageDef.id;
                const hasOutput =
                  stageOutput && (stageOutput.iterations.length > 0 || stageOutput.activeJobId);

                // Only show stages the task has reached (or that have existing output)
                const currentStageIdx = definition.stages.findIndex((s) => s.id === task.status);
                const isFutureStage =
                  task.status === 'draft' || (currentStageIdx >= 0 && stageIdx > currentStageIdx);
                if (isFutureStage && !hasOutput) return null;

                // Show section if: has output or is current stage
                if (!hasOutput && !isCurrentStage) return null;

                return (
                  <StageOutputSection
                    key={stageDef.id}
                    stageDef={stageDef}
                    stageOutput={stageOutput}
                    isCurrentStage={isCurrentStage}
                    isExpanded={!!expandedSections[stageDef.id]}
                    onToggle={() => toggleSection(stageDef.id)}
                    onRunStage={() => handleRunStage(stageDef.id)}
                    isRunning={false}
                    onClearIteration={(iterationIndex) =>
                      handleClearIteration(stageDef.id, iterationIndex)
                    }
                    onCancelLoop={() => handleCancelLoop(stageDef.id)}
                    executionError={isCurrentStage ? task.executionError : null}
                  />
                );
              })}

              {/* Completion Info Section */}
              {task.status === 'complete' && (
                <div className="border border-divider rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleSection('completion')}
                    className="w-full flex items-center justify-between p-3 bg-content2 hover:bg-content3 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-success-500" />
                      <span className="font-medium">Completion Info</span>
                      {task.prUrl && (
                        <Chip size="sm" color="success" variant="flat">
                          PR
                        </Chip>
                      )}
                    </div>
                    {expandedSections.completion ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>
                  {expandedSections.completion && (
                    <div className="p-4 space-y-3">
                      {task.prUrl && (
                        <div className="flex items-center gap-2">
                          <Link className="w-4 h-4 text-success-600" />
                          <a
                            href={task.prUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary-600 hover:underline flex items-center gap-1"
                          >
                            View {task.gitProvider === 'gitlab' ? 'Merge' : 'Pull'} Request
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      )}
                      <div className="space-y-1 text-sm text-default-500">
                        {task.completedAt && (
                          <div className="flex items-center gap-1">
                            <Timer className="w-3 h-3" />
                            <span>Completed {formatRelativeTime(task.completedAt)}</span>
                          </div>
                        )}
                        {task.totalIterations > 0 ? (
                          <div className="flex items-center gap-1">
                            <BarChart3 className="w-3 h-3" />
                            <span>{task.totalIterations} planning iterations</span>
                          </div>
                        ) : !task.parentId && task.childIds?.length === 0 ? (
                          <div className="flex items-center gap-1">
                            <Zap className="w-3 h-3" />
                            <span>Direct execution (no planning needed)</span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-4 order-1 xl:order-2 xl:sticky xl:top-0">
              {/* Status */}
              <div>
                <div className="text-xs font-medium text-default-500 uppercase tracking-wider mb-1.5">
                  Status
                </div>
                <Dropdown>
                  <DropdownTrigger>
                    <Chip
                      size={chipSize}
                      variant="solid"
                      color={statusColors[task.status] ?? 'default'}
                      classNames={{
                        ...statusChipClasses,
                        base: `${statusChipClasses.base} cursor-pointer`,
                      }}
                      style={{ transform: 'none', opacity: 1 }}
                      startContent={
                        <span className={chipIconClass}>
                          {React.createElement(
                            taskStates.find((s) => s.key === task.status)?.icon || FileText,
                            { className: chipIconClass }
                          )}
                        </span>
                      }
                    >
                      {taskStates.find((s) => s.key === task.status)?.label || task.status}
                    </Chip>
                  </DropdownTrigger>
                  <DropdownMenu
                    aria-label="Change status"
                    selectionMode="single"
                    selectedKeys={new Set([task.status])}
                    disabledKeys={new Set([task.status])}
                    onAction={(key) => {
                      if (key !== task.status) onTransition(task.id, key as RalphTaskStatus);
                    }}
                  >
                    {allStatuses.map((status) => {
                      const color = statusColors[status] ?? 'default';
                      const colorClass =
                        color === 'default'
                          ? 'bg-default-400'
                          : color === 'warning'
                            ? 'bg-warning'
                            : color === 'secondary'
                              ? 'bg-secondary'
                              : color === 'success'
                                ? 'bg-success'
                                : color === 'danger'
                                  ? 'bg-danger'
                                  : 'bg-primary';
                      const stageLabel = taskStates.find((s) => s.key === status)?.label ?? status;
                      return (
                        <DropdownItem
                          key={status}
                          startContent={<span className={`w-2 h-2 rounded-full ${colorClass}`} />}
                        >
                          {stageLabel}
                        </DropdownItem>
                      );
                    })}
                  </DropdownMenu>
                </Dropdown>
              </div>

              {/* Workspace */}
              <div>
                <div className="text-xs font-medium text-default-500 uppercase tracking-wider mb-1.5">
                  Workspace
                </div>
                <div className="flex items-center gap-1.5 text-sm text-default-700">
                  <Folder className="w-3.5 h-3.5 text-default-400 flex-shrink-0" />
                  <span className="truncate">{task.workspaceName}</span>
                </div>
              </div>

              {/* Branch */}
              {(task.featureBranch ||
                (task.deliveryMethod === 'direct-commit' && task.baseBranch)) && (
                <div>
                  <div className="text-xs font-medium text-default-500 uppercase tracking-wider mb-1.5">
                    Branch
                  </div>
                  <div className="flex items-center gap-1.5 text-sm font-mono text-default-700">
                    <GitBranch className="w-3.5 h-3.5 text-default-400 flex-shrink-0" />
                    <span className="truncate">
                      {task.deliveryMethod === 'direct-commit'
                        ? `${task.baseBranch} (direct)`
                        : task.featureBranch}
                    </span>
                  </div>
                </div>
              )}

              {/* Project */}
              {allProjects.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-default-500 uppercase tracking-wider mb-1.5">
                    Project
                  </div>
                  <Dropdown>
                    <DropdownTrigger>
                      {task.projectId ? (
                        (() => {
                          const project = allProjects.find((p) => p.id === task.projectId);
                          return (
                            <Chip
                              as="button"
                              size={chipSize}
                              variant="flat"
                              classNames={infoChipClasses}
                              className="cursor-pointer"
                              startContent={
                                project ? (
                                  <span
                                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: project.color }}
                                  />
                                ) : undefined
                              }
                            >
                              {project?.name ?? 'Unknown Project'}
                            </Chip>
                          );
                        })()
                      ) : (
                        <Chip
                          as="button"
                          size={chipSize}
                          variant="flat"
                          classNames={infoChipClasses}
                          className="cursor-pointer"
                          startContent={<Folder className="w-3 h-3 text-default-400" />}
                        >
                          No Project
                        </Chip>
                      )}
                    </DropdownTrigger>
                    <DropdownMenu
                      aria-label="Change project"
                      onAction={(key) => {
                        const projectId = key === 'none' ? null : String(key);
                        saveField('projectId', projectId);
                      }}
                    >
                      {[
                        ...(task.projectId ? [{ id: 'none', name: 'No Project', color: '' }] : []),
                        ...allProjects.filter((p) => p.id !== task.projectId),
                      ].map((p) => (
                        <DropdownItem
                          key={p.id}
                          startContent={
                            p.color ? (
                              <span
                                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                style={{ backgroundColor: p.color }}
                              />
                            ) : undefined
                          }
                        >
                          {p.name}
                        </DropdownItem>
                      ))}
                    </DropdownMenu>
                  </Dropdown>
                </div>
              )}

              {/* Playbook */}
              {allPlaybooks.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-default-500 uppercase tracking-wider mb-1.5">
                    Playbook
                  </div>
                  <Dropdown isDisabled={task.status !== 'draft'}>
                    <DropdownTrigger>
                      {task.playbookId ? (
                        (() => {
                          const playbook = allPlaybooks.find((p) => p.id === task.playbookId);
                          return (
                            <Chip
                              as="button"
                              size={chipSize}
                              variant="flat"
                              classNames={infoChipClasses}
                              className={
                                task.status === 'draft'
                                  ? 'cursor-pointer'
                                  : 'cursor-default opacity-70'
                              }
                              isDisabled={task.status !== 'draft'}
                              startContent={<BookOpen className="w-3 h-3 text-default-500" />}
                            >
                              {playbook?.name ?? 'Unknown Playbook'}
                            </Chip>
                          );
                        })()
                      ) : (
                        <Chip
                          as="button"
                          size={chipSize}
                          variant="flat"
                          classNames={infoChipClasses}
                          className={
                            task.status === 'draft' ? 'cursor-pointer' : 'cursor-default opacity-70'
                          }
                          isDisabled={task.status !== 'draft'}
                          startContent={<BookOpen className="w-3 h-3 text-default-400" />}
                        >
                          No Playbook
                        </Chip>
                      )}
                    </DropdownTrigger>
                    <DropdownMenu
                      aria-label="Change playbook"
                      onAction={(key) => {
                        const playbookId = key === 'none' ? null : String(key);
                        saveField('playbookId', playbookId);
                      }}
                    >
                      {[
                        ...(task.playbookId
                          ? [
                              {
                                id: 'none',
                                name: 'No Playbook',
                                description: '',
                                stageIds: [] as string[],
                                isDefault: false,
                              },
                            ]
                          : []),
                        ...allPlaybooks.filter((p) => p.id !== task.playbookId),
                      ].map((p) => (
                        <DropdownItem key={p.id} description={p.isDefault ? 'Default' : undefined}>
                          {p.name}
                        </DropdownItem>
                      ))}
                    </DropdownMenu>
                  </Dropdown>
                </div>
              )}

              {/* Delivery */}
              {task.deliveryMethod && (
                <div>
                  <div className="text-xs font-medium text-default-500 uppercase tracking-wider mb-1.5">
                    Delivery
                  </div>
                  <div className="text-sm text-default-700 capitalize">
                    {task.deliveryMethod.replace(/-/g, ' ')}
                  </div>
                </div>
              )}

              <Divider />

              {/* File Paths */}
              <div>
                <div className="text-xs font-medium text-default-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <FileCode className="w-3 h-3" />
                  File Paths
                  {savingField === 'filePaths' && <Loader2 className="w-3 h-3 animate-spin" />}
                </div>
                <div className="flex flex-wrap gap-1 mb-2 max-h-24 overflow-y-auto">
                  {task.filePaths.map((path) =>
                    canEdit ? (
                      <Chip
                        key={path}
                        size="sm"
                        variant="flat"
                        onClose={() => removeFilePath(path)}
                      >
                        {path}
                      </Chip>
                    ) : (
                      <Chip key={path} size="sm" variant="flat">
                        {path}
                      </Chip>
                    )
                  )}
                  {task.filePaths.length === 0 && !canEdit && (
                    <span className="text-xs text-default-400">No files specified</span>
                  )}
                </div>
                {canEdit && (
                  <div className="relative" ref={editSuggestionsRef}>
                    <div className="flex gap-2">
                      <Input
                        size="sm"
                        value={newFilePath}
                        onChange={(e) => handleEditFilePathChange(e.target.value)}
                        onFocus={() => {
                          if (editFileSuggestions.length > 0) setShowEditSuggestions(true);
                        }}
                        variant="bordered"
                        placeholder="Start typing to search files..."
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (
                              showEditSuggestions &&
                              selectedEditSuggestionIndex >= 0 &&
                              selectedEditSuggestionIndex < editFileSuggestions.length
                            ) {
                              selectEditSuggestion(
                                editFileSuggestions[selectedEditSuggestionIndex]!
                              );
                            } else {
                              addFilePath();
                            }
                          } else if (e.key === 'ArrowDown' && showEditSuggestions) {
                            e.preventDefault();
                            setSelectedEditSuggestionIndex((prev) =>
                              prev < editFileSuggestions.length - 1 ? prev + 1 : 0
                            );
                          } else if (e.key === 'ArrowUp' && showEditSuggestions) {
                            e.preventDefault();
                            setSelectedEditSuggestionIndex((prev) =>
                              prev > 0 ? prev - 1 : editFileSuggestions.length - 1
                            );
                          } else if (e.key === 'Escape') {
                            setShowEditSuggestions(false);
                          }
                        }}
                        className="flex-1"
                        endContent={
                          isLoadingEditFiles ? (
                            <Loader2 className="w-3 h-3 animate-spin text-default-400" />
                          ) : null
                        }
                      />
                      <Button
                        size="sm"
                        variant="flat"
                        onPress={addFilePath}
                        isDisabled={!newFilePath.trim()}
                      >
                        Add
                      </Button>
                    </div>
                    {showEditSuggestions && editFileSuggestions.length > 0 && (
                      <div className="absolute z-50 w-full mt-1 max-h-40 overflow-y-auto rounded-md border border-divider bg-content1 shadow-sm">
                        {editFileSuggestions.map((suggestion, index) => (
                          <button
                            key={suggestion}
                            type="button"
                            className={`w-full text-left px-3 py-1.5 text-xs hover:bg-default-100 cursor-pointer flex items-center gap-2 ${
                              index === selectedEditSuggestionIndex ? 'bg-default-100' : ''
                            }`}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              selectEditSuggestion(suggestion);
                            }}
                          >
                            <FileCode className="w-3 h-3 text-default-400 flex-shrink-0" />
                            <span className="truncate">{suggestion}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
