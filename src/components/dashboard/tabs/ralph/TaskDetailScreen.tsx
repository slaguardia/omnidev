'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button } from '@heroui/button';
import { Chip } from '@heroui/chip';
import { Input, Textarea } from '@heroui/input';

import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from '@heroui/dropdown';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/modal';
import { Popover, PopoverTrigger, PopoverContent } from '@heroui/popover';
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
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Folder,
  ArrowRight,
  ArrowLeft,
  AlertTriangle,
  Zap,
  ExternalLink,
  FileCode,
  Loader2,
  Link,
  Timer,
  BarChart3,
  Trash2,
  MoreVertical,
  BookOpen,
  Package,
  X,
} from 'lucide-react';
import type { StageQuestion } from '@/lib/managers/ralph-task-manager';
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
import DependencySection from './DependencySection';
import { ChatMarkdown } from '@/components/dashboard/tabs/chat/ChatMarkdown';

/** Fills space next to the row icon so branch/delivery controls share one column width */
const SIDEBAR_PROP_CONTROL_WRAP = 'min-w-0 flex-1';

/**
 * Branch + delivery dropdowns — identical native buttons (HeroUI bordered Button
 * used different border tokens and looked heavier than plain buttons in dark mode).
 * Uses `border-divider` to match TaskCard / board controls.
 */
const SIDEBAR_PROP_SELECT_TRIGGER =
  'flex h-8 w-full min-w-0 cursor-pointer items-center justify-between gap-2 rounded-md border border-divider bg-content1 px-2.5 text-left text-sm text-foreground shadow-sm transition-colors hover:bg-content2/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 dark:hover:bg-content2/40';

/** Locked / read-only value — same border weight as triggers */
const SIDEBAR_PROP_VALUE_BOX =
  'flex h-8 w-full min-w-0 items-center rounded-md border border-divider bg-content2/25 px-2.5 text-sm text-default-700 dark:bg-content2/20';

/**
 * Props for TaskDetailScreen component
 */
interface TaskDetailScreenProps {
  taskId: string;
  onBack: () => void;
  onNavigateToTask: (taskId: string) => void;
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
  onTransition,
  onCreateSubtask,
  onDelete,
}: TaskDetailScreenProps) {
  const { definition } = useWorkflowDefinition();
  const taskStates = getTaskStates(definition);
  const statusColors = getStatusColors(definition);
  const [stageRunPending, setStageRunPending] = useState(false);
  const {
    data: task = null,
    isLoading,
    error: queryError,
  } = useRalphTaskDetail(taskId, { suppressRefetch: stageRunPending });
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
  const [savingAnswerId, setSavingAnswerId] = useState<string | null>(null);
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [pendingTransition, setPendingTransition] = useState<{
    toStatus: string;
    unansweredCount: number;
    stageName: string;
  } | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    completion: false,
    children: false,
    sidebarProperties: true,
    sidebarDetails: true,
    sidebarDeps: true,
    sidebarFiles: false,
  });
  // Inline editing state
  const [newFilePath, setNewFilePath] = useState('');
  const [editFileSuggestions, setEditFileSuggestions] = useState<string[]>([]);
  const [isLoadingEditFiles, setIsLoadingEditFiles] = useState(false);
  const [showEditSuggestions, setShowEditSuggestions] = useState(false);
  const [selectedEditSuggestionIndex, setSelectedEditSuggestionIndex] = useState(-1);
  const editSuggestionsRef = useRef<HTMLDivElement>(null);
  const editDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [workspaceBranches, setWorkspaceBranches] = useState<string[]>([]);
  const [branchInput, setBranchInput] = useState('');
  const [isBranchPopoverOpen, setIsBranchPopoverOpen] = useState(false);
  const [savingField, setSavingField] = useState<string | null>(null);

  // Statuses where editing is locked
  const LOCKED_STATUSES = ['executing', 'complete'];
  const canEdit = task ? !LOCKED_STATUSES.includes(task.status) : false;
  /** Branch name + MR vs direct — only editable in draft (permissions to push are separate). */
  const canEditBranchConfig = task?.status === 'draft';

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

  /** Find which stage a question belongs to */
  const findStageForQuestion = (questionId: string): string | null => {
    if (!task?.stageOutputs) return null;
    for (const [stageName, so] of Object.entries(task.stageOutputs)) {
      if (so.pendingQuestions?.some((q: StageQuestion) => q.id === questionId)) {
        return stageName;
      }
    }
    return null;
  };

  /** Auto-save answer on blur (like description field) */
  const handleAnswerBlur = async (questionId: string) => {
    if (!task) return;
    const answer = answerInputs[questionId]?.trim();
    if (!answer) return;

    const stageName = findStageForQuestion(questionId);
    if (!stageName) return;

    // Check if answer actually changed from what's stored
    const existingQ = task.stageOutputs?.[stageName]?.pendingQuestions?.find(
      (q: StageQuestion) => q.id === questionId
    );
    if (answer === existingQ?.answer) return;

    setSavingAnswerId(questionId);
    try {
      // Call API directly with the correct stage name
      await fetch(`/api/ralph/tasks/${taskId}/stage-answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageName, answers: { [questionId]: answer } }),
      });
      invalidateDetail(taskId);
      invalidateTasks();
    } catch (err) {
      console.error('[TASK DETAIL SCREEN] Failed to save answer:', err);
    } finally {
      setSavingAnswerId(null);
    }
  };

  /** Dismiss/delete a question */
  const handleDismissQuestion = async (questionId: string) => {
    if (!task) return;

    const stageName = findStageForQuestion(questionId);
    if (!stageName) return;

    setDismissingId(questionId);
    try {
      // Call API directly with the correct stage name
      const response = await fetch(`/api/ralph/tasks/${taskId}/stage-answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageName, dismiss: [questionId] }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      setAnswerInputs((prev) => {
        const updated = { ...prev };
        delete updated[questionId];
        return updated;
      });
      invalidateDetail(taskId);
      invalidateTasks();
    } catch (err) {
      console.error('[TASK DETAIL SCREEN] Failed to dismiss question:', err);
    } finally {
      setDismissingId(null);
    }
  };

  /** Flush all unsaved answer inputs to the API in a single batch call. */
  const flushUnsavedAnswers = async (stageName: string): Promise<void> => {
    if (!task) return;

    const stageQuestions = task.stageOutputs?.[stageName]?.pendingQuestions ?? [];
    const dirtyAnswers: Record<string, string> = {};
    for (const q of stageQuestions) {
      const local = answerInputs[q.id]?.trim();
      if (local && local !== (q.answer ?? '')) {
        dirtyAnswers[q.id] = local;
      }
    }

    if (Object.keys(dirtyAnswers).length === 0) return;

    await fetch(`/api/ralph/tasks/${taskId}/stage-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stageName, answers: dirtyAnswers }),
    });
  };

  const handleRunStage = async (stageId: string) => {
    if (!task) return;

    const prevTask = task;

    // Flush any unsaved answers before starting the stage run
    try {
      await flushUnsavedAnswers(stageId);
    } catch (err) {
      console.error('[TASK DETAIL SCREEN] Failed to flush answers before continue:', err);
      // Continue anyway — better to run with stale answers than block entirely
    }

    // Auto-expand the stage section so the loading skeleton is visible
    setExpandedSections((prev) => ({ ...prev, [stageId]: true }));

    // Suppress polling while the run-stage POST is in-flight. The POST does
    // git fetch/sync before creating the job (~6s), so without this guard the
    // 5-second refetchInterval fires a GET that returns stale data (no
    // activeJobId yet) and overwrites the optimistic update.
    setStageRunPending(true);

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
        // Merge server task with existing cache to preserve enriched fields
        // (workspaceName, childTasks, etc.) that only the detail GET includes.
        // This avoids the race where a stale refetch overwrites the optimistic
        // update before a delayed invalidation fires.
        const data = await response.json();
        if (data.task) {
          const current = queryClient.getQueryData<RalphTaskDetail>(['ralph-task-detail', taskId]);
          setTaskCache(taskId, { ...(current ?? prevTask), ...data.task });
        } else {
          invalidateDetail(taskId);
        }
        invalidateTasks();
      })
      .catch((err) => {
        console.error(`[TASK DETAIL SCREEN] Failed to run stage '${stageId}', rolling back:`, err);
        setTaskCache(taskId, prevTask);
        invalidateDetail(taskId);
        invalidateTasks();
      })
      .finally(() => {
        // Re-enable polling now that the server has the real activeJobId
        setStageRunPending(false);
      });
  };

  const handleClearStageOutput = (stageId: string) => {
    if (!task?.stageOutputs?.[stageId]) return;

    const prevTask = task;
    const { [stageId]: _, ...remainingOutputs } = task.stageOutputs;
    const updatedStageOutputs = remainingOutputs;

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
        console.error(`[TASK DETAIL SCREEN] Failed to clear stage output:`, err);
        setTaskCache(taskId, prevTask);
      })
      .finally(() => {
        invalidateDetail(taskId);
      });

    // Also delete the artifact file (best-effort, non-blocking)
    fetch(`/api/ralph/tasks/${taskId}/artifact?stage=${stageId}`, {
      method: 'DELETE',
    }).catch(() => {
      // Non-fatal — the file will be overwritten on next run anyway
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
    const branchKeys = new Set(['baseBranch', 'featureBranch', 'prTargetBranch', 'deliveryMethod']);
    if (branchKeys.has(fieldName) && !canEditBranchConfig) return;

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

  const saveDeliveryMethod = async (method: 'merge-request' | 'direct-commit') => {
    if (!task || !canEditBranchConfig || task.deliveryMethod === method) return;
    setSavingField('deliveryMethod');
    try {
      const body =
        method === 'direct-commit'
          ? {
              deliveryMethod: 'direct-commit' as const,
              featureBranch: null,
              prTargetBranch: null,
            }
          : { deliveryMethod: 'merge-request' as const };
      const response = await fetch(`/api/ralph/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      const data = await response.json();
      setTaskCache(taskId, data.task);
      invalidateTasks();
    } catch (err) {
      console.error('[TASK DETAIL SCREEN] Failed to save delivery method:', err);
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

  // Seed answer inputs from existing answers so textboxes show current values
  useEffect(() => {
    if (!task?.stageOutputs) return;
    const seeded: Record<string, string> = {};
    for (const so of Object.values(task.stageOutputs)) {
      for (const q of so.pendingQuestions ?? []) {
        if (q.answer) seeded[q.id] = q.answer;
      }
    }
    setAnswerInputs((prev) => {
      const merged = { ...seeded };
      for (const [key, val] of Object.entries(prev)) {
        if (val) merged[key] = val;
      }
      return merged;
    });
  }, [task?.stageOutputs]);

  /** Rerun a stage: clear its output then run fresh */
  const handleRerunStage = (stageId: string) => {
    if (!task) return;

    const prevTask = task;
    const { [stageId]: _, ...remainingOutputs } = task.stageOutputs ?? {};

    // Optimistic: clear stage output
    setTaskCache(taskId, { ...task, stageOutputs: remainingOutputs });

    // Clear on the server, then run
    fetch(`/api/ralph/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stageOutputs: remainingOutputs }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        // Delete artifact file (best-effort)
        fetch(`/api/ralph/tasks/${taskId}/artifact?stage=${stageId}`, {
          method: 'DELETE',
        }).catch(() => {});
        // Now run the stage
        handleRunStage(stageId);
      })
      .catch((err) => {
        console.error(`[TASK DETAIL SCREEN] Failed to clear stage for rerun:`, err);
        setTaskCache(taskId, prevTask);
      });
  };

  /** Handle transition with unanswered questions warning */
  const handleTransitionWithWarning = (toStatus: string) => {
    if (!task) return;

    // Check if current stage has unanswered questions
    const currentStageOutput = task.stageOutputs?.[task.status];
    const unanswered =
      currentStageOutput?.pendingQuestions?.filter((q: StageQuestion) => !q.answer) ?? [];

    if (unanswered.length > 0) {
      setPendingTransition({
        toStatus,
        unansweredCount: unanswered.length,
        stageName: task.status,
      });
      return;
    }

    onTransition(task.id, toStatus as RalphTaskStatus);
  };

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
            <div className="space-y-5 order-2 xl:order-1 min-w-0">
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
                      minRows={3}
                      maxRows={50}
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

              {/* Stage Output Sections (with inline questions) */}
              {definition.stages.map((stageDef, stageIdx) => {
                const stageOutput = task.stageOutputs?.[stageDef.id];
                const isCurrentStage = task.status === stageDef.id;
                const hasOutput =
                  stageOutput && (stageOutput.iterations.length > 0 || stageOutput.activeJobId);

                // Skip stages with no prompt configured
                if (!stageDef.config.prompt) return null;

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
                    onRerunStage={() => handleRerunStage(stageDef.id)}
                    isRunning={false}
                    onClearStageOutput={() => handleClearStageOutput(stageDef.id)}
                    onCancelLoop={() => handleCancelLoop(stageDef.id)}
                    executionError={isCurrentStage ? task.executionError : null}
                    answerInputs={answerInputs}
                    onAnswerChange={handleAnswerChange}
                    onAnswerBlur={handleAnswerBlur}
                    onDismissQuestion={handleDismissQuestion}
                    savingAnswerId={savingAnswerId}
                    dismissingId={dismissingId}
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
            <div className="space-y-1 order-1 xl:order-2 xl:sticky xl:top-0">
              {/* Properties Section */}
              <div>
                <button
                  type="button"
                  className="flex items-center gap-1 w-full text-xs font-medium text-default-500 py-2 hover:text-default-700 transition-colors"
                  onClick={() => toggleSection('sidebarProperties')}
                >
                  {expandedSections.sidebarProperties ? (
                    <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronRight className="w-3 h-3" />
                  )}
                  Properties
                </button>
                {expandedSections.sidebarProperties && (
                  <div className="space-y-0.5 pb-2">
                    {/* Status */}
                    <div className="py-1.5 pl-4">
                      <Dropdown>
                        <DropdownTrigger>
                          <Chip
                            size="sm"
                            variant="solid"
                            color={statusColors[task.status] ?? 'default'}
                            classNames={{
                              ...statusChipClasses,
                              base: `${statusChipClasses.base} cursor-pointer`,
                            }}
                            style={{ transform: 'none', opacity: 1 }}
                            startContent={
                              <span className="w-3.5 h-3.5">
                                {React.createElement(
                                  taskStates.find((s) => s.key === task.status)?.icon || FileText,
                                  { className: 'w-3.5 h-3.5' }
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
                            if (key !== task.status) handleTransitionWithWarning(key as string);
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
                            const stageLabel =
                              taskStates.find((s) => s.key === status)?.label ?? status;
                            return (
                              <DropdownItem
                                key={status}
                                startContent={
                                  <span className={`w-2 h-2 rounded-full ${colorClass}`} />
                                }
                              >
                                {stageLabel}
                              </DropdownItem>
                            );
                          })}
                        </DropdownMenu>
                      </Dropdown>
                    </div>

                    {/* Workspace */}
                    <div className="flex items-center gap-1.5 py-1.5 pl-4 text-sm text-default-700">
                      <Folder className="w-3.5 h-3.5 text-default-400 flex-shrink-0" />
                      <span className="truncate">{task.workspaceName}</span>
                    </div>

                    {/* Branch */}
                    {(task.featureBranch ||
                      (task.deliveryMethod === 'direct-commit' && task.baseBranch) ||
                      canEditBranchConfig) && (
                      <div className="flex items-center gap-1.5 py-1.5 pl-4 pr-3">
                        <GitBranch className="w-3.5 h-3.5 flex-shrink-0 text-default-400" />
                        {canEditBranchConfig && task.deliveryMethod === 'merge-request' ? (
                          <div className={SIDEBAR_PROP_CONTROL_WRAP}>
                            <Popover
                              isOpen={isBranchPopoverOpen}
                              onOpenChange={(open) => {
                                setIsBranchPopoverOpen(open);
                                if (open) setBranchInput(task.featureBranch ?? '');
                              }}
                              placement="bottom-start"
                              offset={4}
                            >
                              <PopoverTrigger>
                                <button type="button" className={SIDEBAR_PROP_SELECT_TRIGGER}>
                                  <span className="min-w-0 flex-1 truncate font-mono text-default-700">
                                    {task.featureBranch || (
                                      <span className="text-default-400">Set branch...</span>
                                    )}
                                  </span>
                                  <ChevronDown className="h-3 w-3 flex-shrink-0 text-default-400 opacity-70" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="p-0 w-[240px] min-w-[240px] max-w-[240px]">
                                <div className="flex max-h-60 flex-col overflow-y-auto">
                                  <input
                                    type="text"
                                    className="sticky top-0 z-10 w-full border-b border-default-200 bg-content1 px-3 py-2 font-mono text-sm text-default-700 focus:outline-none"
                                    placeholder="Type or select branch..."
                                    value={branchInput}
                                    onChange={(e) => setBranchInput(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        const val = branchInput.trim();
                                        if (val && val !== task.featureBranch) {
                                          saveField('featureBranch', val);
                                        }
                                        setIsBranchPopoverOpen(false);
                                      }
                                      if (e.key === 'Escape') {
                                        setIsBranchPopoverOpen(false);
                                      }
                                    }}
                                    autoFocus
                                  />
                                  {workspaceBranches.length > 0 && (
                                    <div className="py-1">
                                      {workspaceBranches
                                        .filter(
                                          (b) =>
                                            !branchInput ||
                                            b.toLowerCase().includes(branchInput.toLowerCase())
                                        )
                                        .map((branch) => (
                                          <button
                                            key={branch}
                                            type="button"
                                            className={`w-full truncate px-3 py-1.5 text-left font-mono text-sm transition-colors hover:bg-default-100 ${
                                              branch === task.featureBranch
                                                ? 'text-primary'
                                                : 'text-default-700'
                                            }`}
                                            onClick={() => {
                                              if (branch !== task.featureBranch) {
                                                saveField('featureBranch', branch);
                                              }
                                              setIsBranchPopoverOpen(false);
                                            }}
                                          >
                                            {branch}
                                          </button>
                                        ))}
                                    </div>
                                  )}
                                </div>
                              </PopoverContent>
                            </Popover>
                          </div>
                        ) : canEditBranchConfig && task.deliveryMethod === 'direct-commit' ? (
                          <div className={SIDEBAR_PROP_CONTROL_WRAP}>
                            <Popover
                              isOpen={isBranchPopoverOpen}
                              onOpenChange={(open) => {
                                setIsBranchPopoverOpen(open);
                                if (open) setBranchInput(task.baseBranch ?? '');
                              }}
                              placement="bottom-start"
                              offset={4}
                            >
                              <PopoverTrigger>
                                <button
                                  type="button"
                                  className={SIDEBAR_PROP_SELECT_TRIGGER}
                                  aria-label="Target branch for direct commit"
                                >
                                  <span className="min-w-0 flex-1 truncate font-mono text-default-700">
                                    {task.baseBranch || (
                                      <span className="text-default-400">Set target branch...</span>
                                    )}
                                  </span>
                                  <ChevronDown className="h-3 w-3 flex-shrink-0 text-default-400 opacity-70" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="p-0 w-[240px] min-w-[240px] max-w-[240px]">
                                <div className="flex flex-col max-h-60 overflow-y-auto">
                                  <input
                                    type="text"
                                    className="text-sm font-mono text-default-700 bg-transparent px-3 py-2 border-b border-default-200 focus:outline-none w-full sticky top-0 bg-content1 z-10"
                                    placeholder="Type or select branch..."
                                    value={branchInput}
                                    onChange={(e) => setBranchInput(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        const val = branchInput.trim();
                                        if (val !== (task.baseBranch ?? '')) {
                                          saveField('baseBranch', val || null);
                                        }
                                        setIsBranchPopoverOpen(false);
                                      }
                                      if (e.key === 'Escape') {
                                        setIsBranchPopoverOpen(false);
                                      }
                                    }}
                                    autoFocus
                                  />
                                  {workspaceBranches.length > 0 && (
                                    <div className="py-1">
                                      {workspaceBranches
                                        .filter(
                                          (b) =>
                                            !branchInput ||
                                            b.toLowerCase().includes(branchInput.toLowerCase())
                                        )
                                        .map((branch) => (
                                          <button
                                            key={branch}
                                            type="button"
                                            className={`w-full text-left px-3 py-1.5 text-sm font-mono hover:bg-default-100 transition-colors truncate ${
                                              branch === task.baseBranch
                                                ? 'text-primary'
                                                : 'text-default-700'
                                            }`}
                                            onClick={() => {
                                              if (branch !== task.baseBranch) {
                                                saveField('baseBranch', branch);
                                              }
                                              setIsBranchPopoverOpen(false);
                                            }}
                                          >
                                            {branch}
                                          </button>
                                        ))}
                                    </div>
                                  )}
                                </div>
                              </PopoverContent>
                            </Popover>
                          </div>
                        ) : (
                          <div className={SIDEBAR_PROP_CONTROL_WRAP}>
                            <div className={`${SIDEBAR_PROP_VALUE_BOX} font-mono`}>
                              <span className="min-w-0 truncate">
                                {task.deliveryMethod === 'direct-commit'
                                  ? (task.baseBranch ?? '')
                                  : task.featureBranch}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Delivery */}
                    {task.deliveryMethod && (
                      <div className="flex items-center gap-1.5 py-1.5 pl-4 pr-3 text-sm text-default-700">
                        <Package className="w-3.5 h-3.5 flex-shrink-0 text-default-400" />
                        {canEditBranchConfig ? (
                          <div className={SIDEBAR_PROP_CONTROL_WRAP}>
                            <Dropdown>
                              <DropdownTrigger>
                                <button
                                  type="button"
                                  disabled={!!savingField}
                                  className={`${SIDEBAR_PROP_SELECT_TRIGGER} capitalize disabled:cursor-not-allowed disabled:opacity-50`}
                                >
                                  <span className="min-w-0 flex-1 truncate text-left">
                                    {task.deliveryMethod.replace(/-/g, ' ')}
                                  </span>
                                  <ChevronDown className="h-3 w-3 flex-shrink-0 text-default-400 opacity-70" />
                                </button>
                              </DropdownTrigger>
                              <DropdownMenu
                                aria-label="Delivery method"
                                selectionMode="single"
                                selectedKeys={new Set([task.deliveryMethod])}
                                onAction={(key) => {
                                  const m = key as 'merge-request' | 'direct-commit';
                                  if (m !== task.deliveryMethod) saveDeliveryMethod(m);
                                }}
                              >
                                <DropdownItem key="merge-request" textValue="Merge request">
                                  Merge request
                                </DropdownItem>
                                <DropdownItem
                                  key="direct-commit"
                                  textValue="Direct commit"
                                  description="Commit to target branch"
                                >
                                  Direct commit
                                </DropdownItem>
                              </DropdownMenu>
                            </Dropdown>
                          </div>
                        ) : (
                          <div className={SIDEBAR_PROP_CONTROL_WRAP}>
                            <div className={`${SIDEBAR_PROP_VALUE_BOX} capitalize`}>
                              <span className="min-w-0 truncate">
                                {task.deliveryMethod.replace(/-/g, ' ')}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Details Section (Project, Playbook) */}
              <div>
                <button
                  type="button"
                  className="flex items-center gap-1 w-full text-xs font-medium text-default-500 py-2 hover:text-default-700 transition-colors"
                  onClick={() => toggleSection('sidebarDetails')}
                >
                  {expandedSections.sidebarDetails ? (
                    <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronRight className="w-3 h-3" />
                  )}
                  Details
                </button>
                {expandedSections.sidebarDetails && (
                  <div className="space-y-1 pb-2">
                    {/* Project row */}
                    {allProjects.length > 0 && (
                      <div className="flex items-center justify-between py-1.5 pl-4">
                        <span className="text-xs text-default-400">Project</span>
                        <Dropdown>
                          <DropdownTrigger>
                            {task.projectId ? (
                              (() => {
                                const project = allProjects.find((p) => p.id === task.projectId);
                                return (
                                  <button className="flex items-center gap-1.5 text-sm text-default-700 hover:text-default-900 transition-colors cursor-pointer">
                                    {project && (
                                      <span
                                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: project.color }}
                                      />
                                    )}
                                    <span>{project?.name ?? 'Unknown'}</span>
                                  </button>
                                );
                              })()
                            ) : (
                              <button className="text-sm text-default-400 hover:text-default-600 transition-colors cursor-pointer">
                                Add project
                              </button>
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
                              ...(task.projectId
                                ? [{ id: 'none', name: 'No Project', color: '' }]
                                : []),
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

                    {/* Playbook row */}
                    {allPlaybooks.length > 0 && (
                      <div className="flex items-center justify-between py-1.5 pl-4">
                        <span className="text-xs text-default-400">Playbook</span>
                        <Dropdown isDisabled={task.status !== 'draft'}>
                          <DropdownTrigger>
                            {task.playbookId ? (
                              (() => {
                                const playbook = allPlaybooks.find((p) => p.id === task.playbookId);
                                return (
                                  <button
                                    className={`flex items-center gap-1.5 text-sm transition-colors ${
                                      task.status === 'draft'
                                        ? 'text-default-700 hover:text-default-900 cursor-pointer'
                                        : 'text-default-500 cursor-default'
                                    }`}
                                  >
                                    <BookOpen className="w-3.5 h-3.5 text-default-400 flex-shrink-0" />
                                    <span>{playbook?.name ?? 'Unknown'}</span>
                                  </button>
                                );
                              })()
                            ) : (
                              <button
                                className={`text-sm transition-colors ${
                                  task.status === 'draft'
                                    ? 'text-default-400 hover:text-default-600 cursor-pointer'
                                    : 'text-default-400 cursor-default'
                                }`}
                              >
                                Add playbook
                              </button>
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
                              <DropdownItem
                                key={p.id}
                                description={p.isDefault ? 'Default' : undefined}
                              >
                                {p.name}
                              </DropdownItem>
                            ))}
                          </DropdownMenu>
                        </Dropdown>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Dependencies Section */}
              <div>
                <button
                  type="button"
                  className="flex items-center gap-1 w-full text-xs font-medium text-default-500 py-2 hover:text-default-700 transition-colors"
                  onClick={() => toggleSection('sidebarDeps')}
                >
                  {expandedSections.sidebarDeps ? (
                    <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronRight className="w-3 h-3" />
                  )}
                  Dependencies
                </button>
                {expandedSections.sidebarDeps && (
                  <div className="pl-4 pb-2">
                    <DependencySection
                      taskId={taskId}
                      workspaceId={task.workspaceId}
                      childIds={task.childIds}
                      canEdit={canEdit}
                      onNavigateToTask={onNavigateToTask}
                    />
                  </div>
                )}
              </div>

              {/* File Paths Section */}
              <div>
                <button
                  type="button"
                  className="flex items-center gap-1 w-full text-xs font-medium text-default-500 py-2 hover:text-default-700 transition-colors"
                  onClick={() => toggleSection('sidebarFiles')}
                >
                  {expandedSections.sidebarFiles ? (
                    <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronRight className="w-3 h-3" />
                  )}
                  File Paths
                  {savingField === 'filePaths' && <Loader2 className="w-3 h-3 animate-spin ml-1" />}
                  {task.filePaths.length > 0 && (
                    <span className="text-default-400 ml-auto">{task.filePaths.length}</span>
                  )}
                </button>
                {expandedSections.sidebarFiles && (
                  <div className="pl-4 pb-2">
                    <div className="flex flex-col gap-1 mb-2 max-h-48 overflow-y-auto">
                      {task.filePaths.map((path) => (
                        <div key={path} className="flex items-center gap-1.5 group min-w-0">
                          <FileCode className="w-3 h-3 text-default-400 flex-shrink-0" />
                          <span
                            className="text-xs text-default-600 truncate min-w-0 flex-1"
                            title={path}
                          >
                            {path}
                          </span>
                          {canEdit && (
                            <button
                              type="button"
                              className="opacity-0 group-hover:opacity-100 text-default-400 hover:text-danger flex-shrink-0 transition-opacity"
                              onClick={() => removeFilePath(path)}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      ))}
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
                            placeholder="Search files..."
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
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Unanswered questions warning modal */}
      <Modal
        isOpen={!!pendingTransition}
        onOpenChange={(open) => {
          if (!open) setPendingTransition(null);
        }}
        size="sm"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Unanswered Questions</ModalHeader>
              <ModalBody>
                <p className="text-sm text-default-600">
                  You have{' '}
                  <strong>
                    {pendingTransition?.unansweredCount} unanswered question
                    {pendingTransition?.unansweredCount !== 1 ? 's' : ''}
                  </strong>{' '}
                  from the current stage. Proceeding will carry your answered questions forward but
                  unanswered ones will be discarded.
                </p>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  Go Back
                </Button>
                <Button
                  color="warning"
                  onPress={() => {
                    if (pendingTransition && task) {
                      onTransition(task.id, pendingTransition.toStatus as RalphTaskStatus);
                    }
                    onClose();
                  }}
                >
                  Proceed Anyway
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
