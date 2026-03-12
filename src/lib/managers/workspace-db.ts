/**
 * Workspace Database — SQLite storage layer for workspace index.
 *
 * Replaces file-based JSON storage (.workspace-index.json) with indexed SQLite.
 * Uses the same ralph.db database file, adding a `workspaces` table.
 * Lazy-initialized via getDb() from ralph-task-db.ts (shared singleton).
 */

import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import type Database from 'better-sqlite3';
import { getDb } from './ralph-task-db';
import type { Workspace, WorkspaceId } from '@/lib/types/index';

// ---------------------------------------------------------------------------
// Schema — runs on first access (idempotent CREATE IF NOT EXISTS)
// ---------------------------------------------------------------------------

let schemaReady = false;

function ensureSchema(): void {
  if (schemaReady) return;

  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id              TEXT PRIMARY KEY,
      path            TEXT NOT NULL,
      repo_url        TEXT NOT NULL,
      target_branch   TEXT NOT NULL,
      provider        TEXT,
      created_at      TEXT NOT NULL,
      last_accessed   TEXT NOT NULL,
      data            TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_workspaces_last_accessed
      ON workspaces (last_accessed DESC);
  `);

  // Auto-migrate from JSON if needed
  autoMigrateFromJson(db);

  schemaReady = true;
}

// ---------------------------------------------------------------------------
// Prepared statement cache
// ---------------------------------------------------------------------------

interface WsStmtCache {
  upsert: Database.Statement;
  getById: Database.Statement;
  deleteById: Database.Statement;
  exists: Database.Statement;
  getAll: Database.Statement;
  updateLastAccessed: Database.Statement;
}

let stmts: WsStmtCache | null = null;

function getStmts(): WsStmtCache {
  if (stmts) return stmts;
  ensureSchema();
  const db = getDb();

  stmts = {
    upsert: db.prepare(`
      INSERT OR REPLACE INTO workspaces
        (id, path, repo_url, target_branch, provider, created_at, last_accessed, data)
      VALUES
        (@id, @path, @repo_url, @target_branch, @provider, @created_at, @last_accessed, @data)
    `),

    getById: db.prepare('SELECT data FROM workspaces WHERE id = ?'),

    deleteById: db.prepare('DELETE FROM workspaces WHERE id = ?'),

    exists: db.prepare('SELECT 1 FROM workspaces WHERE id = ?'),

    getAll: db.prepare('SELECT data FROM workspaces ORDER BY last_accessed DESC'),

    updateLastAccessed: db.prepare(
      'UPDATE workspaces SET last_accessed = ?, data = ? WHERE id = ?'
    ),
  };

  return stmts;
}

// ---------------------------------------------------------------------------
// Row helpers
// ---------------------------------------------------------------------------

interface DataRow {
  data: string;
}

function workspaceParams(ws: Workspace) {
  return {
    id: ws.id,
    path: ws.path,
    repo_url: ws.repoUrl,
    target_branch: ws.targetBranch,
    provider: ws.provider ?? null,
    created_at: ws.createdAt instanceof Date ? ws.createdAt.toISOString() : String(ws.createdAt),
    last_accessed:
      ws.lastAccessed instanceof Date ? ws.lastAccessed.toISOString() : String(ws.lastAccessed),
    data: JSON.stringify(ws, (_key, value) => {
      // Serialize Date objects to ISO strings
      if (value instanceof Date) return value.toISOString();
      return value;
    }),
  };
}

function parseWorkspace(row: DataRow): Workspace {
  const raw = JSON.parse(row.data);
  return {
    ...raw,
    createdAt: new Date(raw.createdAt),
    lastAccessed: new Date(raw.lastAccessed),
  } as Workspace;
}

// ---------------------------------------------------------------------------
// Auto-migration from JSON
// ---------------------------------------------------------------------------

function autoMigrateFromJson(db: Database.Database): void {
  // Check if already migrated
  const meta = db
    .prepare("SELECT value FROM ralph_meta WHERE key = 'workspaces_migrated_from_json'")
    .get() as { value: string } | undefined;
  if (meta) return;

  // Look for the JSON index file
  const dataDir = resolve(process.cwd(), 'data');
  const jsonPath = resolve(dataDir, '.workspace-index.json');

  if (!existsSync(jsonPath)) {
    // No JSON file to migrate — mark as done
    db.prepare(
      "INSERT OR REPLACE INTO ralph_meta (key, value) VALUES ('workspaces_migrated_from_json', ?)"
    ).run(new Date().toISOString());
    return;
  }

  console.log('[WORKSPACE DB] Starting migration from .workspace-index.json');

  let workspaces: Workspace[] = [];

  try {
    const content = readFileSync(jsonPath, 'utf-8').trim();
    if (!content) {
      db.prepare(
        "INSERT OR REPLACE INTO ralph_meta (key, value) VALUES ('workspaces_migrated_from_json', ?)"
      ).run(new Date().toISOString());
      return;
    }

    const parsed = JSON.parse(content);

    // Handle both array format and object format
    if (Array.isArray(parsed)) {
      workspaces = parsed.map((ws: Record<string, unknown>) => ({
        ...ws,
        createdAt: new Date(ws.createdAt as string),
        lastAccessed: new Date(ws.lastAccessed as string),
      })) as Workspace[];
    } else if (parsed.workspaces && typeof parsed.workspaces === 'object') {
      workspaces = Object.values(parsed.workspaces).map((ws: unknown) => {
        const wsData = ws as Record<string, unknown>;
        return {
          ...wsData,
          createdAt: new Date(wsData.createdAt as string),
          lastAccessed: new Date(wsData.lastAccessed as string),
        };
      }) as Workspace[];
    }
  } catch (err) {
    console.warn('[WORKSPACE DB] Error reading JSON file:', err);
  }

  if (workspaces.length === 0) {
    db.prepare(
      "INSERT OR REPLACE INTO ralph_meta (key, value) VALUES ('workspaces_migrated_from_json', ?)"
    ).run(new Date().toISOString());
    console.log('[WORKSPACE DB] No workspaces to migrate');
    return;
  }

  const insert = db.prepare(`
    INSERT OR IGNORE INTO workspaces
      (id, path, repo_url, target_branch, provider, created_at, last_accessed, data)
    VALUES
      (@id, @path, @repo_url, @target_branch, @provider, @created_at, @last_accessed, @data)
  `);

  let migrated = 0;

  const runMigration = db.transaction(() => {
    for (const ws of workspaces) {
      try {
        insert.run(workspaceParams(ws));
        migrated++;
      } catch (err) {
        console.warn(`[WORKSPACE DB] Error migrating workspace ${ws.id}:`, err);
      }
    }

    db.prepare(
      "INSERT OR REPLACE INTO ralph_meta (key, value) VALUES ('workspaces_migrated_from_json', ?)"
    ).run(new Date().toISOString());
  });

  runMigration();
  console.log(`[WORKSPACE DB] Migration complete: ${migrated} workspaces migrated`);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Ensure the workspaces table exists (called during init).
 */
export function dbInitWorkspaces(): void {
  ensureSchema();
}

/**
 * Insert or update a workspace.
 */
export function dbSaveWorkspace(ws: Workspace): void {
  getStmts().upsert.run(workspaceParams(ws));
}

/**
 * Get a workspace by ID. Returns null if not found.
 */
export function dbGetWorkspace(id: WorkspaceId): Workspace | null {
  const row = getStmts().getById.get(id) as DataRow | undefined;
  return row ? parseWorkspace(row) : null;
}

/**
 * Update lastAccessed timestamp for a workspace.
 */
export function dbTouchWorkspace(id: WorkspaceId, ws: Workspace): void {
  const now = new Date();
  ws.lastAccessed = now;
  const data = JSON.stringify(ws, (_key, value) => {
    if (value instanceof Date) return value.toISOString();
    return value;
  });
  getStmts().updateLastAccessed.run(now.toISOString(), data, id);
}

/**
 * Delete a workspace by ID. Returns true if a row was deleted.
 */
export function dbDeleteWorkspace(id: WorkspaceId): boolean {
  const result = getStmts().deleteById.run(id);
  return result.changes > 0;
}

/**
 * Check if a workspace exists.
 */
export function dbWorkspaceExists(id: WorkspaceId): boolean {
  return getStmts().exists.get(id) !== undefined;
}

/**
 * Get all workspaces sorted by lastAccessed DESC.
 */
export function dbGetAllWorkspaces(): Workspace[] {
  const rows = getStmts().getAll.all() as DataRow[];
  return rows.map(parseWorkspace);
}
