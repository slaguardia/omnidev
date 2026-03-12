/**
 * Simplified Task Management Types
 *
 * Linear-inspired task management with Projects, Tasks, and Subtasks.
 * Workspace-scoped storage at data/tasks/{workspaceId}/
 */

import type { WorkspaceId } from '@/lib/types/index';

// ============================================================================
// Branded Types
// ============================================================================

export type ProjectId = string & { readonly brand: unique symbol };
export type TaskId = string & { readonly brand: unique symbol };

export function createProjectId(id: string): ProjectId {
  return id as ProjectId;
}

export function createTaskId(id: string): TaskId {
  return id as TaskId;
}

// ============================================================================
// Status Types
// ============================================================================

/**
 * Task status - simplified 4-state model
 */
export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'done';

/**
 * Task priority - Linear-style (0=none, 1=urgent, 4=low)
 */
export type TaskPriority = 0 | 1 | 2 | 3 | 4;

// ============================================================================
// Question Types (for Q&A flow)
// ============================================================================

export interface TaskQuestion {
  id: string;
  question: string;
  context?: string;
  answer?: string;
  answeredAt?: string;
}

// ============================================================================
// Project Type
// ============================================================================

export interface Project {
  id: ProjectId;
  workspaceId: WorkspaceId;
  name: string;
  description?: string;
  color?: string; // Hex for UI
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectInput {
  workspaceId: WorkspaceId;
  name: string;
  description?: string;
  color?: string;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  color?: string;
  archived?: boolean;
}

// ============================================================================
// Task Type
// ============================================================================

export interface Task {
  id: TaskId;
  workspaceId: WorkspaceId;
  projectId?: ProjectId; // Optional project grouping

  title: string;
  description?: string; // Markdown
  status: TaskStatus;
  priority?: TaskPriority;

  parentId?: TaskId; // If set, this is a subtask
  sortOrder?: number;

  // Execution context
  featureBranch?: string;
  prUrl?: string;
  executionJobId?: string;

  // Q&A for plan phase
  questions: TaskQuestion[];

  // Triage analysis results
  triageAnalysis?: TaskTriageAnalysis;

  // Plan phase results
  planContent?: string;

  // Research gaps
  researchGaps?: TaskResearchGap[];

  // Timestamps
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface CreateTaskInput {
  workspaceId: WorkspaceId;
  projectId?: ProjectId;
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  parentId?: TaskId;
  sortOrder?: number;
}

export interface UpdateTaskInput {
  projectId?: ProjectId | null;
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  parentId?: TaskId | null;
  sortOrder?: number;
  featureBranch?: string | null;
  prUrl?: string | null;
  executionJobId?: string | null;
  questions?: TaskQuestion[];
  triageAnalysis?: TaskTriageAnalysis | null;
  planContent?: string | null;
  researchGaps?: TaskResearchGap[] | null;
  completedAt?: string | null;
}

// ============================================================================
// Triage Analysis Type
// ============================================================================

export interface TaskTriageAnalysis {
  complexity: 'trivial' | 'simple' | 'moderate' | 'complex';
  estimatedScope: string;
  suggestedApproach: string;
  relevantFiles?: string[];
  risks?: string[];
  createdAt: string;
}

// ============================================================================
// Research Gap Type
// ============================================================================

export type ResearchGapCategory =
  | 'missing_story'
  | 'edge_case'
  | 'best_practice'
  | 'security'
  | 'accessibility'
  | 'vague_criteria'
  | 'error_handling';

export type ResearchGapSeverity = 'low' | 'medium' | 'high';

export interface TaskResearchGap {
  id: string;
  category: ResearchGapCategory;
  severity: ResearchGapSeverity;
  description: string;
  suggestedFix?: string;
  dismissed: boolean;
  dismissedAt?: string;
  dismissReason?: string;
}

// ============================================================================
// Index Types (for fast lookups)
// ============================================================================

export interface TaskIndexEntry {
  id: TaskId;
  workspaceId: WorkspaceId;
  projectId?: ProjectId;
  title: string;
  status: TaskStatus;
  priority?: TaskPriority;
  parentId?: TaskId;
  sortOrder?: number;
  hasQuestions: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceTaskIndex {
  version: string;
  lastUpdated: string;
  tasks: Record<string, TaskIndexEntry>;
  projects: Record<string, ProjectId>;
}
