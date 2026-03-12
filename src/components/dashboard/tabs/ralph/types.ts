/* eslint-disable validate-filename/naming-rules */
import { FileText, Zap } from 'lucide-react';
import type { PlanningQuestion } from '@/lib/managers/ralph-task-manager';
import type { StageOutput } from '@/lib/managers/ralph-task-manager';
import type { WorkflowDefinition, WorkflowStageDefinition } from '@/lib/types/index';

export type RalphTaskStatus = string;

export type ViewMode = 'kanban' | 'list';

export type RalphScreen = { type: 'board' } | { type: 'task-detail'; taskId: string };

// Execution job info for tasks in executing state
export interface ExecutionJobInfo {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

// Task data type for the board (from API)
export interface RalphTaskData {
  id: string;
  title: string;
  workspaceId: string;
  workspaceName: string;
  status: string;
  taskType: 'simple' | 'story' | 'feature';
  isSubtask: boolean;
  description: string | null;
  filePaths: string[];
  featureBranch: string | null;
  updatedAt: string;
  pendingQuestionsCount: number;
  pendingQuestions: PlanningQuestion[];
  // Execution-related fields (for executing tasks)
  executionJobId: string | null;
  executionJobInfo: ExecutionJobInfo | null;
  executionError: string | null;
  // Completion-related fields (for complete tasks)
  prUrl: string | null;
  completedAt: string | null;
  isArchived: boolean;
  totalIterations: number;
  // Story-related fields
  hasGeneratedStories: boolean;
  generatedStoriesCount: number;
  childCount: number;
  // Hierarchy fields for nested display
  parentId: string | null;
  storyOrder: number | null;
  subtaskOrder: number | null;
  childIds: string[];
  // Dependency fields for blocking relationships
  blockedBy: string[];
  isBlocked: boolean;
  // Delivery method
  deliveryMethod?: 'merge-request' | 'direct-commit';
  // Sequential task number (RLP-N)
  taskNumber: number | null;
  // Project ID
  projectId: string | null;
  // Playbook ID
  playbookId: string | null;
  // Generic stage outputs
  stageOutputs?: Record<string, StageOutput>;
  // Execution status (for parent tasks with children)
  executionStatus?: FeatureExecutionStatusData | null;
  // Branch configuration
  baseBranch?: string | null;
  prTargetBranch?: string | null;
  // Git provider derived from workspace repo URL
  gitProvider?: 'github' | 'gitlab' | 'other';
  // Timestamps
  createdAt?: string;
  // Client-only: placeholder row shown while create modal is open
  isPlaceholder?: boolean;
}

// Feature execution status data
export interface FeatureExecutionStatusData {
  totalStories: number;
  executingCount: number;
  completedCount: number;
  readyCount: number;
  pendingCount: number;
  blockedCount: number;
  executingStoryIds: string[];
  readyStoryIds: string[];
}

// Full task detail type (from GET /api/ralph/tasks/[taskId])
export interface RalphTaskDetail {
  id: string;
  title: string;
  workspaceId: string;
  workspaceName: string;
  status: string;
  description: string | null;
  instructions: string | null;
  filePaths: string[];
  baseBranch: string | null;
  featureBranch: string | null;
  prTargetBranch: string | null;
  parentId: string | null;
  parentTitle?: string | null;
  childIds: string[];
  childTasks?: { id: string; title: string; status: string }[];
  blockedBy: string[];
  // Execution fields
  executionJobId: string | null;
  executionJobInfo: ExecutionJobInfo | null;
  executionError: string | null;
  // Completion fields
  prUrl: string | null;
  completedAt: string | null;
  isArchived: boolean;
  totalIterations: number;
  stageOutputs?: Record<string, StageOutput>;
  deliveryMethod?: 'merge-request' | 'direct-commit';
  taskNumber: number | null;
  projectId: string | null;
  playbookId: string | null;
  gitProvider: 'github' | 'gitlab' | 'other';
  createdAt: string;
  updatedAt: string;
}

// Dependency info from GET /api/ralph/tasks/[taskId]/dependencies
export interface DependencyInfo {
  taskId: string;
  blockedBy: string[];
  blocks: string[];
  isBlocked: boolean;
  blockerDetails: Array<{ id: string; title: string; status: string }>;
  blocksDetails: Array<{ id: string; title: string; status: string }>;
}

// Override info for manual status changes
export interface ManualOverrideInfo {
  isNonStandard: boolean;
  skippedSteps?: string;
  warning?: string;
}

// Task type filter options
export type TaskTypeFilter = 'all' | 'tasks' | 'subtasks';

// Labels for task type filters
export const TASK_TYPE_FILTER_LABELS: Record<TaskTypeFilter, string> = {
  all: 'All',
  tasks: 'Top-Level',
  subtasks: 'Subtasks',
};

// Workspace info with task count for filter dropdown
export interface WorkspaceFilterOption {
  id: string;
  name: string;
  taskCount: number;
}

/**
 * Derive task states from a workflow definition.
 * Returns array of { key, label, icon, color } for kanban columns.
 */
export function getTaskStates(definition: WorkflowDefinition) {
  const states: { key: string; label: string; icon: typeof FileText; color: string }[] = [];

  // Draft bookend
  states.push({ key: 'draft', label: 'Draft', icon: FileText, color: 'default' });

  // User-defined stages
  for (const stage of definition.stages) {
    states.push({
      key: stage.id,
      label: stage.label,
      icon: FileText, // Generic icon — could be extended
      color: stage.color,
    });
  }

  // Complete bookend
  states.push({ key: 'complete', label: 'Complete', icon: Zap, color: 'success' });

  return states;
}

type StatusColor = 'default' | 'warning' | 'secondary' | 'success' | 'primary' | 'danger';

/**
 * Derive status colors from a workflow definition.
 */
export function getStatusColors(definition: WorkflowDefinition): Record<string, StatusColor> {
  const colors: Record<string, StatusColor> = {
    draft: 'default',
    complete: 'success',
  };

  for (const stage of definition.stages) {
    colors[stage.id] = stage.color;
  }

  return colors;
}

/**
 * Get all valid statuses — free movement, all stages are valid targets.
 */
export function getValidNextStatuses(
  _currentStatus: string,
  definition: WorkflowDefinition
): string[] {
  return ['draft', ...definition.stages.map((s) => s.id), 'complete'];
}

/**
 * Get the single next status in the ordered stage sequence.
 * Returns null if the task is already complete (no forward movement).
 */
export function getNextStatus(
  currentStatus: string,
  definition: WorkflowDefinition
): string | null {
  const stageIds = definition.stages.map((s) => s.id);
  if (currentStatus === 'complete') return null;
  if (currentStatus === 'draft') return stageIds[0] ?? 'complete';
  const currentIndex = stageIds.indexOf(currentStatus);
  if (currentIndex === -1) return stageIds[0] ?? 'complete';
  if (currentIndex === stageIds.length - 1) return 'complete';
  return stageIds[currentIndex + 1] ?? 'complete';
}

/**
 * Get a transition label for moving to a status.
 */
export function getTransitionLabel(
  _from: string,
  to: string,
  definition: WorkflowDefinition
): string {
  if (to === 'draft') return 'Move to Draft';
  if (to === 'complete') return 'Complete';

  const stage = definition.stages.find((s) => s.id === to);
  return stage ? `Move to ${stage.label}` : to.charAt(0).toUpperCase() + to.slice(1);
}

/**
 * Find a stage definition by ID
 */
export function findStage(
  definition: WorkflowDefinition,
  stageId: string
): WorkflowStageDefinition | undefined {
  return definition.stages.find((s) => s.id === stageId);
}

// Project type for UI
export interface RalphProject {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

// Playbook type for UI
export interface RalphPlaybook {
  id: string;
  name: string;
  description: string;
  stageIds: string[];
  /** Per-stage prompt overrides. Key is stage ID, value is the prompt template. */
  promptOverrides: Record<string, string>;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

// Format task number as human-readable ID
export function formatTaskNumber(n: number | null | undefined): string | null {
  if (n == null) return null;
  return `RLP-${n}`;
}

// Format relative time (e.g., "5m ago", "2h ago", "3d ago")
export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = Date.now();
  const diff = now - date.getTime();

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ago`;
  }
  if (hours > 0) {
    return `${hours}h ago`;
  }
  if (minutes > 0) {
    return `${minutes}m ago`;
  }
  return 'just now';
}

// Format ISO datetime to human-readable format
export function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
