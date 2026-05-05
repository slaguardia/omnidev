'use server';

/**
 * Workspace storage — thin facade over the DB-backed workspace manager
 * (workspace-db routes to PostgreSQL when DATABASE_URL is set, else SQLite).
 *
 * Replaces the legacy module-level JSON cache. Concurrent saveWorkspace() calls
 * from multiple in-flight jobs no longer race on a file or a shared mutable map.
 *
 * On first initialization a one-shot migration moves any rows from the legacy
 * data/.workspace-index.json into the database and marks the file consumed.
 */

import { rename, readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { getDataDir } from '@/lib/config/server-actions';
import {
  dbInitWorkspaces,
  dbSaveWorkspace,
  dbGetWorkspace,
  dbDeleteWorkspace,
  dbWorkspaceExists,
  dbGetAllWorkspaces,
  dbTouchWorkspace,
} from '@/lib/managers/workspace-db';
import type { Workspace } from './types';
import type { WorkspaceId, AsyncResult } from '@/lib/common/types';

let initialized = false;

/**
 * Initialize workspace storage. Idempotent.
 */
export async function initializeWorkspaceStorage(): Promise<AsyncResult<void>> {
  try {
    await dbInitWorkspaces();
    if (!initialized) {
      await migrateLegacyJsonIndexIfPresent();
      initialized = true;
    }
    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to initialize workspace storage: ${error}`),
    };
  }
}

export async function saveWorkspace(workspace: Workspace): Promise<AsyncResult<void>> {
  try {
    await dbSaveWorkspace(workspace);
    return { success: true, data: undefined };
  } catch (error) {
    return { success: false, error: new Error(`Failed to save workspace: ${error}`) };
  }
}

export async function loadWorkspace(workspaceId: WorkspaceId): Promise<AsyncResult<Workspace>> {
  try {
    const workspace = await dbGetWorkspace(workspaceId);
    if (!workspace) {
      return { success: false, error: new Error(`Workspace ${workspaceId} not found`) };
    }
    const touched: Workspace = { ...workspace, lastAccessed: new Date() };
    await dbTouchWorkspace(workspaceId, touched);
    return { success: true, data: touched };
  } catch (error) {
    return { success: false, error: new Error(`Failed to load workspace: ${error}`) };
  }
}

export async function getAllWorkspaces(): Promise<AsyncResult<Workspace[]>> {
  try {
    const workspaces = await dbGetAllWorkspaces();
    workspaces.sort(
      (a, b) => new Date(b.lastAccessed).getTime() - new Date(a.lastAccessed).getTime()
    );
    return { success: true, data: workspaces };
  } catch (error) {
    return { success: false, error: new Error(`Failed to get all workspaces: ${error}`) };
  }
}

export async function deleteWorkspace(workspaceId: WorkspaceId): Promise<AsyncResult<void>> {
  try {
    await dbDeleteWorkspace(workspaceId);
    return { success: true, data: undefined };
  } catch (error) {
    return { success: false, error: new Error(`Failed to delete workspace: ${error}`) };
  }
}

export async function updateWorkspace(workspace: Workspace): Promise<AsyncResult<void>> {
  try {
    const exists = await dbWorkspaceExists(workspace.id);
    if (!exists) {
      return { success: false, error: new Error(`Workspace ${workspace.id} not found`) };
    }
    await dbSaveWorkspace(workspace);
    return { success: true, data: undefined };
  } catch (error) {
    return { success: false, error: new Error(`Failed to update workspace: ${error}`) };
  }
}

export async function workspaceExists(workspaceId: WorkspaceId): Promise<boolean> {
  try {
    return await dbWorkspaceExists(workspaceId);
  } catch {
    return false;
  }
}

/**
 * One-shot migration: if data/.workspace-index.json exists, import each row
 * into the DB and rename the file so it isn't re-read on subsequent boots.
 */
async function migrateLegacyJsonIndexIfPresent(): Promise<void> {
  const dataDir = await getDataDir();
  const legacyPath = join(dataDir, '.workspace-index.json');

  try {
    await access(legacyPath);
  } catch {
    return;
  }

  let raw: string;
  try {
    raw = await readFile(legacyPath, 'utf-8');
  } catch {
    return;
  }

  if (!raw.trim()) {
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.warn(`[WORKSPACE STORAGE] Could not parse legacy index, leaving in place: ${error}`);
    return;
  }

  const rows = extractWorkspaceRows(parsed);
  for (const row of rows) {
    try {
      const exists = await dbWorkspaceExists(row.id);
      if (!exists) {
        await dbSaveWorkspace(row);
      }
    } catch (error) {
      console.warn(`[WORKSPACE STORAGE] Skipping legacy row ${row.id}: ${error}`);
    }
  }

  try {
    await rename(legacyPath, `${legacyPath}.migrated`);
    console.log(`[WORKSPACE STORAGE] Migrated ${rows.length} workspace(s) from legacy JSON to DB`);
  } catch (error) {
    console.warn(`[WORKSPACE STORAGE] Could not rename legacy index after migration: ${error}`);
  }
}

function extractWorkspaceRows(data: unknown): Workspace[] {
  if (Array.isArray(data)) {
    return data.map(coerceWorkspace);
  }
  if (data && typeof data === 'object' && 'workspaces' in data) {
    const inner = (data as { workspaces: unknown }).workspaces;
    if (inner && typeof inner === 'object') {
      return Object.values(inner as Record<string, unknown>).map(coerceWorkspace);
    }
  }
  return [];
}

function coerceWorkspace(raw: unknown): Workspace {
  const w = raw as Workspace;
  return {
    ...w,
    createdAt: new Date(w.createdAt),
    lastAccessed: new Date(w.lastAccessed),
  };
}
