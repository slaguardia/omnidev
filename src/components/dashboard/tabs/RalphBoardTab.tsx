'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@heroui/button';
import { Chip } from '@heroui/chip';
import { Textarea } from '@heroui/input';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/modal';
import dynamic from 'next/dynamic';
import {
  Plus,
  Zap,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  AlertTriangle,
  History,
} from 'lucide-react';
import { RalphSubTabs } from './ralph/RalphSubTabs';
import { usePersistedState } from '@/hooks';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useQueryClient } from '@tanstack/react-query';
import { useRalphTasks, useInvalidateRalphTasks } from '@/hooks/queries/useRalphTasks';
import DeleteTaskConfirmationModal from '@/components/dashboard/DeleteTaskConfirmationModal';
import { BoardFilterBar, TaskCard, getTaskStates, getStatusColors } from './ralph';
import type {
  RalphTaskStatus,
  RalphTaskData,
  RalphProject,
  WorkspaceFilterOption,
  ManualOverrideInfo,
} from './ralph';
import { useWorkflowDefinition } from '@/hooks/queries/useWorkflowDefinition';
import { findStageDefinition } from '@/lib/workflow/definition';
import { useRalphProjects } from '@/hooks/queries/useRalphProjects';
import { useRalphPlaybooks } from '@/hooks/queries/useRalphPlaybooks';

// Dynamic imports for modals — only loaded when user opens them
const CreateTaskModal = dynamic(() => import('./ralph/CreateTaskModal'));
const ExecuteModal = dynamic(() => import('./ralph/ExecuteModal'));
const CompleteModal = dynamic(() => import('./ralph/CompleteModal'));
const StoriesModal = dynamic(() => import('./ralph/StoriesModal'));
const FeatureCompleteModal = dynamic(() => import('./ralph/FeatureCompleteModal'));

// RalphBoardTab is fully self-contained — no props needed

interface EmptyStateProps {
  onCreateTask: () => void;
}

function EmptyState({ onCreateTask }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-16 h-16 rounded-full bg-content2 flex items-center justify-center mb-4">
        <Zap className="w-8 h-8 text-primary" />
      </div>
      <h3 className="text-xl font-semibold mb-2">Welcome to Ralph Board</h3>
      <p className="text-default-500 max-w-md mb-6">
        Ralph Board helps you manage AI-assisted development tasks through a structured workflow.
        Create your first task to get started with the Draft → Triage → Planning → Ready → Executing
        → Complete pipeline.
      </p>
      <Button color="primary" startContent={<Plus className="w-4 h-4" />} onPress={onCreateTask}>
        Create First Task
      </Button>
    </div>
  );
}

interface ListViewProps {
  tasks: RalphTaskData[];
  processingTaskIds: Set<string>;
  onExpandTask: (taskId: string) => void;
  onTransitionTask: (taskId: string, toStatus: RalphTaskStatus) => void;
  onStatusOverride: (taskId: string, toStatus: RalphTaskStatus) => void;
  onResearchAction: (
    taskId: string,
    action: 'dismiss' | 'accept_all' | 'mark_ready' | 'add_feedback',
    data?: { gapId?: string; feedback?: string }
  ) => void;
  onAnswerQuestion: (taskId: string, questionId: string, answer: string) => Promise<void>;
  onCancelExecution: (taskId: string) => void;
  onArchive: (taskId: string) => void;
  onUnarchive: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onClone: (taskId: string) => void;
  onViewStories: (taskId: string, taskTitle: string) => void;
  onExecuteNext: (taskId: string) => void;
  onExecuteAll: (taskId: string) => void;
  onCompleteFeature: (taskId: string) => void;
  onCreateSubtask: (taskId: string) => void;
  onCreateTask: () => void;
  projects: RalphProject[];
  onChangeProject: (taskId: string, projectId: string | null) => void;
  focusedTaskId?: string | null;
  onVisibleTaskIdsChange?: (ids: string[]) => void;
}

function ListView({
  tasks,
  processingTaskIds,
  onExpandTask,
  onTransitionTask,
  onStatusOverride,
  onResearchAction,
  onAnswerQuestion,
  onCancelExecution,
  onArchive,
  onUnarchive,
  onDelete,
  onClone,
  onViewStories,
  onExecuteNext,
  onExecuteAll,
  onCompleteFeature,
  onCreateSubtask,
  onCreateTask,
  projects,
  onChangeProject,
  focusedTaskId,
  onVisibleTaskIdsChange,
}: ListViewProps) {
  const { definition } = useWorkflowDefinition();
  const taskStates = getTaskStates(definition);
  const statusColorsMap = getStatusColors(definition);

  // Persisted collapsed group state
  const [collapsedGroups, setCollapsedGroups] = usePersistedState<string[]>(
    'ralphBoard.listView.collapsedGroups',
    []
  );

  const toggleGroup = useCallback(
    (statusKey: string) => {
      setCollapsedGroups((prev) => {
        if (prev.includes(statusKey)) {
          return prev.filter((k) => k !== statusKey);
        }
        return [...prev, statusKey];
      });
    },
    [setCollapsedGroups]
  );

  // Track which tasks are expanded to show subtasks
  const [expandedFeatures, setExpandedFeatures] = useState<Set<string>>(new Set());

  const toggleFeatureExpanded = useCallback((taskId: string) => {
    setExpandedFeatures((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }, []);

  // Get children for a given parent task
  const getChildTasks = useCallback(
    (parentId: string): RalphTaskData[] => {
      return tasks
        .filter((t) => t.parentId === parentId)
        .sort((a, b) => (a.subtaskOrder ?? 0) - (b.subtaskOrder ?? 0));
    },
    [tasks]
  );

  const rootTasks = useMemo(() => {
    return tasks.filter((t) => !t.parentId);
  }, [tasks]);

  // Group root tasks by status in order of taskStates
  const groupedTasks = useMemo(() => {
    const groups: { key: string; label: string; tasks: RalphTaskData[] }[] = [];
    for (const state of taskStates) {
      const groupTasks = rootTasks.filter((t) => t.status === state.key);
      if (groupTasks.length > 0) {
        groups.push({ key: state.key, label: state.label, tasks: groupTasks });
      }
    }
    return groups;
  }, [rootTasks, taskStates]);

  // Compute flat ordered list of visible task IDs (respecting collapsed groups + expanded features)
  const visibleTaskIds = useMemo(() => {
    const ids: string[] = [];
    for (const group of groupedTasks) {
      if (collapsedGroups.includes(group.key)) continue;
      for (const task of group.tasks) {
        ids.push(task.id);
        if (expandedFeatures.has(task.id)) {
          const children = tasks
            .filter((t) => t.parentId === task.id)
            .sort((a, b) => (a.subtaskOrder ?? 0) - (b.subtaskOrder ?? 0));
          for (const child of children) {
            ids.push(child.id);
          }
        }
      }
    }
    return ids;
  }, [groupedTasks, collapsedGroups, expandedFeatures, tasks]);

  // Report visible task IDs to parent (compare by value to avoid infinite loops)
  const prevVisibleIdsRef = useRef<string[]>([]);
  useEffect(() => {
    const prev = prevVisibleIdsRef.current;
    if (prev.length === visibleTaskIds.length && prev.every((id, i) => id === visibleTaskIds[i])) {
      return;
    }
    prevVisibleIdsRef.current = visibleTaskIds;
    onVisibleTaskIdsChange?.(visibleTaskIds);
  }, [visibleTaskIds, onVisibleTaskIdsChange]);

  if (tasks.length === 0) {
    return <EmptyState onCreateTask={onCreateTask} />;
  }

  return (
    <div className="border border-divider rounded-lg overflow-hidden">
      {groupedTasks.map((group) => {
        const isCollapsed = collapsedGroups.includes(group.key);
        const statusColor = statusColorsMap[group.key] ?? 'default';
        const dotColorClass =
          statusColor === 'default'
            ? 'bg-default-400'
            : statusColor === 'warning'
              ? 'bg-warning'
              : statusColor === 'secondary'
                ? 'bg-secondary'
                : statusColor === 'success'
                  ? 'bg-success'
                  : statusColor === 'danger'
                    ? 'bg-danger'
                    : 'bg-primary';

        return (
          <div key={group.key}>
            {/* Group header */}
            <button
              type="button"
              onClick={() => toggleGroup(group.key)}
              className="w-full flex items-center gap-2.5 px-3 py-2 bg-content2/50 border-b border-divider hover:bg-content2 transition-colors select-none"
            >
              {isCollapsed ? (
                <ChevronRight className="w-3.5 h-3.5 text-default-400" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-default-400" />
              )}
              <span className={`w-2.5 h-2.5 rounded-full ${dotColorClass} flex-shrink-0`} />
              <span className="text-sm font-medium">{group.label}</span>
              <span className="text-xs text-default-400 bg-content3 px-2 py-0.5 rounded-full">
                {group.tasks.length}
              </span>
            </button>

            {/* Task rows */}
            {!isCollapsed &&
              group.tasks.map((task) => {
                const childTasks = getChildTasks(task.id);
                const isFeatureExpanded = expandedFeatures.has(task.id);

                return (
                  <React.Fragment key={task.id}>
                    <TaskCard
                      task={task}
                      variant="list"
                      isProcessing={processingTaskIds.has(task.id)}
                      isFocused={focusedTaskId === task.id}
                      onExpand={onExpandTask}
                      onTransition={onTransitionTask}
                      onStatusOverride={onStatusOverride}
                      onResearchAction={onResearchAction}
                      onAnswerQuestion={onAnswerQuestion}
                      onCancelExecution={onCancelExecution}
                      onArchive={onArchive}
                      onUnarchive={onUnarchive}
                      onDelete={onDelete}
                      onClone={onClone}
                      onViewStories={onViewStories}
                      onExecuteNext={onExecuteNext}
                      onExecuteAll={onExecuteAll}
                      onCompleteFeature={onCompleteFeature}
                      onCreateSubtask={onCreateSubtask}
                      projects={projects}
                      onChangeProject={onChangeProject}
                      childTasks={childTasks}
                      isExpanded={isFeatureExpanded}
                      {...(childTasks.length > 0 && {
                        onToggleExpand: () => toggleFeatureExpanded(task.id),
                      })}
                    />
                    {isFeatureExpanded &&
                      childTasks.map((child) => (
                        <TaskCard
                          key={child.id}
                          task={child}
                          variant="list"
                          isProcessing={processingTaskIds.has(child.id)}
                          isFocused={focusedTaskId === child.id}
                          onExpand={onExpandTask}
                          onTransition={onTransitionTask}
                          onStatusOverride={onStatusOverride}
                          onResearchAction={onResearchAction}
                          onAnswerQuestion={onAnswerQuestion}
                          onCancelExecution={onCancelExecution}
                          onArchive={onArchive}
                          onUnarchive={onUnarchive}
                          onDelete={onDelete}
                          onClone={onClone}
                          onViewStories={onViewStories}
                          projects={projects}
                          onChangeProject={onChangeProject}
                          isNested={true}
                          depth={1}
                        />
                      ))}
                  </React.Fragment>
                );
              })}
          </div>
        );
      })}
    </div>
  );
}

export default function RalphBoardTab({ isPaletteOpen }: { isPaletteOpen?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { definition } = useWorkflowDefinition();
  const taskStates = getTaskStates(definition);
  const statusColors = getStatusColors(definition);

  // Track in-flight task operations for visual feedback
  const [processingTaskIds, setProcessingTaskIds] = useState<Set<string>>(new Set());

  const addProcessingTask = useCallback((taskId: string) => {
    setProcessingTaskIds((prev) => new Set(prev).add(taskId));
  }, []);

  const removeProcessingTask = useCallback((taskId: string) => {
    setProcessingTaskIds((prev) => {
      const next = new Set(prev);
      next.delete(taskId);
      return next;
    });
  }, []);

  // Modal state for task creation
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createParentTask, setCreateParentTask] = useState<{
    id: string;
    title: string;
    workspaceId: string;
  } | null>(null);

  // Task navigation uses URL routing — no screen stack needed

  // Action modal state — each modal manages its own internal state
  const [executeModalTaskId, setExecuteModalTaskId] = useState<string | null>(null);
  const [completeModalTaskId, setCompleteModalTaskId] = useState<string | null>(null);
  const [storiesModalTaskId, setStoriesModalTaskId] = useState<string | null>(null);
  const [storiesModalTitle, setStoriesModalTitle] = useState('');
  const [featureCompleteModalTaskId, setFeatureCompleteModalTaskId] = useState<string | null>(null);

  // Override modal state (for status dropdown override flow)
  const [isShortcutsHelpOpen, setIsShortcutsHelpOpen] = useState(false);
  const [isOverrideModalOpen, setIsOverrideModalOpen] = useState(false);
  const [overrideTaskId, setOverrideTaskId] = useState<string | null>(null);
  const [overrideTargetStatus, setOverrideTargetStatus] = useState<RalphTaskStatus | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideInfo, setOverrideInfo] = useState<ManualOverrideInfo | null>(null);
  const [isSubmittingOverride, setIsSubmittingOverride] = useState(false);

  // Get workspace filter from URL query param
  const workspaceFilter = searchParams.get('workspace');

  // Archive view toggle state
  const [showArchived, setShowArchived] = usePersistedState<boolean>(
    'ralphBoard.showArchived',
    false
  );

  // Project filter state
  const [projectFilter, setProjectFilter] = usePersistedState<string | null>(
    'ralphBoard.projectFilter',
    null
  );

  // Status filter state
  const [statusFilter, setStatusFilter] = usePersistedState<string | null>(
    'ralphBoard.statusFilter',
    null
  );

  // Playbook filter state
  const [playbookFilter, setPlaybookFilter] = usePersistedState<string | null>(
    'ralphBoard.playbookFilter',
    null
  );

  // Text search filter (ephemeral, no persistence)
  const [searchFilter, setSearchFilter] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { data: projects = [] } = useRalphProjects();
  const { data: playbooks = [] } = useRalphPlaybooks();

  // TanStack Query for task fetching
  const queryClient = useQueryClient();
  const { data: tasks = [], isLoading } = useRalphTasks({ archived: showArchived });
  const invalidateTasks = useInvalidateRalphTasks();
  const fetchTasks = useCallback(() => invalidateTasks(), [invalidateTasks]);

  // Placeholder row — inserted into the cache when the create modal opens,
  // removed on cancel. On successful create, invalidateQueries replaces it.
  const addPlaceholderTask = useCallback(() => {
    const listKey = ['ralph-tasks', { archived: false }];
    const current = (queryClient.getQueryData(listKey) as RalphTaskData[] | undefined) || [];
    const maxNumber = current.reduce(
      (max, t) => (t.taskNumber != null && t.taskNumber > max ? t.taskNumber : max),
      0
    );
    const placeholder: RalphTaskData = {
      id: 'placeholder-new-task',
      title: '',
      workspaceId: '',
      workspaceName: '',
      status: 'draft',
      taskType: 'simple',
      isSubtask: false,
      description: null,
      filePaths: [],
      featureBranch: null,
      updatedAt: new Date().toISOString(),
      pendingQuestionsCount: 0,
      pendingQuestions: [],
      executionJobId: null,
      executionJobInfo: null,
      executionError: null,
      prUrl: null,
      completedAt: null,
      isArchived: false,
      totalIterations: 0,
      hasGeneratedStories: false,
      generatedStoriesCount: 0,
      childCount: 0,
      parentId: null,
      storyOrder: null,
      subtaskOrder: null,
      childIds: [],
      blockedBy: [],
      isBlocked: false,
      taskNumber: maxNumber + 1,
      projectId: null,
      playbookId: null,
      isPlaceholder: true,
    };
    queryClient.setQueryData(listKey, [placeholder, ...current]);
  }, [queryClient]);

  const removePlaceholderTask = useCallback(() => {
    const listKey = ['ralph-tasks', { archived: false }];
    queryClient.setQueryData(listKey, (old: RalphTaskData[] | undefined) =>
      (old || []).filter((t) => t.id !== 'placeholder-new-task')
    );
  }, [queryClient]);

  const openCreateModal = () => {
    setCreateParentTask(null);
    addPlaceholderTask();
    setIsCreateModalOpen(true);
  };

  /**
   * Extract unique workspaces from tasks with task counts
   */
  const workspaceOptions = useMemo((): WorkspaceFilterOption[] => {
    const workspaceMap = new Map<string, { name: string; count: number }>();
    tasks.forEach((task) => {
      const existing = workspaceMap.get(task.workspaceId);
      if (existing) {
        existing.count++;
      } else {
        workspaceMap.set(task.workspaceId, { name: task.workspaceName, count: 1 });
      }
    });

    const options: WorkspaceFilterOption[] = [];
    workspaceMap.forEach((value, key) => {
      options.push({ id: key, name: value.name, taskCount: value.count });
    });

    // Sort by name
    options.sort((a, b) => a.name.localeCompare(b.name));
    return options;
  }, [tasks]);

  /**
   * Filter tasks by selected workspace and project
   */
  const filteredTasks = useMemo(() => {
    let filtered = tasks;
    if (workspaceFilter) {
      filtered = filtered.filter(
        (task) => task.isPlaceholder || task.workspaceId === workspaceFilter
      );
    }
    if (projectFilter) {
      filtered = filtered.filter((task) => task.isPlaceholder || task.projectId === projectFilter);
    }
    if (statusFilter) {
      filtered = filtered.filter((task) => task.isPlaceholder || task.status === statusFilter);
    }
    if (playbookFilter) {
      filtered = filtered.filter(
        (task) => task.isPlaceholder || task.playbookId === playbookFilter
      );
    }
    if (searchFilter) {
      const lower = searchFilter.toLowerCase();
      filtered = filtered.filter(
        (task) =>
          task.isPlaceholder ||
          task.title.toLowerCase().includes(lower) ||
          (task.description && task.description.toLowerCase().includes(lower))
      );
    }
    return filtered;
  }, [tasks, workspaceFilter, projectFilter, statusFilter, playbookFilter, searchFilter]);

  /**
   * Handle workspace filter change
   */
  const handleWorkspaceFilterChange = useCallback(
    (keys: React.Key | Set<React.Key>) => {
      const keyArray = Array.from(keys as Set<React.Key>);
      const selectedKey = keyArray[0] as string | undefined;

      // Build new URL with updated query param
      const params = new URLSearchParams(searchParams.toString());
      if (selectedKey === '__all__' || !selectedKey) {
        params.delete('workspace');
      } else {
        params.set('workspace', selectedKey);
      }

      // Update URL without full navigation
      const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
      router.push(newUrl, { scroll: false });
    },
    [router, searchParams]
  );

  /**
   * Handle expanding a task (navigate to task detail route)
   */
  const handleExpandTask = useCallback(
    (taskId: string) => {
      console.log('[RALPH BOARD TAB] Navigate to task:', taskId);
      router.push(`/dashboard/ralph-board/task/${taskId}`);
    },
    [router]
  );

  // Listen for custom events from the command palette
  useEffect(() => {
    const handlePaletteCreate = () => openCreateModal();
    const handlePaletteToggleArchived = () => setShowArchived((v: boolean) => !v);
    const handlePaletteNavigate = (e: Event) => {
      const taskId = (e as CustomEvent).detail?.taskId;
      if (taskId) handleExpandTask(taskId);
    };

    window.addEventListener('ralph:openCreateModal', handlePaletteCreate);
    window.addEventListener('ralph:toggleArchived', handlePaletteToggleArchived);
    window.addEventListener('ralph:navigateToTask', handlePaletteNavigate);
    return () => {
      window.removeEventListener('ralph:openCreateModal', handlePaletteCreate);
      window.removeEventListener('ralph:toggleArchived', handlePaletteToggleArchived);
      window.removeEventListener('ralph:navigateToTask', handlePaletteNavigate);
    };
  }, [handleExpandTask, setShowArchived]);

  // Simple open helpers for action modals
  const openExecuteModal = useCallback((taskId: string) => {
    setExecuteModalTaskId(taskId);
  }, []);

  const openCompleteModal = useCallback((taskId: string) => {
    setCompleteModalTaskId(taskId);
  }, []);

  const openFeatureCompleteModal = useCallback((taskId: string) => {
    setFeatureCompleteModalTaskId(taskId);
  }, []);

  /**
   * Handle creating a subtask — opens the create modal with parent pre-set
   */
  const handleCreateSubtask = useCallback(
    (parentId: string) => {
      const parent = tasks.find((t) => t.id === parentId);
      if (parent) {
        setCreateParentTask({
          id: parent.id,
          title: parent.title,
          workspaceId: parent.workspaceId,
        });
        addPlaceholderTask();
        setIsCreateModalOpen(true);
      }
    },
    [tasks, addPlaceholderTask]
  );

  const openStoriesModal = useCallback((taskId: string, taskTitle: string) => {
    setStoriesModalTaskId(taskId);
    setStoriesModalTitle(taskTitle);
  }, []);

  /**
   * Handle transitioning a task to a new status
   * Uses workflow definition's onEnter hooks for modal triggers:
   * - 'branch-creation': opens branch creation/execution confirmation modal
   * - 'confirm-pr': opens PR creation modal
   */
  const handleTransitionTask = useCallback(
    (taskId: string, toStatus: RalphTaskStatus) => {
      console.log('[RALPH BOARD TAB] Transition task:', taskId, 'to', toStatus);

      // Find the current task to check its status
      const currentTask = tasks.find((t) => t.id === taskId);

      // Look up the target stage's onEnter hook from the workflow definition
      const targetStage = findStageDefinition(definition, toStatus);

      // Prevent blocked tasks from transitioning to stages with branch-creation hook
      if (targetStage?.onEnter === 'branch-creation' && currentTask?.isBlocked) {
        console.error('[RALPH BOARD TAB] Cannot execute blocked task:', taskId);
        return;
      }

      // Modal branches — don't track processing (modal handles its own state)
      if (targetStage?.onEnter === 'branch-creation') {
        openExecuteModal(taskId);
        return;
      } else if (targetStage?.onEnter === 'confirm-pr') {
        openCompleteModal(taskId);
        return;
      } else if (
        toStatus === 'complete' &&
        currentTask?.childIds &&
        currentTask.childIds.length > 0
      ) {
        // Feature-complete check: task structure concern, not stage-specific
        openFeatureCompleteModal(taskId);
        return;
      }

      const listKey = ['ralph-tasks', { archived: showArchived }];
      const detailKey = ['ralph-task-detail', taskId];

      // Snapshot previous caches for rollback
      const prevList = queryClient.getQueryData(listKey);
      const prevDetail = queryClient.getQueryData(detailKey);

      // Optimistic: update status in the task list cache
      queryClient.setQueryData<RalphTaskData[]>(listKey, (old) =>
        old ? old.map((t) => (t.id === taskId ? { ...t, status: toStatus } : t)) : []
      );

      // Optimistic: update status in the task detail cache
      queryClient.setQueryData(detailKey, (old: Record<string, unknown> | undefined) =>
        old ? { ...old, status: toStatus } : old
      );

      // Always use the plain transition endpoint — status changes should never auto-run stages
      const url = `/api/ralph/tasks/${taskId}/transition`;
      const body = JSON.stringify({ toStatus });

      // Fire the API call in the background — optimistic updates already applied above
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
        .then(async (response) => {
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(data.error || `HTTP ${response.status}`);
          }
          // Use server response to update detail cache precisely (picks up updatedAt etc.)
          if (data?.task) {
            queryClient.setQueryData(detailKey, (old: Record<string, unknown> | undefined) =>
              old ? { ...old, ...data.task } : old
            );
          }
        })
        .catch((err) => {
          console.error('[RALPH BOARD TAB] Failed to transition task, rolling back:', err);
          // Rollback both caches
          if (prevList) queryClient.setQueryData(listKey, prevList);
          if (prevDetail) queryClient.setQueryData(detailKey, prevDetail);
        });
    },
    [
      tasks,
      definition,
      showArchived,
      queryClient,
      openExecuteModal,
      openCompleteModal,
      openFeatureCompleteModal,
    ]
  );

  /**
   * Handle manual status override (bypass normal workflow)
   * This allows the user to move a task to any status with a required reason.
   * The override is recorded in the audit trail.
   */
  const handleManualOverride = useCallback(
    async (taskId: string, toStatus: RalphTaskStatus, reason: string) => {
      console.log(
        '[RALPH BOARD TAB] Manual override task:',
        taskId,
        'to',
        toStatus,
        'reason:',
        reason
      );

      addProcessingTask(taskId);
      try {
        const response = await fetch(`/api/ralph/tasks/${taskId}/override-status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toStatus, reason }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        // Refresh both list and detail caches
        await fetchTasks();
        queryClient.invalidateQueries({ queryKey: ['ralph-task-detail', taskId] });
      } catch (err) {
        console.error('[RALPH BOARD TAB] Failed to override task status:', err);
        throw err; // Re-throw so the modal can handle the error
      } finally {
        removeProcessingTask(taskId);
      }
    },
    [fetchTasks, queryClient, addProcessingTask, removeProcessingTask]
  );

  /**
   * Open the override modal for a status dropdown selection.
   * Fetches preview info from the override-status GET endpoint, then shows the modal.
   */
  const handleRequestOverride = useCallback(async (taskId: string, toStatus: RalphTaskStatus) => {
    // Fetch override preview info
    try {
      const response = await fetch(
        `/api/ralph/tasks/${taskId}/override-status?toStatus=${toStatus}`
      );
      if (response.ok) {
        const data = await response.json();
        setOverrideInfo({
          isNonStandard: data.isNonStandard ?? false,
          skippedSteps: data.skippedSteps,
          warning: data.warning,
        });
      } else {
        setOverrideInfo(null);
      }
    } catch (err) {
      console.error('[RALPH BOARD TAB] Failed to fetch override info:', err);
      setOverrideInfo(null);
    }

    setOverrideTaskId(taskId);
    setOverrideTargetStatus(toStatus);
    setOverrideReason('');
    setIsOverrideModalOpen(true);
  }, []);

  const closeOverrideModal = useCallback(() => {
    setIsOverrideModalOpen(false);
    setOverrideTaskId(null);
    setOverrideTargetStatus(null);
    setOverrideReason('');
    setOverrideInfo(null);
  }, []);

  const handleSubmitOverride = useCallback(async () => {
    if (!overrideTaskId || !overrideTargetStatus || !overrideReason.trim()) return;

    setIsSubmittingOverride(true);
    try {
      await handleManualOverride(overrideTaskId, overrideTargetStatus, overrideReason.trim());
      closeOverrideModal();
    } catch (err) {
      console.error('[RALPH BOARD TAB] Failed to submit override:', err);
    } finally {
      setIsSubmittingOverride(false);
    }
  }, [
    overrideTaskId,
    overrideTargetStatus,
    overrideReason,
    handleManualOverride,
    closeOverrideModal,
  ]);

  /**
   * Handle research-related actions for a task
   * - dismiss: Dismiss a specific gap
   * - accept_all: Accept all feedback and trigger planning iteration
   * - mark_ready: Skip research and mark task as ready
   * - add_feedback: Add user's custom feedback
   */
  const handleResearchAction = useCallback(
    async (
      taskId: string,
      action: 'dismiss' | 'accept_all' | 'mark_ready' | 'add_feedback',
      data?: { gapId?: string; feedback?: string }
    ) => {
      const currentTask = tasks.find((t) => t.id === taskId);
      const stageName = currentTask?.status ?? 'research';
      console.log('[RALPH BOARD TAB] Stage action:', taskId, action, stageName, data);

      addProcessingTask(taskId);
      try {
        // Map legacy action names to generic stage-action actions
        let stageAction: string;
        let stageData: Record<string, string | undefined> | undefined;

        if (action === 'dismiss' && data?.gapId) {
          stageAction = 'dismiss-item';
          stageData = { itemId: data.gapId };
        } else if (action === 'accept_all') {
          stageAction = 'accept-feedback';
          stageData = undefined;
        } else if (action === 'mark_ready') {
          stageAction = 'skip-stage';
          stageData = { targetStatus: 'ready' };
        } else if (action === 'add_feedback' && data?.feedback) {
          stageAction = 'add-feedback';
          stageData = { feedback: data.feedback };
        } else {
          return;
        }

        const response = await fetch(`/api/ralph/tasks/${taskId}/stage-action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stageName, action: stageAction, data: stageData }),
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        // Refresh tasks after successful action
        await fetchTasks();
      } catch (err) {
        console.error('[RALPH BOARD TAB] Stage action failed:', err);
      } finally {
        removeProcessingTask(taskId);
      }
    },
    [fetchTasks, tasks, addProcessingTask, removeProcessingTask]
  );

  /**
   * Handle answering a question inline on a task card.
   * Uses the generic stage-answer endpoint with the task's current status as stageName.
   */
  const handleAnswerQuestion = useCallback(
    async (taskId: string, questionId: string, answer: string) => {
      console.log('[RALPH BOARD TAB] Answer question:', taskId, questionId);

      const currentTask = tasks.find((t) => t.id === taskId);
      const stageName = currentTask?.status ?? 'draft';

      addProcessingTask(taskId);
      try {
        const response = await fetch(`/api/ralph/tasks/${taskId}/stage-answer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stageName, answers: { [questionId]: answer } }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        // Refresh tasks after successful answer
        await fetchTasks();
      } catch (err) {
        console.error('[RALPH BOARD TAB] Failed to answer question:', err);
        throw err; // Re-throw so the UI can handle it
      } finally {
        removeProcessingTask(taskId);
      }
    },
    [fetchTasks, tasks, addProcessingTask, removeProcessingTask]
  );

  /**
   * Handle canceling execution of a task
   * Clears execution state and transitions the task back to draft
   */
  const handleCancelExecution = useCallback(
    async (taskId: string) => {
      console.log('[RALPH BOARD TAB] Cancel execution:', taskId);

      addProcessingTask(taskId);
      try {
        // Clear execution state
        const patchResponse = await fetch(`/api/ralph/tasks/${taskId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ executionJobId: null, executionError: 'Canceled by user' }),
        });
        if (!patchResponse.ok) {
          const errorData = await patchResponse.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${patchResponse.status}`);
        }

        // Transition back to draft
        const transitionResponse = await fetch(`/api/ralph/tasks/${taskId}/transition`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toStatus: 'draft', reason: 'Canceled' }),
        });
        if (!transitionResponse.ok) {
          const errorData = await transitionResponse.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${transitionResponse.status}`);
        }

        // Refresh tasks after successful cancellation
        await fetchTasks();
      } catch (err) {
        console.error('[RALPH BOARD TAB] Failed to cancel execution:', err);
      } finally {
        removeProcessingTask(taskId);
      }
    },
    [fetchTasks, addProcessingTask, removeProcessingTask]
  );

  /**
   * Handle archiving a completed task
   */
  const handleArchiveTask = useCallback(
    async (taskId: string) => {
      console.log('[RALPH BOARD TAB] Archive task:', taskId);

      addProcessingTask(taskId);
      try {
        const response = await fetch(`/api/ralph/tasks/${taskId}/archive`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        // Refresh tasks after archiving
        await fetchTasks();
      } catch (err) {
        console.error('[RALPH BOARD TAB] Failed to archive task:', err);
      } finally {
        removeProcessingTask(taskId);
      }
    },
    [fetchTasks, addProcessingTask, removeProcessingTask]
  );

  /**
   * Handle unarchiving a task
   */
  const handleUnarchiveTask = useCallback(
    async (taskId: string) => {
      console.log('[RALPH BOARD TAB] Unarchive task:', taskId);

      addProcessingTask(taskId);
      try {
        const response = await fetch(`/api/ralph/tasks/${taskId}/archive`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        // Refresh tasks after unarchiving
        await fetchTasks();
      } catch (err) {
        console.error('[RALPH BOARD TAB] Failed to unarchive task:', err);
      } finally {
        removeProcessingTask(taskId);
      }
    },
    [fetchTasks, addProcessingTask, removeProcessingTask]
  );

  /**
   * Handle changing a task's project
   */
  const handleChangeProject = useCallback(
    async (taskId: string, projectId: string | null) => {
      // Optimistic update — immediately reflect in the task list
      const queryKey = ['ralph-tasks', { archived: showArchived }];
      const previous = queryClient.getQueryData<RalphTaskData[]>(queryKey);
      queryClient.setQueryData<RalphTaskData[]>(queryKey, (old) =>
        (old || []).map((t) => (t.id === taskId ? { ...t, projectId } : t))
      );

      try {
        const response = await fetch(`/api/ralph/tasks/${taskId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }
      } catch (err) {
        console.error('[RALPH BOARD TAB] Failed to change project:', err);
        // Rollback on error
        if (previous) queryClient.setQueryData(queryKey, previous);
      } finally {
        queryClient.invalidateQueries({ queryKey: ['ralph-tasks'] });
      }
    },
    [showArchived, queryClient]
  );

  // Delete confirmation state
  const [deleteTargetTask, setDeleteTargetTask] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  /**
   * Open the delete confirmation modal
   */
  const handleRequestDeleteTask = useCallback(
    (taskId: string) => {
      const task = tasks.find((t) => t.id === taskId);
      setDeleteTargetTask({ id: taskId, title: task?.title || 'Untitled Task' });
      setIsDeleteModalOpen(true);
    },
    [tasks]
  );

  /**
   * Confirm and execute task deletion (optimistic)
   */
  const handleConfirmDelete = useCallback(() => {
    if (!deleteTargetTask) return;

    const taskId = deleteTargetTask.id;
    const queryKey = ['ralph-tasks', { archived: showArchived }];

    // Close modal and navigate away immediately
    setIsDeleteModalOpen(false);
    setDeleteTargetTask(null);

    // Snapshot previous cache for rollback
    const prevTasks = queryClient.getQueryData<RalphTaskData[]>(queryKey);

    // Optimistically remove the task (and its children) from the cache
    queryClient.setQueryData<RalphTaskData[]>(queryKey, (old) =>
      old ? old.filter((t) => t.id !== taskId && t.parentId !== taskId) : []
    );

    // Fire the API call in the background
    fetch(`/api/ralph/tasks/${taskId}`, { method: 'DELETE' })
      .then(async (response) => {
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }
      })
      .catch((err) => {
        console.error('[RALPH BOARD TAB] Failed to delete task, rolling back:', err);
        // Rollback: restore the previous cache
        if (prevTasks) {
          queryClient.setQueryData<RalphTaskData[]>(queryKey, prevTasks);
        }
      })
      .finally(() => {
        // Sync with server state
        fetchTasks();
      });
  }, [deleteTargetTask, queryClient, showArchived, fetchTasks]);

  /**
   * Handle cloning a task as a new draft
   */
  const handleCloneTask = useCallback(
    async (taskId: string) => {
      console.log('[RALPH BOARD TAB] Clone task:', taskId);

      addProcessingTask(taskId);
      try {
        const response = await fetch(`/api/ralph/tasks/${taskId}/clone`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        // If in archived view, switch to active view to show the cloned task
        if (showArchived) {
          setShowArchived(false);
        }

        // Refresh tasks after cloning
        await fetchTasks();
      } catch (err) {
        console.error('[RALPH BOARD TAB] Failed to clone task:', err);
      } finally {
        removeProcessingTask(taskId);
      }
    },
    [fetchTasks, showArchived, setShowArchived, addProcessingTask, removeProcessingTask]
  );

  /**
   * Handle executing the next ready story for a feature task
   */
  const handleExecuteNext = useCallback(
    async (featureId: string) => {
      console.log('[RALPH BOARD TAB] Execute next story for feature:', featureId);

      addProcessingTask(featureId);
      try {
        const response = await fetch(`/api/ralph/tasks/${featureId}/batch-execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'next', confirm: true }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        // Refresh tasks after batch execution
        await fetchTasks();
      } catch (err) {
        console.error('[RALPH BOARD TAB] Failed to execute next story:', err);
        // TODO: Show error toast in future story
      } finally {
        removeProcessingTask(featureId);
      }
    },
    [fetchTasks, addProcessingTask, removeProcessingTask]
  );

  /**
   * Handle executing all ready stories for a feature task
   */
  const handleExecuteAll = useCallback(
    async (featureId: string) => {
      console.log('[RALPH BOARD TAB] Execute all ready stories for feature:', featureId);

      addProcessingTask(featureId);
      try {
        const response = await fetch(`/api/ralph/tasks/${featureId}/batch-execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'all', confirm: true }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        // Refresh tasks after batch execution
        await fetchTasks();
      } catch (err) {
        console.error('[RALPH BOARD TAB] Failed to execute all stories:', err);
        // TODO: Show error toast in future story
      } finally {
        removeProcessingTask(featureId);
      }
    },
    [fetchTasks, addProcessingTask, removeProcessingTask]
  );

  // Keyboard shortcuts — visibleTaskIds reported by ListView
  const [visibleTaskIds, setVisibleTaskIds] = useState<string[]>([]);
  const handleVisibleTaskIdsChange = useCallback((ids: string[]) => {
    setVisibleTaskIds(ids);
  }, []);

  const isAnyModalOpen =
    isCreateModalOpen ||
    !!executeModalTaskId ||
    !!completeModalTaskId ||
    !!storiesModalTaskId ||
    !!featureCompleteModalTaskId ||
    isOverrideModalOpen ||
    isDeleteModalOpen ||
    isShortcutsHelpOpen ||
    (isPaletteOpen ?? false);

  const taskStatusMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of filteredTasks) {
      map.set(t.id, t.status);
    }
    return map;
  }, [filteredTasks]);

  const { focusedTaskId } = useKeyboardShortcuts({
    visibleTaskIds,
    taskStatusMap,
    definition,
    actions: {
      onExpandTask: handleExpandTask,
      onCreateTask: openCreateModal,
      onArchiveTask: handleArchiveTask,
      onTransitionTask: handleTransitionTask,
      onShowHelp: () => setIsShortcutsHelpOpen(true),
      onFocusSearch: () => searchInputRef.current?.focus(),
    },
    state: {
      isAnyModalOpen,
      currentScreenType: 'board' as const,
      currentSubTab: 'board' as const,
    },
  });

  return (
    <div className="space-y-6">
      {/* Sub-tab navigation + board filter bar */}
      <RalphSubTabs
        trailing={
          <BoardFilterBar
            searchFilter={searchFilter}
            onSearchFilterChange={setSearchFilter}
            searchInputRef={searchInputRef}
            workspaceFilter={workspaceFilter}
            workspaceOptions={workspaceOptions}
            onWorkspaceFilterChange={handleWorkspaceFilterChange}
            projectFilter={projectFilter}
            projects={projects}
            onProjectFilterChange={setProjectFilter}
            statusFilter={statusFilter}
            taskStates={taskStates}
            statusColors={statusColors}
            onStatusFilterChange={setStatusFilter}
            playbookFilter={playbookFilter}
            playbooks={playbooks}
            onPlaybookFilterChange={setPlaybookFilter}
            showArchived={showArchived}
            onShowArchivedChange={setShowArchived}
            onCreateTask={openCreateModal}
          />
        }
      />

      {/* Create Task Modal */}
      <CreateTaskModal
        isOpen={isCreateModalOpen}
        onOpenChange={(open, submitted) => {
          setIsCreateModalOpen(open);
          if (!open) {
            setCreateParentTask(null);
            // Only remove placeholder on cancel — on submit, onSuccess handles it
            if (!submitted) removePlaceholderTask();
          }
        }}
        parentTask={createParentTask}
      />

      {/* Action Modals — dynamically imported, self-contained */}
      <ExecuteModal
        isOpen={!!executeModalTaskId}
        taskId={executeModalTaskId}
        onClose={() => setExecuteModalTaskId(null)}
        onSuccess={fetchTasks}
        tasks={tasks}
        definition={definition}
      />
      <CompleteModal
        isOpen={!!completeModalTaskId}
        taskId={completeModalTaskId}
        onClose={() => setCompleteModalTaskId(null)}
        onSuccess={fetchTasks}
      />
      <StoriesModal
        isOpen={!!storiesModalTaskId}
        taskId={storiesModalTaskId}
        taskTitle={storiesModalTitle}
        onClose={() => {
          setStoriesModalTaskId(null);
          setStoriesModalTitle('');
        }}
        onSuccess={fetchTasks}
      />
      <FeatureCompleteModal
        isOpen={!!featureCompleteModalTaskId}
        taskId={featureCompleteModalTaskId}
        onClose={() => setFeatureCompleteModalTaskId(null)}
        onSuccess={fetchTasks}
        statusColors={statusColors}
      />

      {/* Status Override Confirmation Modal */}
      <Modal
        isOpen={isOverrideModalOpen}
        onOpenChange={(open) => {
          if (!open) closeOverrideModal();
        }}
        size="md"
      >
        <ModalContent>
          {(onCloseOverride: () => void) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-warning" />
                  Manual Status Override
                </div>
              </ModalHeader>
              <ModalBody>
                <div className="space-y-4">
                  <div className="flex items-center justify-center gap-3 py-3 bg-content2 rounded-lg">
                    <Chip
                      size="md"
                      variant="flat"
                      color={
                        statusColors[
                          tasks.find((t) => t.id === overrideTaskId)?.status ?? 'draft'
                        ] ?? 'default'
                      }
                    >
                      {tasks.find((t) => t.id === overrideTaskId)?.status ?? 'draft'}
                    </Chip>
                    <ArrowRight className="w-5 h-5 text-default-400" />
                    <Chip
                      size="md"
                      variant="flat"
                      color={statusColors[overrideTargetStatus ?? 'draft'] ?? 'default'}
                    >
                      {overrideTargetStatus}
                    </Chip>
                  </div>

                  {overrideInfo?.isNonStandard && (
                    <div className="p-3 bg-warning-50 border border-warning-200 rounded-lg">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" />
                        <div className="text-sm">
                          <p className="font-medium text-warning-700">Non-standard transition</p>
                          {overrideInfo.skippedSteps && (
                            <p className="text-warning-600 mt-1">
                              Skipping: {overrideInfo.skippedSteps}
                            </p>
                          )}
                          {overrideInfo.warning && (
                            <p className="text-warning-600 mt-1">{overrideInfo.warning}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Reason for override <span className="text-danger">*</span>
                    </label>
                    <Textarea
                      placeholder="Explain why you're manually changing the status..."
                      value={overrideReason}
                      onValueChange={setOverrideReason}
                      minRows={3}
                      variant="bordered"
                      description="This will be recorded in the audit trail"
                    />
                  </div>

                  <div className="text-xs text-default-400 flex items-center gap-1">
                    <History className="w-3 h-3" />
                    This override will be recorded in the task&apos;s transition history.
                  </div>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onCloseOverride}>
                  Cancel
                </Button>
                <Button
                  color="warning"
                  isDisabled={!overrideReason.trim()}
                  isLoading={isSubmittingOverride}
                  onPress={handleSubmitOverride}
                >
                  Override Status
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Delete Confirmation Modal */}
      <DeleteTaskConfirmationModal
        isOpen={isDeleteModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsDeleteModalOpen(false);
            setDeleteTargetTask(null);
          }
        }}
        taskTitle={deleteTargetTask?.title ?? ''}
        onConfirm={handleConfirmDelete}
        loading={false}
      />

      {/* Keyboard Shortcuts Help Modal */}
      <Modal isOpen={isShortcutsHelpOpen} onOpenChange={setIsShortcutsHelpOpen} size="sm">
        <ModalContent>
          <ModalHeader>Keyboard Shortcuts</ModalHeader>
          <ModalBody className="pb-6">
            <div className="space-y-2 text-sm">
              {[
                { keys: ['j', '↓'], desc: 'Next task' },
                { keys: ['k', '↑'], desc: 'Previous task' },
                { keys: ['Enter', 'o'], desc: 'Open task' },
                { keys: ['c'], desc: 'Create task' },
                { keys: ['s'], desc: 'Advance stage' },
                { keys: ['#', 'Del'], desc: 'Archive task' },
                { keys: ['Esc'], desc: 'Clear selection' },
                { keys: ['?'], desc: 'Show this help' },
              ].map(({ keys, desc }) => (
                <div key={desc} className="flex items-center justify-between">
                  <span className="text-default-500">{desc}</span>
                  <div className="flex gap-1">
                    {keys.map((k) => (
                      <kbd
                        key={k}
                        className="px-1.5 py-0.5 rounded bg-default-100 border border-default-200 text-xs font-mono"
                      >
                        {k}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* Loading state */}
      {isLoading && tasks.length === 0 && (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      )}

      {/* Board list view */}
      {!isLoading || tasks.length > 0 ? (
        <ListView
          tasks={filteredTasks}
          processingTaskIds={processingTaskIds}
          onExpandTask={handleExpandTask}
          onTransitionTask={handleTransitionTask}
          onStatusOverride={handleRequestOverride}
          onResearchAction={handleResearchAction}
          onAnswerQuestion={handleAnswerQuestion}
          onCancelExecution={handleCancelExecution}
          onArchive={handleArchiveTask}
          onUnarchive={handleUnarchiveTask}
          onDelete={handleRequestDeleteTask}
          onClone={handleCloneTask}
          onViewStories={openStoriesModal}
          onExecuteNext={handleExecuteNext}
          onExecuteAll={handleExecuteAll}
          onCompleteFeature={openFeatureCompleteModal}
          onCreateSubtask={handleCreateSubtask}
          onCreateTask={openCreateModal}
          projects={projects}
          onChangeProject={handleChangeProject}
          focusedTaskId={focusedTaskId}
          onVisibleTaskIdsChange={handleVisibleTaskIdsChange}
        />
      ) : null}
    </div>
  );
}
