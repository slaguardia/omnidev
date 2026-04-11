'use server';

/**
 * Task Manager - CRUD operations for tasks
 *
 * Tasks are workspace-scoped with optional project grouping.
 * Storage: data/tasks/{workspaceId}/tasks/{taskId}.json
 * Index: data/tasks/{workspaceId}/_index.json
 */

import { readFile, writeFile, mkdir, readdir, unlink, access } from 'node:fs/promises';
import { join } from 'node:path';
import type { AsyncResult, WorkspaceId } from '@/lib/types/index';
import type {
  Task,
  TaskId,
  ProjectId,
  TaskStatus,
  CreateTaskInput,
  UpdateTaskInput,
  TaskIndexEntry,
  WorkspaceTaskIndex,
} from './task-types';
import { createTaskId } from './task-types';

// ============================================================================
// Constants
// ============================================================================

const DATA_DIR = 'data/tasks';
const TASKS_DIR = 'tasks';
const INDEX_FILE = '_index.json';
const INDEX_VERSION = '1.0.0';

// ============================================================================
// Helper Functions
// ============================================================================

function generateTaskId(): TaskId {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return createTaskId(`task_${timestamp}${random}`);
}

async function getWorkspaceDir(workspaceId: WorkspaceId): Promise<string> {
  return join(process.cwd(), DATA_DIR, workspaceId);
}

async function getTasksDir(workspaceId: WorkspaceId): Promise<string> {
  return join(await getWorkspaceDir(workspaceId), TASKS_DIR);
}

async function ensureTasksDir(workspaceId: WorkspaceId): Promise<void> {
  const dir = await getTasksDir(workspaceId);
  await mkdir(dir, { recursive: true });
}

function getTaskPath(tasksDir: string, taskId: TaskId): string {
  return join(tasksDir, `${taskId}.json`);
}

async function getIndexPath(workspaceId: WorkspaceId): Promise<string> {
  return join(await getWorkspaceDir(workspaceId), INDEX_FILE);
}

// ============================================================================
// Index Management
// ============================================================================

async function loadIndex(workspaceId: WorkspaceId): Promise<WorkspaceTaskIndex> {
  const indexPath = await getIndexPath(workspaceId);

  try {
    const content = await readFile(indexPath, 'utf-8');
    return JSON.parse(content) as WorkspaceTaskIndex;
  } catch {
    // Return empty index
    return {
      version: INDEX_VERSION,
      lastUpdated: new Date().toISOString(),
      tasks: {},
      projects: {},
    };
  }
}

async function saveIndex(workspaceId: WorkspaceId, index: WorkspaceTaskIndex): Promise<void> {
  const workspaceDir = await getWorkspaceDir(workspaceId);
  await mkdir(workspaceDir, { recursive: true });

  index.lastUpdated = new Date().toISOString();
  const indexPath = await getIndexPath(workspaceId);
  await writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8');
}

function taskToIndexEntry(task: Task): TaskIndexEntry {
  const entry: TaskIndexEntry = {
    id: task.id,
    workspaceId: task.workspaceId,
    title: task.title,
    status: task.status,
    hasQuestions: task.questions.length > 0 && task.questions.some((q) => !q.answer),
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };

  if (task.projectId) {
    entry.projectId = task.projectId;
  }
  if (task.priority !== undefined) {
    entry.priority = task.priority;
  }
  if (task.parentId) {
    entry.parentId = task.parentId;
  }
  if (task.sortOrder !== undefined) {
    entry.sortOrder = task.sortOrder;
  }

  return entry;
}

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Create a new task
 */
export async function createTask(input: CreateTaskInput): Promise<AsyncResult<Task>> {
  console.log(`[TASK MANAGER] Creating task: ${input.title}`);

  try {
    await ensureTasksDir(input.workspaceId);

    const now = new Date().toISOString();
    const task: Task = {
      id: generateTaskId(),
      workspaceId: input.workspaceId,
      title: input.title,
      status: input.status ?? 'backlog',
      questions: [],
      createdAt: now,
      updatedAt: now,
    };

    if (input.projectId) {
      task.projectId = input.projectId;
    }
    if (input.description) {
      task.description = input.description;
    }
    if (input.priority !== undefined) {
      task.priority = input.priority;
    }
    if (input.parentId) {
      task.parentId = input.parentId;
    }
    if (input.sortOrder !== undefined) {
      task.sortOrder = input.sortOrder;
    }

    // Save task file
    const tasksDir = await getTasksDir(input.workspaceId);
    const taskPath = getTaskPath(tasksDir, task.id);
    await writeFile(taskPath, JSON.stringify(task, null, 2), 'utf-8');

    // Update index
    const index = await loadIndex(input.workspaceId);
    index.tasks[task.id] = taskToIndexEntry(task);
    await saveIndex(input.workspaceId, index);

    console.log(`[TASK MANAGER] Created task: ${task.id}`);
    return { success: true, data: task };
  } catch (error) {
    console.error(`[TASK MANAGER] Error creating task:`, error);
    return {
      success: false,
      error: new Error(`Failed to create task: ${error}`),
    };
  }
}

/**
 * Get a task by ID
 */
export async function getTask(
  workspaceId: WorkspaceId,
  taskId: TaskId
): Promise<AsyncResult<Task>> {
  console.log(`[TASK MANAGER] Getting task: ${taskId}`);

  try {
    const tasksDir = await getTasksDir(workspaceId);
    const taskPath = getTaskPath(tasksDir, taskId);

    const content = await readFile(taskPath, 'utf-8');
    const task = JSON.parse(content) as Task;

    return { success: true, data: task };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        success: false,
        error: new Error(`Task not found: ${taskId}`),
      };
    }
    console.error(`[TASK MANAGER] Error getting task:`, error);
    return {
      success: false,
      error: new Error(`Failed to get task: ${error}`),
    };
  }
}

/**
 * List all tasks for a workspace
 */
export async function listTasks(
  workspaceId: WorkspaceId,
  options?: {
    projectId?: ProjectId;
    status?: TaskStatus;
    parentId?: TaskId | null;
  }
): Promise<AsyncResult<Task[]>> {
  console.log(`[TASK MANAGER] Listing tasks for workspace: ${workspaceId}`);

  try {
    const tasksDir = await getTasksDir(workspaceId);

    // Check if directory exists
    try {
      await access(tasksDir);
    } catch {
      return { success: true, data: [] };
    }

    const files = await readdir(tasksDir);
    const taskFiles = files.filter((f) => f.endsWith('.json'));

    const tasks: Task[] = [];
    for (const file of taskFiles) {
      try {
        const content = await readFile(join(tasksDir, file), 'utf-8');
        const task = JSON.parse(content) as Task;

        // Apply filters
        if (options?.projectId && task.projectId !== options.projectId) {
          continue;
        }
        if (options?.status && task.status !== options.status) {
          continue;
        }
        if (options?.parentId !== undefined) {
          if (options.parentId === null && task.parentId) {
            continue;
          }
          if (options.parentId !== null && task.parentId !== options.parentId) {
            continue;
          }
        }

        tasks.push(task);
      } catch (err) {
        console.warn(`[TASK MANAGER] Error reading task file ${file}:`, err);
      }
    }

    // Sort by sortOrder, then by createdAt
    tasks.sort((a, b) => {
      if (a.sortOrder !== undefined && b.sortOrder !== undefined) {
        return a.sortOrder - b.sortOrder;
      }
      if (a.sortOrder !== undefined) return -1;
      if (b.sortOrder !== undefined) return 1;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    console.log(`[TASK MANAGER] Found ${tasks.length} tasks`);
    return { success: true, data: tasks };
  } catch (error) {
    console.error(`[TASK MANAGER] Error listing tasks:`, error);
    return {
      success: false,
      error: new Error(`Failed to list tasks: ${error}`),
    };
  }
}

/**
 * Update a task
 */
export async function updateTask(
  workspaceId: WorkspaceId,
  taskId: TaskId,
  updates: UpdateTaskInput
): Promise<AsyncResult<Task>> {
  console.log(`[TASK MANAGER] Updating task: ${taskId}`);

  try {
    // Get existing task
    const getResult = await getTask(workspaceId, taskId);
    if (!getResult.success) {
      return getResult;
    }

    const task = getResult.data;

    // Apply updates - handle null values for clearing fields
    if (updates.projectId !== undefined) {
      if (updates.projectId === null) {
        delete task.projectId;
      } else {
        task.projectId = updates.projectId;
      }
    }
    if (updates.title !== undefined) {
      task.title = updates.title;
    }
    if (updates.description !== undefined) {
      task.description = updates.description;
    }
    if (updates.status !== undefined) {
      task.status = updates.status;
      // Set completedAt when moving to done
      if (updates.status === 'done' && !task.completedAt) {
        task.completedAt = new Date().toISOString();
      }
      // Clear completedAt when moving out of done
      if (updates.status !== 'done' && task.completedAt) {
        delete task.completedAt;
      }
    }
    if (updates.priority !== undefined) {
      task.priority = updates.priority;
    }
    if (updates.parentId !== undefined) {
      if (updates.parentId === null) {
        delete task.parentId;
      } else {
        task.parentId = updates.parentId;
      }
    }
    if (updates.sortOrder !== undefined) {
      task.sortOrder = updates.sortOrder;
    }
    if (updates.featureBranch !== undefined) {
      if (updates.featureBranch === null) {
        delete task.featureBranch;
      } else {
        task.featureBranch = updates.featureBranch;
      }
    }
    if (updates.prUrl !== undefined) {
      if (updates.prUrl === null) {
        delete task.prUrl;
      } else {
        task.prUrl = updates.prUrl;
      }
    }
    if (updates.executionJobId !== undefined) {
      if (updates.executionJobId === null) {
        delete task.executionJobId;
      } else {
        task.executionJobId = updates.executionJobId;
      }
    }
    if (updates.questions !== undefined) {
      task.questions = updates.questions;
    }
    if (updates.triageAnalysis !== undefined) {
      if (updates.triageAnalysis === null) {
        delete task.triageAnalysis;
      } else {
        task.triageAnalysis = updates.triageAnalysis;
      }
    }
    if (updates.planContent !== undefined) {
      if (updates.planContent === null) {
        delete task.planContent;
      } else {
        task.planContent = updates.planContent;
      }
    }
    if (updates.researchGaps !== undefined) {
      if (updates.researchGaps === null) {
        delete task.researchGaps;
      } else {
        task.researchGaps = updates.researchGaps;
      }
    }
    if (updates.completedAt !== undefined) {
      if (updates.completedAt === null) {
        delete task.completedAt;
      } else {
        task.completedAt = updates.completedAt;
      }
    }

    task.updatedAt = new Date().toISOString();

    // Save task file
    const tasksDir = await getTasksDir(workspaceId);
    const taskPath = getTaskPath(tasksDir, taskId);
    await writeFile(taskPath, JSON.stringify(task, null, 2), 'utf-8');

    // Update index
    const index = await loadIndex(workspaceId);
    index.tasks[task.id] = taskToIndexEntry(task);
    await saveIndex(workspaceId, index);

    console.log(`[TASK MANAGER] Updated task: ${taskId}`);
    return { success: true, data: task };
  } catch (error) {
    console.error(`[TASK MANAGER] Error updating task:`, error);
    return {
      success: false,
      error: new Error(`Failed to update task: ${error}`),
    };
  }
}

/**
 * Delete a task
 */
export async function deleteTask(
  workspaceId: WorkspaceId,
  taskId: TaskId
): Promise<AsyncResult<void>> {
  console.log(`[TASK MANAGER] Deleting task: ${taskId}`);

  try {
    const tasksDir = await getTasksDir(workspaceId);
    const taskPath = getTaskPath(tasksDir, taskId);

    // Delete task file
    await unlink(taskPath);

    // Update index
    const index = await loadIndex(workspaceId);
    delete index.tasks[taskId];
    await saveIndex(workspaceId, index);

    console.log(`[TASK MANAGER] Deleted task: ${taskId}`);
    return { success: true, data: undefined };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        success: false,
        error: new Error(`Task not found: ${taskId}`),
      };
    }
    console.error(`[TASK MANAGER] Error deleting task:`, error);
    return {
      success: false,
      error: new Error(`Failed to delete task: ${error}`),
    };
  }
}

/**
 * Get subtasks for a parent task
 */
export async function getSubtasks(
  workspaceId: WorkspaceId,
  parentId: TaskId
): Promise<AsyncResult<Task[]>> {
  return listTasks(workspaceId, { parentId });
}

/**
 * Get task index for fast lookups
 */
export async function getTaskIndex(
  workspaceId: WorkspaceId
): Promise<AsyncResult<WorkspaceTaskIndex>> {
  try {
    const index = await loadIndex(workspaceId);
    return { success: true, data: index };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to get task index: ${error}`),
    };
  }
}

/**
 * Rebuild the task index from task files
 */
export async function rebuildTaskIndex(workspaceId: WorkspaceId): Promise<AsyncResult<void>> {
  console.log(`[TASK MANAGER] Rebuilding index for workspace: ${workspaceId}`);

  try {
    const tasksResult = await listTasks(workspaceId);
    if (!tasksResult.success) {
      return tasksResult;
    }

    const index: WorkspaceTaskIndex = {
      version: INDEX_VERSION,
      lastUpdated: new Date().toISOString(),
      tasks: {},
      projects: {},
    };

    for (const task of tasksResult.data) {
      index.tasks[task.id] = taskToIndexEntry(task);
    }

    await saveIndex(workspaceId, index);

    console.log(`[TASK MANAGER] Rebuilt index with ${Object.keys(index.tasks).length} tasks`);
    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to rebuild index: ${error}`),
    };
  }
}
