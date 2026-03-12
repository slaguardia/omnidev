'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@heroui/button';
import { Chip } from '@heroui/chip';
import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from '@heroui/dropdown';
import {
  FileText,
  GitBranch,
  MessageCircleQuestion,
  ChevronDown,
  ChevronRight,
  FolderGit2,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  Zap,
  CheckCircle2,
  PlayCircle,
  Plus,
  Loader2,
  StopCircle,
  Archive,
  ArchiveRestore,
  Copy,
  Link,
  BookOpen,
  Trash2,
  ListTree,
  Lock,
  MoreVertical,
  Folder,
} from 'lucide-react';
import type { PlanningQuestion } from '@/lib/managers/ralph-task-manager';
import type { RalphTaskStatus, RalphTaskData, RalphProject } from './types';
import {
  getTaskStates,
  getStatusColors,
  getValidNextStatuses,
  getNextStatus,
  getTransitionLabel,
  formatRelativeTime,
  formatTaskNumber,
} from './types';
import { useWorkflowDefinition } from '@/hooks/queries/useWorkflowDefinition';

/**
 * Props for TaskCard component
 */
export interface TaskCardProps {
  task: RalphTaskData;
  variant: 'kanban' | 'list';
  isProcessing?: boolean;
  onExpand: (taskId: string) => void;
  onTransition: (taskId: string, toStatus: RalphTaskStatus) => void;
  onResearchAction?: (
    taskId: string,
    action: 'dismiss' | 'accept_all' | 'mark_ready' | 'add_feedback',
    data?: { gapId?: string; feedback?: string }
  ) => void;
  onAnswerQuestion?: (taskId: string, questionId: string, answer: string) => Promise<void>;
  onCancelExecution?: (taskId: string) => void;
  onArchive?: (taskId: string) => void;
  onUnarchive?: (taskId: string) => void;
  onDelete?: (taskId: string) => void;
  onClone?: (taskId: string) => void;
  onViewStories?: (taskId: string, taskTitle: string) => void;
  onExecuteNext?: (taskId: string) => void;
  onExecuteAll?: (taskId: string) => void;
  onCompleteFeature?: (taskId: string) => void;
  onCreateSubtask?: (taskId: string) => void;
  onConvertType?: (taskId: string, action: 'promote' | 'demote') => void;
  onStatusOverride?: (taskId: string, toStatus: RalphTaskStatus) => void;
  onDragStart?: (taskId: string, fromStatus: RalphTaskStatus) => void;
  onDragEnd?: () => void;
  isDraggable?: boolean;
  childTasks?: RalphTaskData[];
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  isNested?: boolean;
  depth?: number;
  projects?: RalphProject[];
  onChangeProject?: (taskId: string, projectId: string | null) => void;
  isFocused?: boolean;
}

/**
 * QuestionsInlineDisplay component (compact version for cards)
 */
function QuestionsInlineDisplay({
  questions,
  compact = false,
}: {
  questions: PlanningQuestion[];
  compact?: boolean;
}) {
  const unansweredQuestions = questions.filter((q) => !q.answer);
  const answeredQuestions = questions.filter((q) => q.answer);

  if (unansweredQuestions.length === 0) {
    if (answeredQuestions.length > 0 && !compact) {
      return (
        <div className="flex items-center gap-1.5 mt-2">
          <Chip
            size="sm"
            variant="flat"
            color="success"
            startContent={<CheckCircle2 className="w-3 h-3" />}
          >
            {answeredQuestions.length} question{answeredQuestions.length !== 1 ? 's' : ''} answered
          </Chip>
        </div>
      );
    }
    return null;
  }

  if (compact) {
    return (
      <div className="flex items-center gap-1.5 mt-2">
        <Chip
          size="sm"
          variant="flat"
          color="warning"
          startContent={<MessageCircleQuestion className="w-3 h-3" />}
        >
          {unansweredQuestions.length} question{unansweredQuestions.length !== 1 ? 's' : ''}
        </Chip>
      </div>
    );
  }

  return null;
}

/**
 * TaskCard component displays a single task in the Ralph Board
 * Used in both kanban and list views
 */
export default function TaskCard({
  task,
  variant,
  isProcessing = false,
  onExpand,
  onTransition,
  onResearchAction: _onResearchAction,
  onAnswerQuestion: _onAnswerQuestion,
  onCancelExecution,
  onArchive,
  onUnarchive,
  onDelete,
  onClone,
  onViewStories,
  onExecuteNext,
  onExecuteAll,
  onCompleteFeature: _onCompleteFeature,
  onCreateSubtask,
  onConvertType,
  onStatusOverride,
  onDragStart,
  onDragEnd,
  isDraggable = false,
  childTasks = [],
  isExpanded = false,
  onToggleExpand,
  isNested = false,
  depth: _depth = 0,
  projects = [],
  onChangeProject,
  isFocused = false,
}: TaskCardProps) {
  const { definition } = useWorkflowDefinition();
  const taskStates = getTaskStates(definition);
  const statusColors = getStatusColors(definition);

  const statusConfig = taskStates.find((s) => s.key === task.status);
  const _StatusIcon = statusConfig?.icon || FileText;

  const completedChildren = childTasks.filter((c) => c.status === 'complete').length;
  const totalChildren = childTasks.length;
  const hasChildren = totalChildren > 0;

  const execStatus = task.executionStatus;
  const hasReadyStories = (execStatus?.readyCount ?? 0) > 0;
  const hasExecutingStories = (execStatus?.executingCount ?? 0) > 0;

  const _validNextStatuses = getValidNextStatuses(task.status, definition);
  const nextStatus = getNextStatus(task.status, definition);

  const canViewStories =
    task.hasGeneratedStories && ['planning', 'research', 'triage'].includes(task.status);

  const isExecuting = task.status === 'executing';
  const hasExecutionError = isExecuting && task.executionError;
  const isComplete = task.status === 'complete';
  const hasPendingQuestions = task.pendingQuestionsCount > 0;
  const isBlockedByDeps = task.isBlocked && task.blockedBy.length > 0;

  const canPromote = task.taskType === 'simple' && task.status === 'ready';
  const canDemote =
    task.taskType === 'feature' &&
    (task.childIds?.length ?? 0) === 1 &&
    ['ready', 'planning', 'research'].includes(task.status);

  const canAddSubtask = !task.parentId;

  if (variant === 'kanban') {
    return (
      <div
        data-task-id={task.id}
        className={`p-3 bg-content1 rounded-lg border border-divider hover:bg-content2/20 cursor-pointer transition-colors duration-150 group ${isNested ? 'ml-4 border-l-2 border-l-primary/30' : ''} ${isBlockedByDeps ? 'opacity-60 border-warning/50 bg-warning/5' : ''} ${isProcessing ? 'opacity-75 border-primary/40' : ''}`}
        onClick={() => {
          if (!isProcessing) onExpand(task.id);
        }}
        draggable={isDraggable && !isNested && !isBlockedByDeps && !isProcessing}
        onDragStart={(e) => {
          if (onDragStart && isDraggable && !isNested && !isBlockedByDeps && !isProcessing) {
            e.dataTransfer.effectAllowed = 'move';
            onDragStart(task.id, task.status);
          }
        }}
        onDragEnd={() => {
          if (onDragEnd) onDragEnd();
        }}
      >
        {/* Row 1: Project and branch with badge cluster */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-default-400 truncate">
            <span className="truncate">{task.workspaceName}</span>
            {(task.featureBranch || task.deliveryMethod === 'direct-commit') && (
              <>
                <span className="text-default-300">|</span>
                <div className="flex items-center gap-1 truncate">
                  <GitBranch className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate max-w-[100px]">
                    {task.deliveryMethod === 'direct-commit'
                      ? task.featureBranch || 'direct'
                      : task.featureBranch}
                  </span>
                </div>
              </>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {isBlockedByDeps && (
              <span
                title={`Blocked by ${task.blockedBy.length} task${task.blockedBy.length > 1 ? 's' : ''}`}
              >
                <Lock className="w-4 h-4 text-warning-600" />
              </span>
            )}
            {task.pendingQuestionsCount > 0 && (
              <div className="flex items-center gap-0.5 text-warning-500">
                <MessageCircleQuestion className="w-4 h-4" />
                <span className="text-xs font-medium">{task.pendingQuestionsCount}</span>
              </div>
            )}
            {isComplete && task.prUrl && (
              <a
                href={task.prUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 hover:text-primary-700"
                onClick={(e) => e.stopPropagation()}
                title={task.prUrl?.includes('gitlab') ? 'View Merge Request' : 'View Pull Request'}
              >
                <Link className="w-4 h-4" />
              </a>
            )}
            {onDelete && (
              <Dropdown isDisabled={isProcessing}>
                <DropdownTrigger>
                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    className="w-6 h-6 min-w-6"
                    isDisabled={isProcessing}
                    onClick={(e) => e.stopPropagation()}
                  >
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

        {/* Row 2: Title with type icon and expand toggle */}
        <div className="flex items-start gap-2 mt-2">
          {hasChildren && onToggleExpand && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand();
              }}
              className="flex-shrink-0 p-0.5 hover:bg-content2 rounded transition-colors"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-default-500" />
              ) : (
                <ChevronRight className="w-4 h-4 text-default-500" />
              )}
            </button>
          )}
          {isNested && task.storyOrder && (
            <span className="text-xs text-default-400 flex-shrink-0 font-mono">
              #{task.storyOrder}
            </span>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              {task.taskNumber != null && (
                <span className="text-xs text-default-400 flex-shrink-0 font-mono">
                  {formatTaskNumber(task.taskNumber)}
                </span>
              )}
              {task.taskType === 'feature' && (
                <FolderGit2 className="w-3.5 h-3.5 text-secondary flex-shrink-0" />
              )}
              {task.taskType === 'story' && (
                <BookOpen className="w-3.5 h-3.5 text-primary/70 flex-shrink-0" />
              )}
              <h4 className="font-medium text-sm truncate">{task.title}</h4>
            </div>
          </div>
        </div>

        {/* Row 3: Feature progress bar */}
        {hasChildren && (
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 h-1.5 bg-content2 rounded-full overflow-hidden">
              <div
                className="h-full bg-success transition-all"
                style={{ width: `${(completedChildren / totalChildren) * 100}%` }}
              />
            </div>
            <span className="text-xs text-default-500 flex-shrink-0">
              {completedChildren}/{totalChildren}
            </span>
          </div>
        )}

        {/* Row 5: Execution one-liner (if executing) */}
        {isExecuting && (
          <div className="flex items-center gap-2 mt-2 text-xs text-default-500">
            {hasExecutionError || task.executionJobInfo?.status === 'failed' ? (
              <>
                <AlertTriangle className="w-3 h-3 text-danger" />
                <span className="text-danger">
                  {task.executionJobInfo?.error
                    ? `Failed: ${task.executionJobInfo.error.slice(0, 80)}${task.executionJobInfo.error.length > 80 ? '...' : ''}`
                    : task.executionError
                      ? `Failed: ${task.executionError.slice(0, 80)}${task.executionError.length > 80 ? '...' : ''}`
                      : 'Execution failed'}
                </span>
              </>
            ) : (
              <>
                <Loader2 className="w-3 h-3 animate-spin text-primary" />
                {task.executionJobInfo ? (
                  <>
                    <span>Job {task.executionJobInfo.status}</span>
                    {task.executionJobInfo.startedAt && (
                      <span>- {formatRelativeTime(task.executionJobInfo.startedAt)}</span>
                    )}
                  </>
                ) : (
                  <span>Starting...</span>
                )}
              </>
            )}
          </div>
        )}

        {/* Processing indicator */}
        {isProcessing && !isExecuting && (
          <div className="flex items-center gap-2 mt-2 text-xs text-default-500">
            <Loader2 className="w-3 h-3 animate-spin text-primary" />
            <span>Processing...</span>
          </div>
        )}

        {/* Row 6: Action buttons */}
        {(nextStatus || canViewStories) && (
          <div className="flex flex-wrap gap-2.5 mt-2 pt-2 border-t border-divider">
            {canViewStories && onViewStories && (
              <Button
                size="sm"
                variant="flat"
                color="secondary"
                className="text-xs h-6 px-2"
                isDisabled={isProcessing}
                startContent={<ListTree className="w-3 h-3" />}
                onPress={(e) => {
                  e.continuePropagation?.();
                  onViewStories(task.id, task.title);
                }}
                onClick={(e) => e.stopPropagation()}
              >
                Stories ({task.generatedStoriesCount})
              </Button>
            )}
            {nextStatus &&
              (() => {
                const isBlockedByDep = nextStatus === 'executing' && isBlockedByDeps;
                return (
                  <Button
                    size="sm"
                    variant="flat"
                    color={statusColors[nextStatus] ?? 'default'}
                    className="text-xs h-6 px-2"
                    startContent={
                      isBlockedByDep ? (
                        <Lock className="w-3 h-3" />
                      ) : (
                        <ArrowRight className="w-3 h-3" />
                      )
                    }
                    isDisabled={isProcessing || isBlockedByDep}
                    onPress={(e) => {
                      e.continuePropagation?.();
                      onTransition(task.id, nextStatus);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {isBlockedByDep
                      ? 'Blocked'
                      : getTransitionLabel(task.status, nextStatus, definition)}
                  </Button>
                );
              })()}
            {canAddSubtask && onCreateSubtask && (
              <Button
                size="sm"
                variant="flat"
                color="default"
                className="text-xs h-6 px-2"
                isDisabled={isProcessing}
                startContent={<Plus className="w-3 h-3" />}
                onPress={(e) => {
                  e.continuePropagation?.();
                  onCreateSubtask(task.id);
                }}
                onClick={(e) => e.stopPropagation()}
              >
                Add Subtask
              </Button>
            )}
            {canPromote && onConvertType && (
              <Button
                size="sm"
                variant="flat"
                color="secondary"
                className="text-xs h-6 px-2"
                isDisabled={isProcessing}
                startContent={<ArrowUpRight className="w-3 h-3" />}
                onPress={(e) => {
                  e.continuePropagation?.();
                  onConvertType(task.id, 'promote');
                }}
                onClick={(e) => e.stopPropagation()}
              >
                Convert to Feature
              </Button>
            )}
            {canDemote && onConvertType && (
              <Button
                size="sm"
                variant="flat"
                color="default"
                className="text-xs h-6 px-2"
                isDisabled={isProcessing}
                startContent={<ArrowDownRight className="w-3 h-3" />}
                onPress={(e) => {
                  e.continuePropagation?.();
                  onConvertType(task.id, 'demote');
                }}
                onClick={(e) => e.stopPropagation()}
              >
                Convert to Simple
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }

  // List view variant — compact Linear-style row with full data
  const statusColor = statusColors[task.status] ?? 'default';

  // Context menu state (right-click actions)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const ctxMenuRef = useRef<HTMLDivElement>(null);

  const closeCtxMenu = useCallback(() => setCtxMenu(null), []);

  // Close on escape or outside click
  useEffect(() => {
    if (!ctxMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeCtxMenu();
    };
    const onClick = (e: MouseEvent) => {
      if (ctxMenuRef.current?.contains(e.target as Node)) return;
      closeCtxMenu();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('click', onClick, true);
    window.addEventListener('contextmenu', onClick, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('contextmenu', onClick, true);
    };
  }, [ctxMenu, closeCtxMenu]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (isProcessing) return;
      setCtxMenu({ x: e.clientX, y: e.clientY });
    },
    [isProcessing]
  );

  const ctxAction = useCallback(
    (fn: (() => void) | undefined) => {
      closeCtxMenu();
      fn?.();
    },
    [closeCtxMenu]
  );

  // Placeholder row — shown while create modal is open
  if (task.isPlaceholder) {
    return (
      <div className="border-b border-divider last:border-b-0 animate-pulse">
        <div
          className="grid items-center py-2 px-3 gap-x-8"
          style={{ gridTemplateColumns: '20px 64px 2.5fr 1fr 1.5fr 1.5fr 80px' }}
        >
          <span className="w-4 flex-shrink-0" />
          <div className="text-xs text-default-400 font-mono truncate">
            {formatTaskNumber(task.taskNumber)}
          </div>
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="h-4 w-32 bg-default-200 rounded" />
          </div>
          <div>
            <Chip size="sm" variant="flat" color="default" className="h-6 text-xs px-2">
              Draft
            </Chip>
          </div>
          <div />
          <div />
          <div />
        </div>
      </div>
    );
  }

  // Build context menu items
  const ctxItems: {
    key: string;
    label: string;
    icon: React.ReactNode;
    action: () => void;
    danger?: boolean;
    header?: boolean;
  }[] = [];

  if (nextStatus) {
    const isBlockedByDep = nextStatus === 'executing' && isBlockedByDeps;
    if (!isBlockedByDep) {
      const label = getTransitionLabel(task.status, nextStatus, definition);
      ctxItems.push({
        key: 'advance',
        label,
        icon: <ArrowRight className="w-3.5 h-3.5" />,
        action: () => onTransition(task.id, nextStatus),
      });
    }
  }
  if (canViewStories && onViewStories) {
    ctxItems.push({
      key: 'stories',
      label: `Stories (${task.generatedStoriesCount})`,
      icon: <ListTree className="w-3.5 h-3.5" />,
      action: () => onViewStories(task.id, task.title),
    });
  }
  if (hasChildren && hasReadyStories && onExecuteNext) {
    ctxItems.push({
      key: 'execute-next',
      label: 'Execute Next',
      icon: <PlayCircle className="w-3.5 h-3.5" />,
      action: () => onExecuteNext(task.id),
    });
  }
  if (hasChildren && hasReadyStories && (execStatus?.readyCount ?? 0) > 1 && onExecuteAll) {
    ctxItems.push({
      key: 'execute-all',
      label: `Execute All (${execStatus?.readyCount})`,
      icon: <Zap className="w-3.5 h-3.5" />,
      action: () => onExecuteAll(task.id),
    });
  }
  if (isExecuting && onCancelExecution) {
    ctxItems.push({
      key: 'cancel',
      label: 'Cancel Execution',
      icon: <StopCircle className="w-3.5 h-3.5" />,
      action: () => onCancelExecution(task.id),
    });
  }
  if (canAddSubtask && onCreateSubtask) {
    ctxItems.push({
      key: 'subtask',
      label: 'Add Subtask',
      icon: <Plus className="w-3.5 h-3.5" />,
      action: () => onCreateSubtask(task.id),
    });
  }
  if (isComplete && onClone) {
    ctxItems.push({
      key: 'clone',
      label: 'Clone',
      icon: <Copy className="w-3.5 h-3.5" />,
      action: () => onClone(task.id),
    });
  }
  if (isComplete && !task.isArchived && onArchive) {
    ctxItems.push({
      key: 'archive',
      label: 'Archive',
      icon: <Archive className="w-3.5 h-3.5" />,
      action: () => onArchive(task.id),
    });
  }
  if (isComplete && task.isArchived && onUnarchive) {
    ctxItems.push({
      key: 'unarchive',
      label: 'Unarchive',
      icon: <ArchiveRestore className="w-3.5 h-3.5" />,
      action: () => onUnarchive(task.id),
    });
  }
  if (onChangeProject && projects.length > 0) {
    ctxItems.push({
      key: 'project-header',
      label: 'Set Project',
      icon: <Folder className="w-3.5 h-3.5" />,
      action: () => {},
      header: true,
    });
    if (task.projectId) {
      ctxItems.push({
        key: 'project-none',
        label: 'No Project',
        icon: <span className="w-3.5 h-3.5" />,
        action: () => onChangeProject(task.id, null),
      });
    }
    for (const p of projects) {
      if (p.id === task.projectId) continue;
      ctxItems.push({
        key: `project-${p.id}`,
        label: p.name,
        icon: (
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: p.color }}
          />
        ),
        action: () => onChangeProject(task.id, p.id),
      });
    }
  }
  if (onDelete) {
    ctxItems.push({
      key: 'delete',
      label: 'Delete',
      icon: <Trash2 className="w-3.5 h-3.5" />,
      action: () => onDelete(task.id),
      danger: true,
    });
  }

  return (
    <div
      data-task-id={task.id}
      className={`border-b border-divider last:border-b-0 hover:bg-content2/50 cursor-pointer transition-colors select-none ${isNested ? 'pl-8' : ''} ${isBlockedByDeps ? 'opacity-60' : ''} ${isProcessing ? 'opacity-75' : ''} ${isFocused ? 'ring-2 ring-primary ring-inset bg-primary/5' : ''}`}
      onClick={() => {
        if (!isProcessing) onExpand(task.id);
      }}
      onContextMenu={handleContextMenu}
    >
      {/* Row using CSS Grid for consistent column distribution */}
      <div
        className="grid items-center py-2 px-3 gap-x-8"
        style={{ gridTemplateColumns: '20px 64px 2.5fr 1fr 1.5fr 1.5fr 80px' }}
      >
        {/* Expand toggle */}
        <div className="flex items-center">
          {hasChildren && onToggleExpand ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand();
              }}
              className="p-0.5 hover:bg-content2 rounded transition-colors flex-shrink-0"
            >
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-default-400" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-default-400" />
              )}
            </button>
          ) : (
            <span className="w-4 flex-shrink-0" />
          )}
        </div>

        {/* Task ID */}
        <div className="text-xs text-default-400 font-mono truncate">
          {formatTaskNumber(task.taskNumber) ?? '\u2014'}
        </div>

        {/* Title + inline badges */}
        <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
          {task.taskType === 'feature' && (
            <FolderGit2 className="w-3.5 h-3.5 text-secondary flex-shrink-0" />
          )}
          {task.taskType === 'story' && (
            <BookOpen className="w-3.5 h-3.5 text-primary/70 flex-shrink-0" />
          )}
          <span className="font-medium text-sm truncate">{task.title}</span>
          {(() => {
            const project = task.projectId ? projects.find((p) => p.id === task.projectId) : null;
            return project ? (
              <span className="flex items-center gap-1 text-xs text-default-400 flex-shrink-0 ml-2">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: project.color }}
                />
                <span className="truncate max-w-[100px]">{project.name}</span>
              </span>
            ) : null;
          })()}
          {isBlockedByDeps && (
            <span title="Blocked">
              <Lock className="w-3.5 h-3.5 text-warning flex-shrink-0" />
            </span>
          )}
          {task.pendingQuestionsCount > 0 && (
            <span className="flex items-center gap-0.5 text-warning-500 flex-shrink-0">
              <MessageCircleQuestion className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">{task.pendingQuestionsCount}</span>
            </span>
          )}
          {isExecuting && hasExecutionError && (
            <span title="Execution error">
              <AlertTriangle className="w-3.5 h-3.5 text-danger flex-shrink-0" />
            </span>
          )}
          {hasChildren && (
            <span
              className={`text-xs tabular-nums flex-shrink-0 ${completedChildren === totalChildren ? 'text-success' : 'text-default-400'}`}
            >
              {completedChildren}/{totalChildren}
            </span>
          )}
          {isComplete && task.prUrl && (
            <a
              href={task.prUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary-600 flex-shrink-0"
              onClick={(e) => e.stopPropagation()}
              title="View PR"
            >
              <Link className="w-3.5 h-3.5" />
            </a>
          )}
          {task.isArchived && (
            <span title="Archived">
              <Archive className="w-3.5 h-3.5 text-default-300 flex-shrink-0" />
            </span>
          )}
          {isExecuting && (
            <span className="flex items-center gap-1 text-xs flex-shrink-0">
              {hasExecutionError || task.executionJobInfo?.status === 'failed' ? (
                <>
                  <AlertTriangle className="w-3 h-3 text-danger" />
                  <span className="text-danger">Failed</span>
                </>
              ) : (
                <>
                  <Loader2 className="w-3 h-3 animate-spin text-primary" />
                  <span className="text-default-400">
                    {task.executionJobInfo ? (
                      <>
                        {task.executionJobInfo.status}
                        {task.executionJobInfo.startedAt &&
                          ` · ${formatRelativeTime(task.executionJobInfo.startedAt)}`}
                      </>
                    ) : (
                      'Starting...'
                    )}
                  </span>
                </>
              )}
            </span>
          )}
          {isProcessing && !isExecuting && (
            <span className="flex items-center gap-1 text-xs text-default-400 flex-shrink-0">
              <Loader2 className="w-3 h-3 animate-spin text-primary" />
              Processing...
            </span>
          )}
          {hasChildren && execStatus && (hasExecutingStories || hasReadyStories) && (
            <span
              className="flex items-center gap-2 text-xs flex-shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              {hasExecutingStories && (
                <span className="text-primary flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {execStatus.executingCount}/{execStatus.totalStories}
                </span>
              )}
              {hasReadyStories && (
                <span className="text-success">{execStatus.readyCount} ready</span>
              )}
            </span>
          )}
          {isComplete && task.totalIterations > 0 && (
            <span className="text-xs text-default-400 flex-shrink-0">
              {task.totalIterations} iter
            </span>
          )}
          {hasPendingQuestions && (
            <QuestionsInlineDisplay questions={task.pendingQuestions} compact />
          )}
        </div>

        {/* Stage (dropdown to change status) */}
        <div onClick={(e) => e.stopPropagation()}>
          <Dropdown isDisabled={isProcessing}>
            <DropdownTrigger>
              <button
                type="button"
                className={isProcessing ? 'cursor-not-allowed' : 'cursor-pointer'}
              >
                <Chip
                  size="sm"
                  variant="flat"
                  color={statusColor}
                  className="h-6 text-xs px-2"
                  endContent={<ChevronDown className="w-3 h-3 opacity-60" />}
                >
                  {statusConfig?.label || task.status}
                </Chip>
              </button>
            </DropdownTrigger>
            <DropdownMenu
              aria-label="Change status"
              selectionMode="single"
              selectedKeys={new Set([task.status])}
              disabledKeys={new Set([task.status])}
              onAction={(key) => {
                const target = key as RalphTaskStatus;
                if (target === task.status) return;
                if (onStatusOverride) {
                  onStatusOverride(task.id, target);
                } else {
                  onTransition(task.id, target);
                }
              }}
            >
              {getValidNextStatuses(task.status, definition).map((status) => {
                const color = statusColors[status] ?? 'default';
                const cClass =
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
                    startContent={<span className={`w-2 h-2 rounded-full ${cClass}`} />}
                  >
                    {stageLabel}
                  </DropdownItem>
                );
              })}
            </DropdownMenu>
          </Dropdown>
        </div>

        {/* Workspace */}
        <div className="text-xs text-default-500 truncate">{task.workspaceName}</div>

        {/* Branch */}
        <div className="flex items-center gap-1 text-xs text-default-400 min-w-0">
          {task.featureBranch || (task.deliveryMethod === 'direct-commit' && task.baseBranch) ? (
            <>
              <GitBranch className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">
                {task.deliveryMethod === 'direct-commit'
                  ? `${task.baseBranch} (direct)`
                  : task.featureBranch}
              </span>
            </>
          ) : (
            <span className="text-default-300">&mdash;</span>
          )}
        </div>

        {/* Updated time */}
        <div className="text-xs text-default-400 tabular-nums text-right whitespace-nowrap">
          {formatRelativeTime(task.updatedAt)}
        </div>
      </div>

      {/* Context menu (right-click) */}
      {ctxMenu && (
        <div
          ref={ctxMenuRef}
          className="fixed z-50 min-w-[180px] py-1 rounded-md shadow-sm border border-divider bg-content1"
          style={{ top: ctxMenu.y, left: ctxMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {ctxItems.map((item, i) => (
            <React.Fragment key={item.key}>
              {(item.danger || item.header) && i > 0 && (
                <div className="my-1 border-t border-divider" />
              )}
              {item.header ? (
                <div className="flex items-center gap-2.5 px-3 py-1.5 text-xs font-medium text-default-400 uppercase tracking-wide">
                  {item.icon}
                  {item.label}
                </div>
              ) : (
                <button
                  type="button"
                  className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left transition-colors ${item.danger ? 'text-danger hover:bg-danger/10' : 'text-foreground hover:bg-content2'}`}
                  onClick={() => ctxAction(item.action)}
                >
                  {item.icon}
                  {item.label}
                </button>
              )}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
