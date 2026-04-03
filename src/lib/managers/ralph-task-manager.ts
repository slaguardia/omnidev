/**
 * Ralph Task Manager - Persistent task management for Ralph Board
 */

import { z } from 'zod';
import type { WorkspaceId, AsyncResult } from '@/lib/types/index';
import {
  getDb,
  dbInsertTask,
  dbGetTask,
  dbUpdateTask,
  dbDeleteTask,
  dbTaskExists,
  dbGetAllIndexEntries,
  dbGetChildCount,
  dbGetChildTasks,
  dbDeleteByWorkspace,
  dbNextTaskNumber,
  dbCreateProject,
  dbListProjects,
  dbGetProject,
  dbUpdateProject,
  dbDeleteProject,
  dbCreatePlaybook,
  dbListPlaybooks,
  dbGetPlaybook,
  dbUpdatePlaybook,
  dbDeletePlaybook,
  type DbProject,
  type DbPlaybook,
} from './ralph-task-db';

/**
 * @deprecated Use string type directly. Kept for backward compat.
 */
export const RALPH_TASK_STATUSES = [
  'draft',
  'triage',
  'planning',
  'research',
  'ready',
  'executing',
  'complete',
] as const;

/**
 * Task status is now a free-form string matching stage IDs, 'draft', or 'complete'.
 */
export type RalphTaskStatus = string;

/**
 * @deprecated Transition validation removed — free movement between stages.
 * Kept as no-op for backward compat during transition.
 */
export function isValidTransition(_from: string, _to: string): boolean {
  return true;
}

/**
 * @deprecated Free movement — all statuses are valid targets.
 * Returns the default status list for backward compat.
 */
export function getValidNextStatuses(_status: string): string[] {
  return [...RALPH_TASK_STATUSES];
}

/**
 * @deprecated TRIAGE_RECOMMENDED_PATHS removed — use recommendsSubtasks boolean instead
 */

/**
 * Triage analysis result - returned when a task is analyzed
 */
export interface TriageAnalysisResult {
  // Complexity assessment: low, medium, high
  complexity: 'low' | 'medium' | 'high';
  // Scope analysis: what areas of the codebase are affected
  scopeAnalysis: string;
  // Estimated number of files to be changed
  estimatedFileCount: number;
  // Ambiguity level in the task description
  ambiguityLevel: 'low' | 'medium' | 'high';
  // Estimated number of changes (lines, components, etc.)
  estimatedChanges: string;
  // Whether the task is recommended to be broken into subtasks
  recommendsSubtasks: boolean;
  // Reasoning for the recommendation
  reasoning: string;
  // Timestamp of analysis
  analyzedAt: string;
}

/**
 * Zod schema for triage analysis result
 */
export const TriageAnalysisResultSchema = z.object({
  complexity: z.enum(['low', 'medium', 'high']),
  scopeAnalysis: z.string(),
  estimatedFileCount: z.number().int().min(0),
  ambiguityLevel: z.enum(['low', 'medium', 'high']),
  estimatedChanges: z.string(),
  recommendsSubtasks: z.boolean(),
  reasoning: z.string(),
  analyzedAt: z.string().datetime(),
});

/**
 * Planning loop outcome types
 */
export const PLANNING_OUTCOMES = ['updated_plan', 'questions', 'ready', 'error'] as const;
export type PlanningOutcome = (typeof PLANNING_OUTCOMES)[number];

/**
 * A question generated during planning that needs user input
 */
export interface PlanningQuestion {
  id: string;
  question: string;
  context?: string;
  options?: string[];
  answer?: string;
  answeredAt?: string;
}

/**
 * Zod schema for planning question
 */
export const PlanningQuestionSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  context: z.string().optional(),
  options: z.array(z.string()).optional(),
  answer: z.string().optional(),
  answeredAt: z.string().datetime().optional(),
});

/**
 * Single iteration record in the planning loop
 */
export interface PlanningIteration {
  iteration: number;
  outcome: PlanningOutcome;
  planContent?: string;
  questions?: PlanningQuestion[];
  summary?: string;
  executionTimeMs: number;
  completedAt: string;
  jobId?: string;
  error?: string;
}

/**
 * Zod schema for planning iteration
 */
export const PlanningIterationSchema = z.object({
  iteration: z.number().int().min(1),
  outcome: z.enum(PLANNING_OUTCOMES),
  planContent: z.string().optional(),
  questions: z.array(PlanningQuestionSchema).optional(),
  summary: z.string().optional(),
  executionTimeMs: z.number().int().min(0),
  completedAt: z.string().datetime(),
  jobId: z.string().optional(),
  error: z.string().optional(),
});

/**
 * A generated story preview from planning output (not yet saved as a task)
 */
export interface GeneratedStoryPreview {
  /** Temporary ID for the preview (not a real task ID) */
  tempId: string;
  /** Story title (e.g., "US-001: Create user login form") */
  title: string;
  /** User story format: "As a... I want... so that..." */
  userStory: string;
  /** Acceptance criteria array */
  acceptanceCriteria: string[];
  /** Order in the feature (1-based index) */
  order: number;
}

/**
 * Zod schema for generated story preview
 */
export const GeneratedStoryPreviewSchema = z.object({
  tempId: z.string().min(1),
  title: z.string().min(1),
  userStory: z.string().min(1),
  acceptanceCriteria: z.array(z.string()),
  order: z.number().int().min(1),
});

/**
 * Planning state for a task
 */
export interface PlanningState {
  /** Current iteration count */
  currentIteration: number;
  /** History of all planning iterations */
  iterations: PlanningIteration[];
  /** Current pending questions awaiting user answers */
  pendingQuestions: PlanningQuestion[];
  /** Current plan content */
  currentPlan?: string;
  /** ID of the currently running planning job (if any) */
  activeJobId?: string;
  /** Generated stories awaiting user approval (for feature tasks) */
  generatedStories?: GeneratedStoryPreview[];
  /** User feedback for story revision (sent back to planning) */
  storyRevisionFeedback?: string;
  /** Last updated timestamp */
  lastUpdated: string;
}

/**
 * Zod schema for planning state
 */
export const PlanningStateSchema = z.object({
  currentIteration: z.number().int().min(0),
  iterations: z.array(PlanningIterationSchema),
  pendingQuestions: z.array(PlanningQuestionSchema),
  currentPlan: z.string().optional(),
  generatedStories: z.array(GeneratedStoryPreviewSchema).optional(),
  storyRevisionFeedback: z.string().optional(),
  activeJobId: z.string().optional(),
  lastUpdated: z.string().datetime(),
});

/**
 * Research gap categories
 */
export const RESEARCH_GAP_CATEGORIES = [
  'missing_story',
  'edge_case',
  'best_practice',
  'security',
  'accessibility',
  'vague_criteria',
  'error_handling',
] as const;
export type ResearchGapCategory = (typeof RESEARCH_GAP_CATEGORIES)[number];

/**
 * Research gap severity levels
 */
export const RESEARCH_GAP_SEVERITIES = ['low', 'medium', 'high'] as const;
export type ResearchGapSeverity = (typeof RESEARCH_GAP_SEVERITIES)[number];

/**
 * A gap identified during research review
 */
export interface ResearchGap {
  id: string;
  category: ResearchGapCategory;
  severity: ResearchGapSeverity;
  description: string;
  suggestedFix?: string;
  dismissed: boolean;
  dismissedAt?: string;
  dismissReason?: string;
}

/**
 * Zod schema for research gap
 */
export const ResearchGapSchema = z.object({
  id: z.string().min(1),
  category: z.enum(RESEARCH_GAP_CATEGORIES),
  severity: z.enum(RESEARCH_GAP_SEVERITIES),
  description: z.string().min(1),
  suggestedFix: z.string().optional(),
  dismissed: z.boolean().default(false),
  dismissedAt: z.string().datetime().optional(),
  dismissReason: z.string().optional(),
});

/**
 * Research review outcome types
 */
export const RESEARCH_OUTCOMES = ['approved', 'gaps_found', 'error'] as const;
export type ResearchOutcome = (typeof RESEARCH_OUTCOMES)[number];

/**
 * Single iteration record in the research loop
 */
export interface ResearchIteration {
  iteration: number;
  outcome: ResearchOutcome;
  gaps: ResearchGap[];
  reasoning?: string;
  executionTimeMs: number;
  completedAt: string;
  jobId?: string;
  error?: string;
}

/**
 * Zod schema for research iteration
 */
export const ResearchIterationSchema = z.object({
  iteration: z.number().int().min(1),
  outcome: z.enum(RESEARCH_OUTCOMES),
  gaps: z.array(ResearchGapSchema),
  reasoning: z.string().optional(),
  executionTimeMs: z.number().int().min(0),
  completedAt: z.string().datetime(),
  jobId: z.string().optional(),
  error: z.string().optional(),
});

/**
 * Research state for a task
 */
export interface ResearchState {
  /** Current iteration count */
  currentIteration: number;
  /** History of all research iterations */
  iterations: ResearchIteration[];
  /** Current pending gaps awaiting user review */
  pendingGaps: ResearchGap[];
  /** User's custom feedback (free-form input) */
  userFeedback?: string;
  /** ID of the currently running research job (if any) */
  activeJobId?: string;
  /** Last updated timestamp */
  lastUpdated: string;
}

/**
 * Zod schema for research state
 */
export const ResearchStateSchema = z.object({
  currentIteration: z.number().int().min(0),
  iterations: z.array(ResearchIterationSchema),
  pendingGaps: z.array(ResearchGapSchema),
  userFeedback: z.string().optional(),
  activeJobId: z.string().optional(),
  lastUpdated: z.string().datetime(),
});

// ============================================================================
// Generic Stage Execution Types
// ============================================================================

/**
 * Generic stage question (human-in-the-loop)
 */
export interface StageQuestion {
  id: string;
  question: string;
  context?: string;
  answer?: string;
  answeredAt?: string;
}

/**
 * Zod schema for stage question
 */
export const StageQuestionSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  context: z.string().optional(),
  answer: z.string().optional(),
  answeredAt: z.string().datetime().optional(),
});

/**
 * A single iteration of stage execution
 */
export interface StageIteration {
  iteration: number;
  output: string;
  questions?: StageQuestion[];
  executionTimeMs: number;
  completedAt: string;
  jobId?: string;
  error?: string;
}

/**
 * Zod schema for stage iteration
 */
export const StageIterationSchema = z.object({
  iteration: z.number().int().min(1),
  output: z.string(),
  questions: z.array(StageQuestionSchema).optional(),
  executionTimeMs: z.number().int().min(0),
  completedAt: z.string().datetime(),
  jobId: z.string().optional(),
  error: z.string().optional(),
});

/**
 * Full execution state for a stage
 */
export interface StageOutput {
  prompt: string;
  currentIteration: number;
  maxIterations: number;
  returnQuestions: boolean;
  iterations: StageIteration[];
  pendingQuestions: StageQuestion[];
  activeJobId?: string;
  /** Whether auto-loop is actively running iterations */
  autoLoopActive?: boolean;
  /** Reason the auto-loop stopped */
  completionReason?: 'complete' | 'max-iterations' | 'error' | 'questions' | 'cancelled';
  /** Canonical output read from .ralph/{stageName}.md after auto-loop iterations */
  fileOutput?: string;
  lastUpdated: string;
}

/**
 * Zod schema for stage output
 */
export const StageOutputSchema = z.object({
  prompt: z.string(),
  currentIteration: z.number().int().min(0),
  maxIterations: z.number().int().min(1),
  returnQuestions: z.boolean(),
  iterations: z.array(StageIterationSchema),
  pendingQuestions: z.array(StageQuestionSchema),
  activeJobId: z.string().optional(),
  autoLoopActive: z.boolean().optional(),
  completionReason: z
    .enum(['complete', 'max-iterations', 'error', 'questions', 'cancelled'])
    .optional(),
  fileOutput: z.string().optional(),
  lastUpdated: z.string().datetime(),
});

/**
 * @deprecated Task types removed. Parent/child determined by parentId/childIds.
 * Kept as string for backward compatibility with existing data.
 */

// Zod schema for Ralph task validation
export const RalphTaskSchema = z.object({
  id: z.string().min(1, 'Task ID is required'),
  title: z.string().min(1, 'Task title is required'),
  workspaceId: z.string().min(1, 'Workspace ID is required'),
  description: z.string().nullable().optional(),
  // @deprecated - kept for backward compat with old data (renamed to description)
  prompt: z.string().nullable().optional(),
  instructions: z.string().nullable().optional(),
  filePaths: z.array(z.string()).default([]),
  // @deprecated - removed from UI; kept for backward compat with old data
  constraints: z.string().nullable().optional(),
  // @deprecated - removed from UI; kept for backward compat with old data
  expectedOutcomes: z.string().nullable().optional(),
  // User story format: "As a... I want... so that..."
  userStory: z.string().nullable().optional(),
  // Acceptance criteria array
  acceptanceCriteria: z.array(z.string()).default([]),
  // Subtask order within parent (1-based index)
  subtaskOrder: z.number().int().min(1).nullable().optional(),
  // @deprecated - kept for backward compat with old data
  storyOrder: z.number().int().min(1).nullable().optional(),
  baseBranch: z.string().nullable().optional(),
  featureBranch: z.string().nullable().optional(),
  prTargetBranch: z.string().nullable().optional(),
  // Delivery method: 'merge-request' (create feature branch + PR) or 'direct-commit' (commit to target branch)
  deliveryMethod: z.enum(['merge-request', 'direct-commit']).default('merge-request'),
  // URL of the created PR/MR (populated on task completion)
  prUrl: z.string().nullable().optional(),
  // Job ID for the currently executing job (populated when task enters executing state)
  executionJobId: z.string().nullable().optional(),
  // Error message from execution (populated if execution fails)
  executionError: z.string().nullable().optional(),
  status: z.string().min(1).default('draft'),
  // @deprecated - kept for backward compat, ignored going forward
  taskType: z.string().optional(),
  parentId: z.string().nullable().optional(),
  childIds: z.array(z.string()).default([]),
  // Task IDs that must be completed before this task can execute
  blockedBy: z.array(z.string()).default([]),
  // Triage analysis result - populated when task enters triage
  triageAnalysis: TriageAnalysisResultSchema.nullable().optional(),
  // Planning state - populated when task enters planning
  planningState: PlanningStateSchema.nullable().optional(),
  // Research state - populated when task enters research
  researchState: ResearchStateSchema.nullable().optional(),
  // Timestamp when task was completed (populated when task enters complete state)
  completedAt: z.string().datetime().nullable().optional(),
  // Generic stage execution outputs keyed by stage name
  stageOutputs: z.record(z.string(), StageOutputSchema).default({}),
  // Whether the task has been moved to archive view
  isArchived: z.boolean().default(false),
  // Sequential human-readable task number (RLP-N)
  taskNumber: z.number().int().min(1).nullable().optional(),
  // Project ID (optional bucketing/grouping)
  projectId: z.string().nullable().optional(),
  // Playbook ID (named stage subset)
  playbookId: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// TypeScript type derived from Zod schema
export type RalphTask = z.infer<typeof RalphTaskSchema>;

// Input type for creating a new task (some fields auto-generated)
export type CreateRalphTaskInput = Omit<
  RalphTask,
  | 'id'
  | 'createdAt'
  | 'updatedAt'
  | 'childIds'
  | 'isArchived'
  | 'completedAt'
  | 'acceptanceCriteria'
  | 'blockedBy'
  | 'stageOutputs'
> & {
  childIds?: string[];
  isArchived?: boolean;
  completedAt?: string | null;
  acceptanceCriteria?: string[];
  blockedBy?: string[];
  stageOutputs?: Record<string, z.infer<typeof StageOutputSchema>>;
};

// Input type for updating a task
export type UpdateRalphTaskInput = Partial<Omit<RalphTask, 'id' | 'createdAt'>>;

// Task index entry (summary data for listing)
export interface RalphTaskIndexEntry {
  id: string;
  title: string;
  workspaceId: string;
  status: string;
  isSubtask: boolean;
  parentId: string | null;
  childCount: number;
  subtaskOrder: number | null;
  taskNumber: number | null;
  projectId: string | null;
  playbookId: string | null;
  isArchived: boolean;
  // Count of tasks that must be completed before this one (for blocking indicator)
  blockedByCount: number;
  updatedAt: string;
}

/**
 * Generate a unique task ID
 */
function generateTaskId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `ralph-${timestamp}-${random}`;
}

/**
 * Initialize the Ralph task manager (opens SQLite, runs migration if needed)
 */
export async function initializeRalphTaskManager(): Promise<AsyncResult<void>> {
  console.log('[RALPH TASK MANAGER] Starting initialization');

  try {
    // getDb() lazily creates schema + migrates from JSON on first call
    getDb();

    const entries = dbGetAllIndexEntries();
    console.log('[RALPH TASK MANAGER] DB initialized, task count:', entries.length);

    return { success: true, data: undefined };
  } catch (error) {
    console.error('[RALPH TASK MANAGER] Initialization error:', error);
    return {
      success: false,
      error: new Error(`Failed to initialize Ralph task manager: ${error}`),
    };
  }
}

/**
 * Create a new Ralph task
 */
export async function createRalphTask(
  input: CreateRalphTaskInput
): Promise<AsyncResult<RalphTask>> {
  console.log('[RALPH TASK MANAGER] Creating new task:', input.title);

  try {
    const now = new Date().toISOString();
    const taskNumber = dbNextTaskNumber();
    const taskData = {
      ...input,
      id: generateTaskId(),
      taskNumber,
      childIds: input.childIds ?? [],
      blockedBy: input.blockedBy ?? [],
      createdAt: now,
      updatedAt: now,
    };

    // Validate with Zod
    const parseResult = RalphTaskSchema.safeParse(taskData);
    if (!parseResult.success) {
      console.error('[RALPH TASK MANAGER] Validation failed:', parseResult.error.flatten());
      return {
        success: false,
        error: new Error(`Task validation failed: ${parseResult.error.message}`),
      };
    }

    const task = parseResult.data;

    // Insert into database
    dbInsertTask(task);

    console.log('[RALPH TASK MANAGER] Task created:', task.id);
    return { success: true, data: task };
  } catch (error) {
    console.error('[RALPH TASK MANAGER] Error creating task:', error);
    return {
      success: false,
      error: new Error(`Failed to create task: ${error}`),
    };
  }
}

/**
 * Get a Ralph task by ID
 */
export async function getRalphTask(taskId: string): Promise<AsyncResult<RalphTask>> {
  try {
    const task = dbGetTask(taskId);
    if (!task) {
      return {
        success: false,
        error: new Error(`Task ${taskId} not found`),
      };
    }

    return { success: true, data: task };
  } catch (error) {
    console.error('[RALPH TASK MANAGER] Error getting task:', error);
    return {
      success: false,
      error: new Error(`Failed to get task: ${error}`),
    };
  }
}

/**
 * Update a Ralph task
 */
export async function updateRalphTask(
  taskId: string,
  updates: UpdateRalphTaskInput
): Promise<AsyncResult<RalphTask>> {
  try {
    const existingTask = dbGetTask(taskId);
    if (!existingTask) {
      return {
        success: false,
        error: new Error(`Task ${taskId} not found`),
      };
    }

    const updatedTask = {
      ...existingTask,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    // Validate with Zod
    const parseResult = RalphTaskSchema.safeParse(updatedTask);
    if (!parseResult.success) {
      console.error('[RALPH TASK MANAGER] Validation failed:', parseResult.error.flatten());
      return {
        success: false,
        error: new Error(`Task validation failed: ${parseResult.error.message}`),
      };
    }

    const task = parseResult.data;

    // Update in database
    dbUpdateTask(task);

    return { success: true, data: task };
  } catch (error) {
    console.error('[RALPH TASK MANAGER] Error updating task:', error);
    return {
      success: false,
      error: new Error(`Failed to update task: ${error}`),
    };
  }
}

/**
 * Transition a Ralph task to a new status.
 * Free movement — no transition graph validation.
 */
export async function transitionRalphTask(
  taskId: string,
  toStatus: RalphTaskStatus,
  reason?: string,
  preloadedTask?: RalphTask
): Promise<AsyncResult<RalphTask>> {
  console.log('[RALPH TASK MANAGER] Transitioning task:', taskId, 'to', toStatus);

  try {
    // Use preloaded task or load from database
    let existingTask: RalphTask;
    if (preloadedTask) {
      existingTask = preloadedTask;
    } else {
      const loaded = dbGetTask(taskId);
      if (!loaded) {
        return {
          success: false,
          error: new Error(`Task ${taskId} not found`),
        };
      }
      existingTask = loaded;
    }

    const fromStatus = existingTask.status;

    // Same status — no-op
    if (fromStatus === toStatus) {
      return { success: true, data: existingTask };
    }

    // Build updates
    const updates: UpdateRalphTaskInput = { status: toStatus };

    // If moving to complete, set completedAt
    if (toStatus === 'complete' && !existingTask.completedAt) {
      updates.completedAt = new Date().toISOString();
    }

    // Clear completedAt when moving away from complete
    if (fromStatus === 'complete' && toStatus !== 'complete') {
      updates.completedAt = null;
    }

    // Clear execution state when transitioning
    updates.executionJobId = null;
    updates.executionError = null;

    return await updateRalphTask(taskId, updates);
  } catch (error) {
    console.error('[RALPH TASK MANAGER] Error transitioning task:', error);
    return {
      success: false,
      error: new Error(`Failed to transition task: ${error}`),
    };
  }
}

/**
 * @deprecated Free movement eliminates the concept of non-standard transitions.
 */
export interface ManualOverrideInfo {
  isNonStandard: boolean;
  skippedSteps?: string;
  warning?: string;
}

/**
 * @deprecated Free movement — all transitions are valid. Returns isNonStandard: false always.
 */
export function getManualOverrideInfo(
  _fromStatus: RalphTaskStatus,
  _toStatus: RalphTaskStatus
): ManualOverrideInfo {
  return { isNonStandard: false };
}

/**
 * Force transition a Ralph task to any status (manual override)
 * This bypasses the normal state machine validation and always requires a reason.
 * Records the override in the audit trail with full context.
 */
export async function forceTransitionRalphTask(
  taskId: string,
  toStatus: RalphTaskStatus,
  reason: string
): Promise<AsyncResult<RalphTask>> {
  console.log('[RALPH TASK MANAGER] Force transitioning task:', taskId, 'to', toStatus);

  if (!reason || reason.trim().length === 0) {
    return {
      success: false,
      error: new Error('Reason is required for manual status override'),
    };
  }

  try {
    const existingTask = dbGetTask(taskId);
    if (!existingTask) {
      return {
        success: false,
        error: new Error(`Task ${taskId} not found`),
      };
    }
    const fromStatus = existingTask.status;

    // Same status - no-op
    if (fromStatus === toStatus) {
      return { success: true, data: existingTask };
    }

    // Handle special state changes
    const updates: UpdateRalphTaskInput = {
      status: toStatus,
    };

    // If moving to complete, set completedAt
    if (toStatus === 'complete' && !existingTask.completedAt) {
      updates.completedAt = new Date().toISOString();
    }

    // If moving away from complete, clear completedAt
    if (fromStatus === 'complete' && toStatus !== 'complete') {
      updates.completedAt = null;
    }

    // Clear execution state when transitioning
    updates.executionJobId = null;
    updates.executionError = null;

    return await updateRalphTask(taskId, updates);
  } catch (error) {
    console.error('[RALPH TASK MANAGER] Error force transitioning task:', error);
    return {
      success: false,
      error: new Error(`Failed to force transition task: ${error}`),
    };
  }
}

/**
 * Delete a Ralph task
 */
export async function deleteRalphTask(taskId: string): Promise<AsyncResult<void>> {
  console.log('[RALPH TASK MANAGER] Deleting task:', taskId);

  try {
    if (!dbTaskExists(taskId)) {
      return {
        success: false,
        error: new Error(`Task ${taskId} not found`),
      };
    }

    dbDeleteTask(taskId);

    console.log('[RALPH TASK MANAGER] Task deleted:', taskId);
    return { success: true, data: undefined };
  } catch (error) {
    console.error('[RALPH TASK MANAGER] Error deleting task:', error);
    return {
      success: false,
      error: new Error(`Failed to delete task: ${error}`),
    };
  }
}

/**
 * Get all Ralph tasks (index entries)
 */
export async function getAllRalphTasks(): Promise<AsyncResult<RalphTaskIndexEntry[]>> {
  try {
    const tasks = dbGetAllIndexEntries();
    return { success: true, data: tasks };
  } catch (error) {
    console.error('[RALPH TASK MANAGER] Error getting all tasks:', error);
    return {
      success: false,
      error: new Error(`Failed to get all tasks: ${error}`),
    };
  }
}

/**
 * Delete all Ralph tasks for a given workspace
 */
export async function deleteRalphTasksByWorkspace(
  workspaceId: WorkspaceId
): Promise<AsyncResult<{ deletedCount: number }>> {
  console.log('[RALPH TASK MANAGER] Deleting tasks for workspace:', workspaceId);

  try {
    const deletedCount = dbDeleteByWorkspace(workspaceId);

    console.log('[RALPH TASK MANAGER] Deleted', deletedCount, 'tasks for workspace:', workspaceId);
    return { success: true, data: { deletedCount } };
  } catch (error) {
    console.error('[RALPH TASK MANAGER] Error deleting tasks by workspace:', error);
    return {
      success: false,
      error: new Error(`Failed to delete tasks by workspace: ${error}`),
    };
  }
}

/**
 * Get Ralph tasks filtered by workspace
 */
export async function getRalphTasksByWorkspace(
  workspaceId: WorkspaceId
): Promise<AsyncResult<RalphTaskIndexEntry[]>> {
  console.log('[RALPH TASK MANAGER] Getting tasks for workspace:', workspaceId);

  try {
    const allTasksResult = await getAllRalphTasks();
    if (!allTasksResult.success) {
      return allTasksResult;
    }

    const tasks = allTasksResult.data.filter((task) => task.workspaceId === workspaceId);

    console.log('[RALPH TASK MANAGER] Returning', tasks.length, 'tasks for workspace');
    return { success: true, data: tasks };
  } catch (error) {
    console.error('[RALPH TASK MANAGER] Error getting tasks by workspace:', error);
    return {
      success: false,
      error: new Error(`Failed to get tasks by workspace: ${error}`),
    };
  }
}

/**
 * Get Ralph tasks filtered by status
 */
export async function getRalphTasksByStatus(
  status: string
): Promise<AsyncResult<RalphTaskIndexEntry[]>> {
  console.log('[RALPH TASK MANAGER] Getting tasks with status:', status);

  try {
    const allTasksResult = await getAllRalphTasks();
    if (!allTasksResult.success) {
      return allTasksResult;
    }

    const tasks = allTasksResult.data.filter((task) => task.status === status);

    console.log('[RALPH TASK MANAGER] Returning', tasks.length, 'tasks with status', status);
    return { success: true, data: tasks };
  } catch (error) {
    console.error('[RALPH TASK MANAGER] Error getting tasks by status:', error);
    return {
      success: false,
      error: new Error(`Failed to get tasks by status: ${error}`),
    };
  }
}

/**
 * Get child tasks for a parent task
 */
export async function getChildRalphTasks(
  parentId: string
): Promise<AsyncResult<RalphTaskIndexEntry[]>> {
  try {
    const children = dbGetChildTasks(parentId);
    const entries: RalphTaskIndexEntry[] = children.map((task) => ({
      id: task.id,
      title: task.title,
      workspaceId: task.workspaceId,
      status: task.status,
      isSubtask: task.parentId != null,
      parentId: task.parentId ?? null,
      childCount: dbGetChildCount(task.id),
      subtaskOrder: task.subtaskOrder ?? task.storyOrder ?? null,
      taskNumber: task.taskNumber ?? null,
      projectId: task.projectId ?? null,
      playbookId: task.playbookId ?? null,
      isArchived: task.isArchived ?? false,
      blockedByCount: task.blockedBy.length,
      updatedAt: task.updatedAt,
    }));

    return { success: true, data: entries };
  } catch (error) {
    console.error('[RALPH TASK MANAGER] Error getting child tasks:', error);
    return {
      success: false,
      error: new Error(`Failed to get child tasks: ${error}`),
    };
  }
}

/**
 * Add a child task to a parent
 */
export async function addChildToRalphTask(
  parentId: string,
  childId: string
): Promise<AsyncResult<RalphTask>> {
  console.log('[RALPH TASK MANAGER] Adding child', childId, 'to parent', parentId);

  try {
    const parentResult = await getRalphTask(parentId);
    if (!parentResult.success) {
      return parentResult;
    }

    const parent = parentResult.data;
    if (!parent.childIds.includes(childId)) {
      parent.childIds.push(childId);
    }

    return await updateRalphTask(parentId, { childIds: parent.childIds });
  } catch (error) {
    console.error('[RALPH TASK MANAGER] Error adding child task:', error);
    return {
      success: false,
      error: new Error(`Failed to add child task: ${error}`),
    };
  }
}

/**
 * Input type for creating a subtask
 */
export interface CreateSubtaskInput {
  title: string;
  description?: string;
  subtaskOrder?: number;
}

/**
 * @deprecated Use CreateSubtaskInput instead
 */
export type CreateChildStoryInput = CreateSubtaskInput;

/**
 * Create a subtask that inherits workspaceId and branch config from parent
 * Automatically updates parent's childIds
 */
export async function createSubtask(
  parentId: string,
  subtaskInput: CreateSubtaskInput
): Promise<AsyncResult<RalphTask>> {
  console.log('[RALPH TASK MANAGER] Creating subtask for parent:', parentId, subtaskInput.title);

  try {
    // Load parent task
    const parentResult = await getRalphTask(parentId);
    if (!parentResult.success) {
      return parentResult;
    }

    const parent = parentResult.data;

    // Determine subtask order (next in sequence if not provided)
    const subtaskOrder = subtaskInput.subtaskOrder ?? parent.childIds.length + 1;

    // Create subtask inheriting from parent
    const childInput: CreateRalphTaskInput = {
      title: subtaskInput.title,
      workspaceId: parent.workspaceId,
      userStory: null,
      acceptanceCriteria: [],
      instructions: null,
      description: subtaskInput.description ?? null,
      filePaths: [],
      subtaskOrder,
      // Inherit branch configuration from parent
      baseBranch: parent.baseBranch,
      featureBranch: parent.featureBranch,
      prTargetBranch: parent.prTargetBranch,
      deliveryMethod: parent.deliveryMethod,
      // Inherit project and playbook from parent
      projectId: parent.projectId,
      playbookId: parent.playbookId,
      parentId: parent.id,
      status: 'draft',
    };

    // Create the child task
    const childResult = await createRalphTask(childInput);
    if (!childResult.success) {
      return childResult;
    }

    const child = childResult.data;

    // Update parent to include new child
    const updateResult = await addChildToRalphTask(parent.id, child.id);
    if (!updateResult.success) {
      // Cleanup: delete the orphaned child task
      await deleteRalphTask(child.id);
      return {
        success: false,
        error: new Error(`Failed to link child to parent: ${updateResult.error?.message}`),
      };
    }

    console.log('[RALPH TASK MANAGER] Subtask created:', child.id);
    return { success: true, data: child };
  } catch (error) {
    console.error('[RALPH TASK MANAGER] Error creating subtask:', error);
    return {
      success: false,
      error: new Error(`Failed to create subtask: ${error}`),
    };
  }
}

/**
 * @deprecated Use createSubtask instead
 */
export const createChildStoryTask = createSubtask;

/**
 * Get the child count and completion progress for a feature task
 */
export async function getFeatureProgress(
  featureId: string
): Promise<AsyncResult<{ total: number; completed: number; inProgress: number; pending: number }>> {
  console.log('[RALPH TASK MANAGER] Getting feature progress:', featureId);

  try {
    const childrenResult = await getChildRalphTasks(featureId);
    if (!childrenResult.success) {
      return {
        success: false,
        error: childrenResult.error,
      };
    }

    const children = childrenResult.data;
    const progress = {
      total: children.length,
      completed: children.filter((c) => c.status === 'complete').length,
      inProgress: children.filter((c) => c.status === 'executing').length,
      pending: children.filter((c) => c.status !== 'complete' && c.status !== 'executing').length,
    };

    return { success: true, data: progress };
  } catch (error) {
    console.error('[RALPH TASK MANAGER] Error getting feature progress:', error);
    return {
      success: false,
      error: new Error(`Failed to get feature progress: ${error}`),
    };
  }
}

/**
 * Reorder child stories within a feature
 */
export async function reorderChildStories(
  parentId: string,
  orderedChildIds: string[]
): Promise<AsyncResult<RalphTask>> {
  console.log('[RALPH TASK MANAGER] Reordering children for parent:', parentId);

  try {
    const parentResult = await getRalphTask(parentId);
    if (!parentResult.success) {
      return parentResult;
    }

    const parent = parentResult.data;

    // Validate all children belong to this parent
    const currentChildSet = new Set(parent.childIds);
    const newChildSet = new Set(orderedChildIds);

    if (currentChildSet.size !== newChildSet.size) {
      return {
        success: false,
        error: new Error('Ordered child list must contain exactly the same children'),
      };
    }

    for (const childId of orderedChildIds) {
      if (!currentChildSet.has(childId)) {
        return {
          success: false,
          error: new Error(`Child ${childId} does not belong to parent ${parentId}`),
        };
      }
    }

    // Update parent with new order
    const updateResult = await updateRalphTask(parentId, { childIds: orderedChildIds });
    if (!updateResult.success) {
      return updateResult;
    }

    // Update subtaskOrder on each child
    for (let i = 0; i < orderedChildIds.length; i++) {
      const childId = orderedChildIds[i];
      if (childId) {
        await updateRalphTask(childId, { subtaskOrder: i + 1 });
      }
    }

    return updateResult;
  } catch (error) {
    console.error('[RALPH TASK MANAGER] Error reordering children:', error);
    return {
      success: false,
      error: new Error(`Failed to reorder children: ${error}`),
    };
  }
}

/**
 * Dependency information for a task
 */
export interface TaskDependencyInfo {
  /** IDs of tasks that block this task */
  blockedBy: string[];
  /** IDs of tasks that have been completed (no longer blocking) */
  resolvedBlockers: string[];
  /** IDs of tasks still blocking this task */
  activeBlockers: string[];
  /** Whether all blockers have been completed */
  isBlocked: boolean;
  /** IDs of tasks that this task blocks */
  blocks: string[];
}

/**
 * Helper function for DFS-based circular dependency detection
 */
async function dfsDetectCycle(
  currentId: string,
  isRoot: boolean,
  newBlockers: string[],
  visited: Set<string>,
  recursionStack: Set<string>,
  path: string[]
): Promise<{ hasCircle: boolean; path?: string[] }> {
  visited.add(currentId);
  recursionStack.add(currentId);
  path.push(currentId);

  // Get blockers for current task
  let blockers: string[];
  if (isRoot) {
    // For the root task, use the new blockers we're trying to add
    blockers = newBlockers;
  } else {
    // For other tasks, get existing blockers from the task data
    const taskResult = await getRalphTask(currentId);
    if (!taskResult.success) {
      // If task doesn't exist, no blockers
      blockers = [];
    } else {
      blockers = taskResult.data.blockedBy;
    }
  }

  for (const blockerId of blockers) {
    // If this blocker is in the recursion stack, we found a cycle
    if (recursionStack.has(blockerId)) {
      path.push(blockerId);
      return { hasCircle: true, path: [...path] };
    }

    // If not visited, continue DFS
    if (!visited.has(blockerId)) {
      const result = await dfsDetectCycle(
        blockerId,
        false,
        newBlockers,
        visited,
        recursionStack,
        path
      );
      if (result.hasCircle) {
        return result;
      }
    }
  }

  path.pop();
  recursionStack.delete(currentId);
  return { hasCircle: false };
}

/**
 * Detect circular dependencies in a task dependency chain
 * Uses DFS to find cycles in the blockedBy graph
 */
export async function detectCircularDependency(
  taskId: string,
  newBlockers: string[]
): Promise<AsyncResult<{ hasCircle: boolean; path?: string[] }>> {
  console.log('[RALPH TASK MANAGER] Checking circular dependencies for:', taskId);

  try {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const path: string[] = [];

    const result = await dfsDetectCycle(taskId, true, newBlockers, visited, recursionStack, path);
    return { success: true, data: result };
  } catch (error) {
    console.error('[RALPH TASK MANAGER] Error detecting circular dependency:', error);
    return {
      success: false,
      error: new Error(`Failed to detect circular dependency: ${error}`),
    };
  }
}

/**
 * Update the blockedBy list for a task
 * Validates that the new blockers don't create a circular dependency
 */
export async function updateTaskDependencies(
  taskId: string,
  blockedBy: string[]
): Promise<AsyncResult<RalphTask>> {
  console.log('[RALPH TASK MANAGER] Updating dependencies for:', taskId, 'blocked by:', blockedBy);

  try {
    // Validate task exists
    const taskResult = await getRalphTask(taskId);
    if (!taskResult.success) {
      return taskResult;
    }

    const task = taskResult.data;

    // Cannot add dependencies to a completed task
    if (task.status === 'complete') {
      return {
        success: false,
        error: new Error('Cannot modify dependencies of a completed task'),
      };
    }

    // Validate all blockers exist and are in the same parent (for story tasks)
    for (const blockerId of blockedBy) {
      const blockerResult = await getRalphTask(blockerId);
      if (!blockerResult.success) {
        return {
          success: false,
          error: new Error(`Blocker task ${blockerId} not found`),
        };
      }

      // For story tasks, dependencies must be siblings (same parent)
      if (task.parentId && blockerResult.data.parentId !== task.parentId) {
        return {
          success: false,
          error: new Error(`Dependency ${blockerId} must be a sibling story (same parent feature)`),
        };
      }
    }

    // Check for circular dependencies
    const circularCheck = await detectCircularDependency(taskId, blockedBy);
    if (!circularCheck.success) {
      return {
        success: false,
        error: circularCheck.error,
      };
    }

    if (circularCheck.data.hasCircle) {
      const cyclePath = circularCheck.data.path?.join(' -> ') || 'unknown';
      return {
        success: false,
        error: new Error(`Circular dependency detected: ${cyclePath}`),
      };
    }

    // Update the task with new dependencies
    return await updateRalphTask(taskId, { blockedBy });
  } catch (error) {
    console.error('[RALPH TASK MANAGER] Error updating dependencies:', error);
    return {
      success: false,
      error: new Error(`Failed to update dependencies: ${error}`),
    };
  }
}

/**
 * Get dependency information for a task
 * Resolves which blockers are still active (not complete) and which tasks this blocks
 */
export async function getTaskDependencyInfo(
  taskId: string
): Promise<AsyncResult<TaskDependencyInfo>> {
  console.log('[RALPH TASK MANAGER] Getting dependency info for:', taskId);

  try {
    const taskResult = await getRalphTask(taskId);
    if (!taskResult.success) {
      return { success: false, error: taskResult.error };
    }

    const task = taskResult.data;
    const blockedBy = task.blockedBy;
    const resolvedBlockers: string[] = [];
    const activeBlockers: string[] = [];

    // Check status of each blocker
    for (const blockerId of blockedBy) {
      const blockerResult = await getRalphTask(blockerId);
      if (blockerResult.success && blockerResult.data.status === 'complete') {
        resolvedBlockers.push(blockerId);
      } else {
        activeBlockers.push(blockerId);
      }
    }

    // Find tasks that this task blocks (reverse lookup)
    const allTasksResult = await getAllRalphTasks();
    const blocks: string[] = [];
    if (allTasksResult.success) {
      for (const indexEntry of allTasksResult.data) {
        if (indexEntry.blockedByCount > 0) {
          const otherTaskResult = await getRalphTask(indexEntry.id);
          if (otherTaskResult.success && otherTaskResult.data.blockedBy.includes(taskId)) {
            blocks.push(indexEntry.id);
          }
        }
      }
    }

    return {
      success: true,
      data: {
        blockedBy,
        resolvedBlockers,
        activeBlockers,
        isBlocked: activeBlockers.length > 0,
        blocks,
      },
    };
  } catch (error) {
    console.error('[RALPH TASK MANAGER] Error getting dependency info:', error);
    return {
      success: false,
      error: new Error(`Failed to get dependency info: ${error}`),
    };
  }
}

/**
 * Get dependency graph for a feature task's children
 * Returns a map of task IDs to their blockers and what they block
 */
export async function getFeatureDependencyGraph(
  featureId: string
): Promise<AsyncResult<Record<string, { blockedBy: string[]; blocks: string[] }>>> {
  console.log('[RALPH TASK MANAGER] Getting dependency graph for feature:', featureId);

  try {
    const featureResult = await getRalphTask(featureId);
    if (!featureResult.success) {
      return { success: false, error: featureResult.error };
    }

    const feature = featureResult.data;
    if (feature.childIds.length === 0) {
      return {
        success: false,
        error: new Error('Task has no children'),
      };
    }

    const graph: Record<string, { blockedBy: string[]; blocks: string[] }> = {};

    // Initialize graph with all children
    for (const childId of feature.childIds) {
      graph[childId] = { blockedBy: [], blocks: [] };
    }

    // Populate blockedBy for each child
    for (const childId of feature.childIds) {
      const childResult = await getRalphTask(childId);
      if (childResult.success) {
        // Only include blockers that are siblings (in the same feature)
        const siblingBlockers = childResult.data.blockedBy.filter((blockerId) =>
          feature.childIds.includes(blockerId)
        );
        const existingEntry = graph[childId];
        if (existingEntry) {
          existingEntry.blockedBy = siblingBlockers;

          // Update the blocks array for each blocker
          for (const blockerId of siblingBlockers) {
            const blockerEntry = graph[blockerId];
            if (blockerEntry) {
              blockerEntry.blocks.push(childId);
            }
          }
        }
      }
    }

    return { success: true, data: graph };
  } catch (error) {
    console.error('[RALPH TASK MANAGER] Error getting feature dependency graph:', error);
    return {
      success: false,
      error: new Error(`Failed to get feature dependency graph: ${error}`),
    };
  }
}

/**
 * Check if a task can be executed (not blocked by incomplete tasks)
 */
export async function canTaskExecute(taskId: string): Promise<AsyncResult<boolean>> {
  const depInfo = await getTaskDependencyInfo(taskId);
  if (!depInfo.success) {
    return { success: false, error: depInfo.error };
  }

  return { success: true, data: !depInfo.data.isBlocked };
}

/**
 * Get Ralph task manager statistics
 */
export async function getRalphTaskStats(): Promise<
  AsyncResult<{
    total: number;
    byStatus: Record<RalphTaskStatus, number>;
    topLevel: number;
    subtasks: number;
  }>
> {
  console.log('[RALPH TASK MANAGER] Getting task statistics');

  try {
    const tasks = dbGetAllIndexEntries();
    const byStatus: Record<string, number> = {
      draft: 0,
      triage: 0,
      planning: 0,
      research: 0,
      ready: 0,
      executing: 0,
      complete: 0,
    };
    let topLevel = 0;
    let subtasks = 0;

    for (const task of tasks) {
      byStatus[task.status] = (byStatus[task.status] ?? 0) + 1;
      if (task.isSubtask) {
        subtasks++;
      } else {
        topLevel++;
      }
    }

    return {
      success: true,
      data: {
        total: tasks.length,
        byStatus,
        topLevel,
        subtasks,
      },
    };
  } catch (error) {
    console.error('[RALPH TASK MANAGER] Error getting stats:', error);
    return {
      success: false,
      error: new Error(`Failed to get task stats: ${error}`),
    };
  }
}

/**
 * Rebuild the task index (no-op with SQLite — index is always consistent).
 * Kept for backward compat; returns the current task count.
 */
export async function rebuildRalphTaskIndex(): Promise<AsyncResult<number>> {
  console.log('[RALPH TASK MANAGER] Rebuild requested (no-op with SQLite)');

  try {
    const entries = dbGetAllIndexEntries();
    console.log('[RALPH TASK MANAGER] Current task count:', entries.length);
    return { success: true, data: entries.length };
  } catch (error) {
    console.error('[RALPH TASK MANAGER] Error rebuilding index:', error);
    return {
      success: false,
      error: new Error(`Failed to rebuild index: ${error}`),
    };
  }
}

/**
 * Archive a completed task
 */
export async function archiveRalphTask(taskId: string): Promise<AsyncResult<RalphTask>> {
  console.log('[RALPH TASK MANAGER] Archiving task:', taskId);

  try {
    const taskResult = await getRalphTask(taskId);
    if (!taskResult.success) {
      return taskResult;
    }

    const task = taskResult.data;

    if (task.status !== 'complete') {
      return {
        success: false,
        error: new Error('Only completed tasks can be archived'),
      };
    }

    return await updateRalphTask(taskId, { isArchived: true });
  } catch (error) {
    console.error('[RALPH TASK MANAGER] Error archiving task:', error);
    return {
      success: false,
      error: new Error(`Failed to archive task: ${error}`),
    };
  }
}

/**
 * Unarchive a task
 */
export async function unarchiveRalphTask(taskId: string): Promise<AsyncResult<RalphTask>> {
  console.log('[RALPH TASK MANAGER] Unarchiving task:', taskId);

  try {
    return await updateRalphTask(taskId, { isArchived: false });
  } catch (error) {
    console.error('[RALPH TASK MANAGER] Error unarchiving task:', error);
    return {
      success: false,
      error: new Error(`Failed to unarchive task: ${error}`),
    };
  }
}

/**
 * Clone a task as a new draft task (template functionality)
 * Creates a copy with reset status and timestamps
 * Note: Story tasks are cloned as simple tasks without parent reference
 */
export async function cloneRalphTask(taskId: string): Promise<AsyncResult<RalphTask>> {
  console.log('[RALPH TASK MANAGER] Cloning task:', taskId);

  try {
    const taskResult = await getRalphTask(taskId);
    if (!taskResult.success) {
      return taskResult;
    }

    const sourceTask = taskResult.data;

    // Create a new task with copied fields but reset state
    const cloneInput: CreateRalphTaskInput = {
      title: `${sourceTask.title} (Copy)`,
      workspaceId: sourceTask.workspaceId,
      description: sourceTask.description,
      instructions: sourceTask.instructions,
      filePaths: [...sourceTask.filePaths],
      constraints: sourceTask.constraints,
      expectedOutcomes: sourceTask.expectedOutcomes,
      userStory: sourceTask.userStory,
      acceptanceCriteria: [...sourceTask.acceptanceCriteria],
      baseBranch: sourceTask.baseBranch,
      featureBranch: null, // Reset feature branch - new one will be created
      prTargetBranch: sourceTask.prTargetBranch,
      deliveryMethod: sourceTask.deliveryMethod,
      status: 'draft',
      // Clone as top-level task (no parent reference)
      parentId: null,
      subtaskOrder: null,
    };

    return await createRalphTask(cloneInput);
  } catch (error) {
    console.error('[RALPH TASK MANAGER] Error cloning task:', error);
    return {
      success: false,
      error: new Error(`Failed to clone task: ${error}`),
    };
  }
}

/**
 * Task completion statistics derived from task data
 */
export interface TaskCompletionStats {
  totalIterations: number;
  questionsAsked: number;
  questionsAnswered: number;
  researchIterations: number;
  gapsFound: number;
  gapsDismissed: number;
  totalDuration: number; // milliseconds from creation to completion
}

/**
 * Calculate completion statistics for a task
 */
export function calculateTaskStats(task: RalphTask): TaskCompletionStats {
  const stats: TaskCompletionStats = {
    totalIterations: task.planningState?.currentIteration ?? 0,
    questionsAsked: task.planningState?.pendingQuestions.length ?? 0,
    questionsAnswered: task.planningState?.pendingQuestions.filter((q) => q.answer).length ?? 0,
    researchIterations: task.researchState?.currentIteration ?? 0,
    gapsFound: task.researchState?.iterations.reduce((sum, iter) => sum + iter.gaps.length, 0) ?? 0,
    gapsDismissed: task.researchState?.pendingGaps.filter((g) => g.dismissed).length ?? 0,
    totalDuration: 0,
  };

  // Calculate total duration from creation to completion
  const createdAt = new Date(task.createdAt).getTime();
  const completedAt = task.completedAt ? new Date(task.completedAt).getTime() : Date.now();
  stats.totalDuration = completedAt - createdAt;

  return stats;
}

/**
 * Parse planning output to extract generated user stories.
 *
 * Looks for patterns like:
 * - "US-001: Title" or "US-001 - Title"
 * - "As a [role], I want [action] so that [benefit]"
 * - Acceptance criteria as bullet points or numbered lists
 *
 * Returns an array of GeneratedStoryPreview objects if stories are found.
 */
export function parseGeneratedStories(planContent: string): GeneratedStoryPreview[] {
  const stories: GeneratedStoryPreview[] = [];

  if (!planContent) {
    return stories;
  }

  // Split content into sections by story markers (US-XXX or ## Story patterns)
  // Pattern: US-001, US-002, etc. or ## User Story 1
  const storyPattern =
    /(?:^|\n)(?:#+\s*)?(?:US-(\d{3})|User\s*Story\s*(\d+)|Story\s*(\d+))[\s:.:-]+(.+?)(?=(?:\n(?:#+\s*)?(?:US-\d{3}|User\s*Story\s*\d+|Story\s*\d+)[\s:.:-])|$)/gi;

  // Alternative: split by "## " headers that look like stories
  const lines = planContent.split('\n');
  let currentStory: Partial<GeneratedStoryPreview> | null = null;
  let inAcceptanceCriteria = false;
  let storyIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim() || '';

    // Check for story header pattern: "US-XXX:" or "## US-XXX" or "### Story 1:"
    const storyHeaderMatch = line.match(
      /^(?:#{1,4}\s*)?(?:US-(\d{3})|User\s*Story\s*(\d+)|Story\s*(\d+))[\s:.:-]+(.+)/i
    );
    if (storyHeaderMatch) {
      // Save previous story if exists
      if (currentStory?.title && currentStory.userStory) {
        stories.push({
          tempId: `preview-${Date.now()}-${storyIndex}`,
          title: currentStory.title,
          userStory: currentStory.userStory,
          acceptanceCriteria: currentStory.acceptanceCriteria || [],
          order: storyIndex + 1,
        });
        storyIndex++;
      }

      // Start new story
      const storyNumber = storyHeaderMatch[1] || storyHeaderMatch[2] || storyHeaderMatch[3] || '';
      const storyTitle = storyHeaderMatch[4]?.trim() || '';
      currentStory = {
        title: `US-${storyNumber.padStart(3, '0')}: ${storyTitle}`,
        userStory: '',
        acceptanceCriteria: [],
        order: storyIndex + 1,
      };
      inAcceptanceCriteria = false;
      continue;
    }

    // If we're in a story, look for user story format
    if (currentStory) {
      // Check for "As a... I want... so that..." pattern
      const userStoryMatch = line.match(
        /^(?:\*\*)?As\s+a\s+(.+?),?\s+I\s+want\s+(.+?)(?:\s+so\s+that\s+(.+))?(?:\*\*)?$/i
      );
      if (userStoryMatch) {
        const role = userStoryMatch[1]?.trim() || '';
        const action = userStoryMatch[2]?.trim() || '';
        const benefit = userStoryMatch[3]?.trim() || '';
        currentStory.userStory = benefit
          ? `As a ${role}, I want ${action} so that ${benefit}`
          : `As a ${role}, I want ${action}`;
        continue;
      }

      // Check for acceptance criteria section header
      if (/^(?:#{1,4}\s*)?(?:Acceptance\s*Criteria|AC|Criteria)[\s:]*$/i.test(line)) {
        inAcceptanceCriteria = true;
        continue;
      }

      // Check for next section (not AC)
      if (/^#{1,4}\s+\w/.test(line) && !/acceptance|criteria/i.test(line)) {
        inAcceptanceCriteria = false;
        continue;
      }

      // Collect acceptance criteria (bullet points or numbered items)
      if (inAcceptanceCriteria) {
        const criteriaMatch = line.match(/^(?:[-*•]|\d+[.)]\s*)(.+)/);
        if (criteriaMatch) {
          const criteria = criteriaMatch[1]?.trim();
          if (criteria && currentStory.acceptanceCriteria) {
            currentStory.acceptanceCriteria.push(criteria);
          }
        }
      }
    }
  }

  // Don't forget the last story
  if (currentStory?.title && currentStory.userStory) {
    stories.push({
      tempId: `preview-${Date.now()}-${storyIndex}`,
      title: currentStory.title,
      userStory: currentStory.userStory,
      acceptanceCriteria: currentStory.acceptanceCriteria || [],
      order: storyIndex + 1,
    });
  }

  // If no stories found with the line-by-line parser, try the regex approach
  if (stories.length === 0) {
    let match;
    while ((match = storyPattern.exec(planContent)) !== null) {
      const storyNumber = match[1] || match[2] || match[3] || String(stories.length + 1);
      const titlePart = match[4]?.trim() || '';

      // Try to extract user story from the matched section
      const section = match[0];
      const userStoryMatch = section.match(
        /As\s+a\s+(.+?),?\s+I\s+want\s+(.+?)(?:\s+so\s+that\s+(.+?))?(?:\.|$)/i
      );

      let userStory = '';
      if (userStoryMatch) {
        const role = userStoryMatch[1]?.trim() || '';
        const action = userStoryMatch[2]?.trim() || '';
        const benefit = userStoryMatch[3]?.trim() || '';
        userStory = benefit
          ? `As a ${role}, I want ${action} so that ${benefit}`
          : `As a ${role}, I want ${action}`;
      }

      // Extract acceptance criteria from the section
      const acMatch = section.match(
        /(?:Acceptance\s*Criteria|AC)[\s:]*\n((?:[-*•]|\d+[.)]\s*).+(?:\n(?:[-*•]|\d+[.)]\s*).+)*)/i
      );
      const acceptanceCriteria: string[] = [];
      if (acMatch && acMatch[1]) {
        const acLines = acMatch[1].split('\n');
        for (const acLine of acLines) {
          const criteriaMatch = acLine.match(/^(?:[-*•]|\d+[.)]\s*)(.+)/);
          if (criteriaMatch && criteriaMatch[1]) {
            acceptanceCriteria.push(criteriaMatch[1].trim());
          }
        }
      }

      stories.push({
        tempId: `preview-${Date.now()}-${stories.length}`,
        title: `US-${storyNumber.padStart(3, '0')}: ${titlePart}`,
        userStory: userStory || `As a user, I want to ${titlePart.toLowerCase()}`,
        acceptanceCriteria,
        order: stories.length + 1,
      });
    }
  }

  return stories;
}

/**
 * Update generated stories preview on a task
 */
export async function updateGeneratedStories(
  taskId: string,
  stories: GeneratedStoryPreview[]
): Promise<AsyncResult<RalphTask>> {
  console.log('[RALPH TASK MANAGER] Updating generated stories for task:', taskId);

  try {
    const taskResult = await getRalphTask(taskId);
    if (!taskResult.success) {
      return taskResult;
    }

    const task = taskResult.data;

    // Update the planning state with new generated stories
    const updatedPlanningState = {
      ...(task.planningState || {
        currentIteration: 0,
        iterations: [],
        pendingQuestions: [],
        lastUpdated: new Date().toISOString(),
      }),
      generatedStories: stories,
      lastUpdated: new Date().toISOString(),
    };

    return await updateRalphTask(taskId, {
      planningState: updatedPlanningState,
    });
  } catch (error) {
    console.error('[RALPH TASK MANAGER] Error updating generated stories:', error);
    return {
      success: false,
      error: new Error(`Failed to update generated stories: ${error}`),
    };
  }
}

/**
 * Approve generated stories and create them as child tasks
 * Returns the parent task with updated childIds
 */
export async function approveGeneratedStories(
  parentTaskId: string,
  approvedStories: GeneratedStoryPreview[]
): Promise<AsyncResult<RalphTask>> {
  console.log(
    '[RALPH TASK MANAGER] Approving',
    approvedStories.length,
    'stories for task:',
    parentTaskId
  );

  try {
    const parentResult = await getRalphTask(parentTaskId);
    if (!parentResult.success) {
      return parentResult;
    }

    const parent = parentResult.data;

    // Create each approved story as a subtask
    const createdChildIds: string[] = [];
    for (const story of approvedStories) {
      const childResult = await createSubtask(parentTaskId, {
        title: story.title,
        subtaskOrder: story.order,
      });

      if (childResult.success) {
        createdChildIds.push(childResult.data.id);
      } else {
        console.error('[RALPH TASK MANAGER] Failed to create subtask:', childResult.error?.message);
        // Continue with other stories even if one fails
      }
    }

    // Clear generated stories from planning state
    const updatedTask = await updateRalphTask(parentTaskId, {
      planningState: {
        ...(parent.planningState || {
          currentIteration: 0,
          iterations: [],
          pendingQuestions: [],
          lastUpdated: new Date().toISOString(),
        }),
        generatedStories: undefined, // Clear the preview
        storyRevisionFeedback: undefined,
        lastUpdated: new Date().toISOString(),
      },
    });

    if (!updatedTask.success) {
      return updatedTask;
    }

    console.log('[RALPH TASK MANAGER] Created', createdChildIds.length, 'subtasks');
    return updatedTask;
  } catch (error) {
    console.error('[RALPH TASK MANAGER] Error approving generated stories:', error);
    return {
      success: false,
      error: new Error(`Failed to approve generated stories: ${error}`),
    };
  }
}

/**
 * Request revision for generated stories (sends feedback back to planning)
 */
export async function requestStoryRevision(
  taskId: string,
  feedback: string
): Promise<AsyncResult<RalphTask>> {
  console.log('[RALPH TASK MANAGER] Requesting story revision for task:', taskId);

  try {
    const taskResult = await getRalphTask(taskId);
    if (!taskResult.success) {
      return taskResult;
    }

    const task = taskResult.data;

    // Store the feedback and clear generated stories (will be regenerated)
    const updatedPlanningState = {
      ...(task.planningState || {
        currentIteration: 0,
        iterations: [],
        pendingQuestions: [],
        lastUpdated: new Date().toISOString(),
      }),
      storyRevisionFeedback: feedback,
      generatedStories: undefined, // Clear current preview
      lastUpdated: new Date().toISOString(),
    };

    return await updateRalphTask(taskId, {
      planningState: updatedPlanningState,
    });
  } catch (error) {
    console.error('[RALPH TASK MANAGER] Error requesting story revision:', error);
    return {
      success: false,
      error: new Error(`Failed to request story revision: ${error}`),
    };
  }
}

/**
 * Get child tasks that are in 'ready' state and not blocked
 * Returns sorted by subtaskOrder to respect dependency ordering
 */
export async function getReadyChildTasks(parentId: string): Promise<AsyncResult<RalphTask[]>> {
  console.log('[RALPH TASK MANAGER] Getting ready child tasks for parent:', parentId);

  try {
    const childrenResult = await getChildRalphTasks(parentId);
    if (!childrenResult.success) {
      return { success: false, error: childrenResult.error };
    }

    const readyChildren: RalphTask[] = [];

    // Fetch full task data for children in ready state
    for (const childEntry of childrenResult.data) {
      if (childEntry.status === 'ready') {
        const childResult = await getRalphTask(childEntry.id);
        if (childResult.success) {
          // Check if the task is blocked
          const depInfo = await getTaskDependencyInfo(childEntry.id);
          if (depInfo.success && !depInfo.data.isBlocked) {
            readyChildren.push(childResult.data);
          }
        }
      }
    }

    // Sort by subtaskOrder
    readyChildren.sort(
      (a, b) => (a.subtaskOrder ?? a.storyOrder ?? 0) - (b.subtaskOrder ?? b.storyOrder ?? 0)
    );

    console.log('[RALPH TASK MANAGER] Found', readyChildren.length, 'ready unblocked children');
    return { success: true, data: readyChildren };
  } catch (error) {
    console.error('[RALPH TASK MANAGER] Error getting ready child tasks:', error);
    return {
      success: false,
      error: new Error(`Failed to get ready child tasks: ${error}`),
    };
  }
}

/**
 * Get the next unblocked 'ready' child task to execute
 * Returns the child with the lowest subtaskOrder that is ready and not blocked
 */
export async function getNextReadyChildTask(
  parentId: string
): Promise<AsyncResult<RalphTask | null>> {
  console.log('[RALPH TASK MANAGER] Getting next ready child for parent:', parentId);

  try {
    const readyResult = await getReadyChildTasks(parentId);
    if (!readyResult.success) {
      return { success: false, error: readyResult.error };
    }

    const nextTask = readyResult.data[0] ?? null;
    if (nextTask) {
      console.log('[RALPH TASK MANAGER] Next ready child:', nextTask.id, nextTask.title);
    } else {
      console.log('[RALPH TASK MANAGER] No ready unblocked children found');
    }

    return { success: true, data: nextTask };
  } catch (error) {
    console.error('[RALPH TASK MANAGER] Error getting next ready child:', error);
    return {
      success: false,
      error: new Error(`Failed to get next ready child: ${error}`),
    };
  }
}

/**
 * Execution status summary for a parent task
 */
export interface FeatureExecutionStatus {
  /** Total number of child subtasks */
  totalStories: number;
  /** Number of subtasks currently executing */
  executingCount: number;
  /** Number of subtasks completed */
  completedCount: number;
  /** Number of stories ready to execute (not blocked) */
  readyCount: number;
  /** Number of stories pending (draft, triage, planning, research) */
  pendingCount: number;
  /** Number of stories that are blocked by dependencies */
  blockedCount: number;
  /** IDs of currently executing stories */
  executingStoryIds: string[];
  /** IDs of ready stories (not blocked) */
  readyStoryIds: string[];
}

/**
 * Get execution status summary for a parent task with children
 */
export async function getFeatureExecutionStatus(
  featureId: string
): Promise<AsyncResult<FeatureExecutionStatus>> {
  console.log('[RALPH TASK MANAGER] Getting parent execution status:', featureId);

  try {
    const featureResult = await getRalphTask(featureId);
    if (!featureResult.success) {
      return { success: false, error: featureResult.error };
    }

    const feature = featureResult.data;
    if (feature.childIds.length === 0) {
      return {
        success: false,
        error: new Error('Task has no children'),
      };
    }

    const childrenResult = await getChildRalphTasks(featureId);
    if (!childrenResult.success) {
      return { success: false, error: childrenResult.error };
    }

    const status: FeatureExecutionStatus = {
      totalStories: childrenResult.data.length,
      executingCount: 0,
      completedCount: 0,
      readyCount: 0,
      pendingCount: 0,
      blockedCount: 0,
      executingStoryIds: [],
      readyStoryIds: [],
    };

    // Count by status
    for (const child of childrenResult.data) {
      if (child.status === 'executing') {
        status.executingCount++;
        status.executingStoryIds.push(child.id);
      } else if (child.status === 'complete') {
        status.completedCount++;
      } else if (child.status === 'ready') {
        // Check if blocked
        const depInfo = await getTaskDependencyInfo(child.id);
        if (depInfo.success && depInfo.data.isBlocked) {
          status.blockedCount++;
        } else {
          status.readyCount++;
          status.readyStoryIds.push(child.id);
        }
      } else {
        status.pendingCount++;
      }
    }

    return { success: true, data: status };
  } catch (error) {
    console.error('[RALPH TASK MANAGER] Error getting feature execution status:', error);
    return {
      success: false,
      error: new Error(`Failed to get feature execution status: ${error}`),
    };
  }
}

/**
 * Aggregate completion statistics for a feature task
 * Includes stats from all child stories
 */
export interface FeatureCompletionStats {
  /** Total number of child stories */
  totalStories: number;
  /** Number of completed child stories */
  completedStories: number;
  /** Number of incomplete child stories */
  incompleteStories: number;
  /** Whether all children are complete */
  allChildrenComplete: boolean;
  /** Total time across all children (ms) */
  totalDuration: number;
  /** Total planning iterations across all children */
  totalIterations: number;
  /** Total questions asked across all children */
  totalQuestionsAsked: number;
  /** Total research iterations across all children */
  totalResearchIterations: number;
  /** PRs created (URLs) */
  prUrls: string[];
  /** Child story summaries for the completion summary */
  childSummaries: Array<{
    id: string;
    title: string;
    status: RalphTaskStatus;
    prUrl: string | null;
    completedAt: string | null;
    duration: number;
  }>;
}

/**
 * Get aggregate completion statistics for a parent task with children
 */
export async function getFeatureCompletionStats(
  featureId: string
): Promise<AsyncResult<FeatureCompletionStats>> {
  console.log('[RALPH TASK MANAGER] Getting parent completion stats:', featureId);

  try {
    const featureResult = await getRalphTask(featureId);
    if (!featureResult.success) {
      return { success: false, error: featureResult.error };
    }

    const feature = featureResult.data;
    if (feature.childIds.length === 0) {
      return {
        success: false,
        error: new Error('Task has no children'),
      };
    }

    const childrenResult = await getChildRalphTasks(featureId);
    if (!childrenResult.success) {
      return { success: false, error: childrenResult.error };
    }

    const stats: FeatureCompletionStats = {
      totalStories: childrenResult.data.length,
      completedStories: 0,
      incompleteStories: 0,
      allChildrenComplete: false,
      totalDuration: 0,
      totalIterations: 0,
      totalQuestionsAsked: 0,
      totalResearchIterations: 0,
      prUrls: [],
      childSummaries: [],
    };

    // Collect stats from each child
    for (const childEntry of childrenResult.data) {
      const childResult = await getRalphTask(childEntry.id);
      if (!childResult.success) continue;

      const child = childResult.data;
      const childStats = calculateTaskStats(child);

      // Count completion
      if (child.status === 'complete') {
        stats.completedStories++;
      } else {
        stats.incompleteStories++;
      }

      // Aggregate durations and iterations
      stats.totalDuration += childStats.totalDuration;
      stats.totalIterations += childStats.totalIterations;
      stats.totalQuestionsAsked += childStats.questionsAsked;
      stats.totalResearchIterations += childStats.researchIterations;

      // Collect PR URLs
      if (child.prUrl) {
        stats.prUrls.push(child.prUrl);
      }

      // Build child summary
      stats.childSummaries.push({
        id: child.id,
        title: child.title,
        status: child.status,
        prUrl: child.prUrl ?? null,
        completedAt: child.completedAt ?? null,
        duration: childStats.totalDuration,
      });
    }

    stats.allChildrenComplete = stats.incompleteStories === 0 && stats.totalStories > 0;

    // Sort summaries by subtask order
    stats.childSummaries.sort((a, b) => {
      const aChild = childrenResult.data.find((c) => c.id === a.id);
      const bChild = childrenResult.data.find((c) => c.id === b.id);
      return (aChild?.subtaskOrder ?? 0) - (bChild?.subtaskOrder ?? 0);
    });

    return { success: true, data: stats };
  } catch (error) {
    console.error('[RALPH TASK MANAGER] Error getting feature completion stats:', error);
    return {
      success: false,
      error: new Error(`Failed to get feature completion stats: ${error}`),
    };
  }
}

/**
 * Complete a parent task with optional summary notes
 * Validates that all children are complete (or force is true)
 */
export async function completeFeatureTask(
  featureId: string,
  options: {
    /** Optional summary notes */
    summaryNotes?: string | undefined;
    /** Force completion even with incomplete children (requires reason) */
    force?: boolean | undefined;
    /** Reason for force completion (required if force=true) */
    forceReason?: string | undefined;
  } = {}
): Promise<AsyncResult<RalphTask>> {
  console.log('[RALPH TASK MANAGER] Completing parent task:', featureId);

  try {
    const featureResult = await getRalphTask(featureId);
    if (!featureResult.success) {
      return featureResult;
    }

    const feature = featureResult.data;

    // Validate it has children
    if (feature.childIds.length === 0) {
      return {
        success: false,
        error: new Error('Task has no children'),
      };
    }

    // Check current status - parent tasks can be completed from multiple states
    const allowedStatuses: RalphTaskStatus[] = ['ready', 'planning', 'research'];
    if (!allowedStatuses.includes(feature.status) && feature.status !== 'complete') {
      return {
        success: false,
        error: new Error(
          `Task must be in ready, planning, or research state to complete. Current: ${feature.status}`
        ),
      };
    }

    // Check children completion status
    const statsResult = await getFeatureCompletionStats(featureId);
    if (!statsResult.success) {
      return { success: false, error: statsResult.error };
    }

    const stats = statsResult.data;

    // If not all children complete, require force flag with reason
    if (!stats.allChildrenComplete) {
      if (!options.force) {
        return {
          success: false,
          error: new Error(
            `Cannot complete task: ${stats.incompleteStories} of ${stats.totalStories} subtasks are incomplete. Use force=true with a reason to override.`
          ),
        };
      }
      if (!options.forceReason) {
        return {
          success: false,
          error: new Error('Force completion requires a reason'),
        };
      }
    }

    // Build completion reason
    const completionReason = options.force
      ? `Force completed: ${options.forceReason} (${stats.completedStories}/${stats.totalStories} subtasks complete)`
      : `All ${stats.totalStories} subtasks complete`;

    // Update feature with completion info
    const now = new Date().toISOString();
    const updateResult = await updateRalphTask(featureId, {
      completedAt: now,
      description: options.summaryNotes
        ? `${feature.description || ''}\n\n## Completion Summary\n${options.summaryNotes}`.trim()
        : feature.description,
    });

    if (!updateResult.success) {
      return updateResult;
    }

    // Transition to complete
    return await transitionRalphTask(featureId, 'complete', completionReason);
  } catch (error) {
    console.error('[RALPH TASK MANAGER] Error completing feature task:', error);
    return {
      success: false,
      error: new Error(`Failed to complete feature task: ${error}`),
    };
  }
}

/**
 * @deprecated promoteSimpleToFeature removed — task type system eliminated
 */

/**
 * @deprecated demoteFeatureToSimple removed — task type system eliminated
 */

/**
 * Reopen a completed child task
 * Transitions it back to ready state
 */
export async function reopenChildStory(
  storyId: string,
  reason: string
): Promise<AsyncResult<RalphTask>> {
  console.log('[RALPH TASK MANAGER] Reopening child task:', storyId);

  try {
    const storyResult = await getRalphTask(storyId);
    if (!storyResult.success) {
      return storyResult;
    }

    const story = storyResult.data;

    // Validate it's a subtask
    if (story.parentId == null) {
      return {
        success: false,
        error: new Error('Task is not a subtask'),
      };
    }

    // Validate it's complete
    if (story.status !== 'complete') {
      return {
        success: false,
        error: new Error(`Subtask must be complete to reopen. Current: ${story.status}`),
      };
    }

    // Clear completion timestamp
    const updateResult = await updateRalphTask(storyId, {
      completedAt: null,
    });

    if (!updateResult.success) {
      return updateResult;
    }

    // Transition back to ready
    return await transitionRalphTask(storyId, 'ready', `Reopened: ${reason}`);
  } catch (error) {
    console.error('[RALPH TASK MANAGER] Error reopening child story:', error);
    return {
      success: false,
      error: new Error(`Failed to reopen child story: ${error}`),
    };
  }
}

/**
 * Resolve the base branch for a task.
 * Falls back through: task.baseBranch -> workspaceTargetBranch -> 'main'
 */
export function resolveBaseBranch(
  task: Pick<RalphTask, 'baseBranch'>,
  workspaceTargetBranch?: string
): string {
  return task.baseBranch || workspaceTargetBranch || 'main';
}

/**
 * Resolve the PR target branch for a task.
 * Falls back through: task.prTargetBranch -> task.baseBranch -> workspaceTargetBranch -> 'main'
 */
export function resolvePrTargetBranch(
  task: Pick<RalphTask, 'prTargetBranch' | 'baseBranch'>,
  workspaceTargetBranch?: string
): string {
  return task.prTargetBranch || task.baseBranch || workspaceTargetBranch || 'main';
}

// ---------------------------------------------------------------------------
// Task ID formatting
// ---------------------------------------------------------------------------

/**
 * Format a task number as a human-readable ID (e.g., RLP-1, RLP-42).
 */
export function formatTaskId(n: number): string {
  return `RLP-${n}`;
}

// ---------------------------------------------------------------------------
// Project CRUD
// ---------------------------------------------------------------------------

export interface RalphProject {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

function dbProjectToRalphProject(p: DbProject): RalphProject {
  return {
    id: p.id,
    name: p.name,
    color: p.color,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };
}

export async function createRalphProject(input: {
  name: string;
  color?: string;
}): Promise<AsyncResult<RalphProject>> {
  try {
    const now = new Date().toISOString();
    const id = `proj-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
    const project: DbProject = {
      id,
      name: input.name,
      color: input.color ?? '#6366f1',
      created_at: now,
      updated_at: now,
    };
    dbCreateProject(project);
    console.log('[RALPH TASK MANAGER] Project created:', id);
    return { success: true, data: dbProjectToRalphProject(project) };
  } catch (error) {
    return { success: false, error: new Error(`Failed to create project: ${error}`) };
  }
}

export async function listRalphProjects(): Promise<AsyncResult<RalphProject[]>> {
  try {
    const projects = dbListProjects();
    return { success: true, data: projects.map(dbProjectToRalphProject) };
  } catch (error) {
    return { success: false, error: new Error(`Failed to list projects: ${error}`) };
  }
}

export async function updateRalphProject(
  id: string,
  updates: { name?: string; color?: string }
): Promise<AsyncResult<RalphProject>> {
  try {
    const updated = dbUpdateProject(id, updates);
    if (!updated) {
      return { success: false, error: new Error('Project not found') };
    }
    const project = dbGetProject(id);
    if (!project) {
      return { success: false, error: new Error('Project not found after update') };
    }
    return { success: true, data: dbProjectToRalphProject(project) };
  } catch (error) {
    return { success: false, error: new Error(`Failed to update project: ${error}`) };
  }
}

export async function deleteRalphProject(id: string): Promise<AsyncResult<void>> {
  try {
    const deleted = dbDeleteProject(id);
    if (!deleted) {
      return { success: false, error: new Error('Project not found') };
    }
    console.log('[RALPH TASK MANAGER] Project deleted:', id);
    return { success: true, data: undefined };
  } catch (error) {
    return { success: false, error: new Error(`Failed to delete project: ${error}`) };
  }
}

// ---------------------------------------------------------------------------
// Playbook CRUD
// ---------------------------------------------------------------------------

export interface RalphPlaybook {
  id: string;
  name: string;
  description: string;
  stageIds: string[];
  promptOverrides: Record<string, string>;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

function dbPlaybookToRalphPlaybook(p: DbPlaybook): RalphPlaybook {
  let promptOverrides: Record<string, string> = {};
  try {
    promptOverrides = p.prompt_overrides ? JSON.parse(p.prompt_overrides) : {};
  } catch {
    promptOverrides = {};
  }
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    stageIds: JSON.parse(p.stage_ids) as string[],
    promptOverrides,
    isDefault: p.is_default === 1,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };
}

export async function createRalphPlaybook(input: {
  name: string;
  description?: string;
  stageIds: string[];
  promptOverrides?: Record<string, string>;
  isDefault?: boolean;
}): Promise<AsyncResult<RalphPlaybook>> {
  try {
    const now = new Date().toISOString();
    const id = `pb-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
    const playbook: DbPlaybook = {
      id,
      name: input.name,
      description: input.description ?? '',
      stage_ids: JSON.stringify(input.stageIds),
      prompt_overrides: JSON.stringify(input.promptOverrides ?? {}),
      is_default: input.isDefault ? 1 : 0,
      created_at: now,
      updated_at: now,
    };
    dbCreatePlaybook(playbook);
    console.log('[RALPH TASK MANAGER] Playbook created:', id);
    return { success: true, data: dbPlaybookToRalphPlaybook(playbook) };
  } catch (error) {
    return { success: false, error: new Error(`Failed to create playbook: ${error}`) };
  }
}

export async function listRalphPlaybooks(): Promise<AsyncResult<RalphPlaybook[]>> {
  try {
    const playbooks = dbListPlaybooks();
    return { success: true, data: playbooks.map(dbPlaybookToRalphPlaybook) };
  } catch (error) {
    return { success: false, error: new Error(`Failed to list playbooks: ${error}`) };
  }
}

export async function getRalphPlaybook(id: string): Promise<AsyncResult<RalphPlaybook>> {
  try {
    const playbook = dbGetPlaybook(id);
    if (!playbook) {
      return { success: false, error: new Error('Playbook not found') };
    }
    return { success: true, data: dbPlaybookToRalphPlaybook(playbook) };
  } catch (error) {
    return { success: false, error: new Error(`Failed to get playbook: ${error}`) };
  }
}

export async function updateRalphPlaybook(
  id: string,
  updates: {
    name?: string;
    description?: string;
    stageIds?: string[];
    promptOverrides?: Record<string, string>;
    isDefault?: boolean;
  }
): Promise<AsyncResult<RalphPlaybook>> {
  try {
    const dbUpdates: {
      name?: string;
      description?: string;
      stage_ids?: string;
      prompt_overrides?: string;
      is_default?: number;
    } = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.stageIds !== undefined) dbUpdates.stage_ids = JSON.stringify(updates.stageIds);
    if (updates.promptOverrides !== undefined)
      dbUpdates.prompt_overrides = JSON.stringify(updates.promptOverrides);
    if (updates.isDefault !== undefined) dbUpdates.is_default = updates.isDefault ? 1 : 0;

    const updated = dbUpdatePlaybook(id, dbUpdates);
    if (!updated) {
      return { success: false, error: new Error('Playbook not found') };
    }
    const playbook = dbGetPlaybook(id);
    if (!playbook) {
      return { success: false, error: new Error('Playbook not found after update') };
    }
    return { success: true, data: dbPlaybookToRalphPlaybook(playbook) };
  } catch (error) {
    return { success: false, error: new Error(`Failed to update playbook: ${error}`) };
  }
}

export async function deleteRalphPlaybook(id: string): Promise<AsyncResult<void>> {
  try {
    const deleted = dbDeletePlaybook(id);
    if (!deleted) {
      return { success: false, error: new Error('Playbook not found') };
    }
    console.log('[RALPH TASK MANAGER] Playbook deleted:', id);
    return { success: true, data: undefined };
  } catch (error) {
    return { success: false, error: new Error(`Failed to delete playbook: ${error}`) };
  }
}

// ---------------------------------------------------------------------------
// Playbook Navigation & Enforcement
// ---------------------------------------------------------------------------

/**
 * Get the next stage in a task's playbook after the current stage.
 * Returns null nextStage if no playbook, playbook deleted, or current stage not found.
 * Returns 'complete' if current stage is the last in the playbook.
 */
export function getNextPlaybookStage(
  taskId: string,
  currentStage: string
): { nextStage: string | null; playbook: RalphPlaybook | null } {
  const task = dbGetTask(taskId);
  if (!task) return { nextStage: null, playbook: null };

  if (!task.playbookId) return { nextStage: null, playbook: null };

  const dbPb = dbGetPlaybook(task.playbookId);
  if (!dbPb) return { nextStage: null, playbook: null };

  const playbook = dbPlaybookToRalphPlaybook(dbPb);
  const stageIds = playbook.stageIds;
  const currentIndex = stageIds.indexOf(currentStage);

  if (currentIndex === -1) return { nextStage: null, playbook };

  if (currentIndex === stageIds.length - 1) {
    return { nextStage: 'complete', playbook };
  }

  return { nextStage: stageIds[currentIndex + 1] ?? null, playbook };
}

/**
 * Validate whether a transition is allowed given the task's playbook.
 *
 * Rules:
 * - No playbook → always allowed
 * - To 'draft' → always allowed (reset/escape hatch)
 * - Playbook deleted → allowed (defensive fallback)
 * - Current stage not in playbook → allowed (defensive fallback)
 * - From 'draft' → only playbook's first stage
 * - From 'complete' → only 'draft'
 * - From a stage → only next stage in playbook (or 'complete' if at end)
 */
export function validatePlaybookTransition(
  task: RalphTask,
  toStatus: string
): { allowed: boolean; reason?: string } {
  if (!task.playbookId) return { allowed: true };

  // Always allow transition to draft (reset)
  if (toStatus === 'draft') return { allowed: true };

  const dbPb = dbGetPlaybook(task.playbookId);
  if (!dbPb) return { allowed: true }; // Playbook deleted — allow free movement

  const playbook = dbPlaybookToRalphPlaybook(dbPb);
  const stageIds = playbook.stageIds;

  // From draft → only the first playbook stage
  if (task.status === 'draft') {
    if (toStatus === stageIds[0]) return { allowed: true };
    return {
      allowed: false,
      reason: `Playbook '${playbook.name}' requires starting at '${stageIds[0]}'. Clear the playbook to move freely.`,
    };
  }

  // From complete → only draft
  if (task.status === 'complete') {
    return {
      allowed: false,
      reason: `Task is complete. Move to 'draft' to restart.`,
    };
  }

  // Current stage not in playbook → allow (defensive)
  const currentIndex = stageIds.indexOf(task.status);
  if (currentIndex === -1) return { allowed: true };

  // Last stage → only 'complete'
  if (currentIndex === stageIds.length - 1) {
    if (toStatus === 'complete') return { allowed: true };
    return {
      allowed: false,
      reason: `Playbook '${playbook.name}': '${task.status}' is the last stage. Next valid status is 'complete'. Clear the playbook to move freely.`,
    };
  }

  // Middle stage → only next stage
  const expectedNext = stageIds[currentIndex + 1];
  if (toStatus === expectedNext) return { allowed: true };

  return {
    allowed: false,
    reason: `Playbook '${playbook.name}' requires advancing to '${expectedNext}' from '${task.status}'. Clear the playbook to move freely.`,
  };
}
