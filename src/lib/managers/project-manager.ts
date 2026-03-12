'use server';

/**
 * Project Manager - CRUD operations for projects
 *
 * Projects are workspace-scoped buckets for organizing tasks.
 * Storage: data/tasks/{workspaceId}/projects/{projectId}.json
 */

import { readFile, writeFile, mkdir, readdir, unlink, access } from 'node:fs/promises';
import { join } from 'node:path';
import type { AsyncResult, WorkspaceId } from '@/lib/types/index';
import type { Project, ProjectId, CreateProjectInput, UpdateProjectInput } from './task-types';
import { createProjectId } from './task-types';

// ============================================================================
// Constants
// ============================================================================

const DATA_DIR = 'data/tasks';
const PROJECTS_DIR = 'projects';

// ============================================================================
// Helper Functions
// ============================================================================

function generateProjectId(): ProjectId {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return createProjectId(`proj_${timestamp}${random}`);
}

async function getProjectsDir(workspaceId: WorkspaceId): Promise<string> {
  return join(process.cwd(), DATA_DIR, workspaceId, PROJECTS_DIR);
}

async function ensureProjectsDir(workspaceId: WorkspaceId): Promise<void> {
  const dir = await getProjectsDir(workspaceId);
  await mkdir(dir, { recursive: true });
}

function getProjectPath(projectsDir: string, projectId: ProjectId): string {
  return join(projectsDir, `${projectId}.json`);
}

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Create a new project
 */
export async function createProject(input: CreateProjectInput): Promise<AsyncResult<Project>> {
  console.log(`[PROJECT MANAGER] Creating project: ${input.name}`);

  try {
    await ensureProjectsDir(input.workspaceId);

    const now = new Date().toISOString();
    const project: Project = {
      id: generateProjectId(),
      workspaceId: input.workspaceId,
      name: input.name,
      archived: false,
      createdAt: now,
      updatedAt: now,
    };

    if (input.description) {
      project.description = input.description;
    }
    if (input.color) {
      project.color = input.color;
    }

    const projectsDir = await getProjectsDir(input.workspaceId);
    const projectPath = getProjectPath(projectsDir, project.id);

    await writeFile(projectPath, JSON.stringify(project, null, 2), 'utf-8');

    console.log(`[PROJECT MANAGER] Created project: ${project.id}`);
    return { success: true, data: project };
  } catch (error) {
    console.error(`[PROJECT MANAGER] Error creating project:`, error);
    return {
      success: false,
      error: new Error(`Failed to create project: ${error}`),
    };
  }
}

/**
 * Get a project by ID
 */
export async function getProject(
  workspaceId: WorkspaceId,
  projectId: ProjectId
): Promise<AsyncResult<Project>> {
  console.log(`[PROJECT MANAGER] Getting project: ${projectId}`);

  try {
    const projectsDir = await getProjectsDir(workspaceId);
    const projectPath = getProjectPath(projectsDir, projectId);

    const content = await readFile(projectPath, 'utf-8');
    const project = JSON.parse(content) as Project;

    return { success: true, data: project };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        success: false,
        error: new Error(`Project not found: ${projectId}`),
      };
    }
    console.error(`[PROJECT MANAGER] Error getting project:`, error);
    return {
      success: false,
      error: new Error(`Failed to get project: ${error}`),
    };
  }
}

/**
 * List all projects for a workspace
 */
export async function listProjects(
  workspaceId: WorkspaceId,
  options?: { includeArchived?: boolean }
): Promise<AsyncResult<Project[]>> {
  console.log(`[PROJECT MANAGER] Listing projects for workspace: ${workspaceId}`);

  try {
    const projectsDir = await getProjectsDir(workspaceId);

    // Check if directory exists
    try {
      await access(projectsDir);
    } catch {
      // Directory doesn't exist - return empty list
      return { success: true, data: [] };
    }

    const files = await readdir(projectsDir);
    const projectFiles = files.filter((f) => f.endsWith('.json'));

    const projects: Project[] = [];
    for (const file of projectFiles) {
      try {
        const content = await readFile(join(projectsDir, file), 'utf-8');
        const project = JSON.parse(content) as Project;

        // Filter archived unless requested
        if (!options?.includeArchived && project.archived) {
          continue;
        }

        projects.push(project);
      } catch (err) {
        console.warn(`[PROJECT MANAGER] Error reading project file ${file}:`, err);
      }
    }

    // Sort by name
    projects.sort((a, b) => a.name.localeCompare(b.name));

    console.log(`[PROJECT MANAGER] Found ${projects.length} projects`);
    return { success: true, data: projects };
  } catch (error) {
    console.error(`[PROJECT MANAGER] Error listing projects:`, error);
    return {
      success: false,
      error: new Error(`Failed to list projects: ${error}`),
    };
  }
}

/**
 * Update a project
 */
export async function updateProject(
  workspaceId: WorkspaceId,
  projectId: ProjectId,
  updates: UpdateProjectInput
): Promise<AsyncResult<Project>> {
  console.log(`[PROJECT MANAGER] Updating project: ${projectId}`);

  try {
    // Get existing project
    const getResult = await getProject(workspaceId, projectId);
    if (!getResult.success) {
      return getResult;
    }

    const project = getResult.data;

    // Apply updates
    if (updates.name !== undefined) {
      project.name = updates.name;
    }
    if (updates.description !== undefined) {
      project.description = updates.description;
    }
    if (updates.color !== undefined) {
      project.color = updates.color;
    }
    if (updates.archived !== undefined) {
      project.archived = updates.archived;
    }

    project.updatedAt = new Date().toISOString();

    // Save
    const projectsDir = await getProjectsDir(workspaceId);
    const projectPath = getProjectPath(projectsDir, projectId);

    await writeFile(projectPath, JSON.stringify(project, null, 2), 'utf-8');

    console.log(`[PROJECT MANAGER] Updated project: ${projectId}`);
    return { success: true, data: project };
  } catch (error) {
    console.error(`[PROJECT MANAGER] Error updating project:`, error);
    return {
      success: false,
      error: new Error(`Failed to update project: ${error}`),
    };
  }
}

/**
 * Delete a project
 */
export async function deleteProject(
  workspaceId: WorkspaceId,
  projectId: ProjectId
): Promise<AsyncResult<void>> {
  console.log(`[PROJECT MANAGER] Deleting project: ${projectId}`);

  try {
    const projectsDir = await getProjectsDir(workspaceId);
    const projectPath = getProjectPath(projectsDir, projectId);

    await unlink(projectPath);

    console.log(`[PROJECT MANAGER] Deleted project: ${projectId}`);
    return { success: true, data: undefined };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        success: false,
        error: new Error(`Project not found: ${projectId}`),
      };
    }
    console.error(`[PROJECT MANAGER] Error deleting project:`, error);
    return {
      success: false,
      error: new Error(`Failed to delete project: ${error}`),
    };
  }
}
