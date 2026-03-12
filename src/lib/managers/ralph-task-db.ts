/**
 * Ralph Task Database — SQLite storage layer for Ralph tasks.
 *
 * Replaces file-based JSON storage with indexed SQLite queries.
 * Uses better-sqlite3 (synchronous, native C++ addon) with WAL mode.
 * Lazy-initialized singleton with cached prepared statements.
 */

import Database from 'better-sqlite3';
import { resolve } from 'node:path';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import type { RalphTask, RalphTaskIndexEntry } from './ralph-task-manager';
import { RalphTaskSchema } from './ralph-task-manager';

// ---------------------------------------------------------------------------
// Singleton database instance
// ---------------------------------------------------------------------------

let db: Database.Database | null = null;

function getDbPath(): string {
  const dataDir = resolve(process.cwd(), 'data');
  return resolve(dataDir, 'ralph.db');
}

function getRalphTasksDir(): string {
  return resolve(process.cwd(), 'workspaces', '.ralph-tasks');
}

/**
 * Get or initialize the database instance.
 * Creates schema and runs migration on first access.
 */
export function getDb(): Database.Database {
  if (db) return db;

  const dbPath = getDbPath();

  // Ensure data directory exists
  const dataDir = resolve(process.cwd(), 'data');
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  db = new Database(dbPath);

  // Performance settings
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');

  // Create schema
  createSchema(db);

  // Auto-migrate from JSON if needed
  autoMigrateFromJson(db);

  return db;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

function createSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS ralph_tasks (
      id              TEXT PRIMARY KEY,
      title           TEXT NOT NULL,
      workspace_id    TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'draft',
      is_archived     INTEGER NOT NULL DEFAULT 0,
      parent_id       TEXT,
      subtask_order   INTEGER,
      delivery_method TEXT DEFAULT 'merge-request',
      execution_job_id TEXT,
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL,
      completed_at    TEXT,
      data            TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ralph_tasks_workspace
      ON ralph_tasks (workspace_id);
    CREATE INDEX IF NOT EXISTS idx_ralph_tasks_status
      ON ralph_tasks (status);
    CREATE INDEX IF NOT EXISTS idx_ralph_tasks_parent
      ON ralph_tasks (parent_id);
    CREATE INDEX IF NOT EXISTS idx_ralph_tasks_updated
      ON ralph_tasks (updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ralph_tasks_board
      ON ralph_tasks (is_archived, updated_at DESC);

    CREATE TABLE IF NOT EXISTS ralph_meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Run schema migrations
  runMigrations(database);
}

// ---------------------------------------------------------------------------
// Schema migrations
// ---------------------------------------------------------------------------

function runMigrations(database: Database.Database): void {
  const version = getSchemaVersion(database);

  if (version < 1) {
    migrateV1TaskNumbers(database);
    setSchemaVersion(database, 1);
  }

  if (version < 2) {
    migrateV2Projects(database);
    setSchemaVersion(database, 2);
  }

  if (version < 3) {
    migrateV3Playbooks(database);
    setSchemaVersion(database, 3);
  }
}

function getSchemaVersion(database: Database.Database): number {
  const row = database
    .prepare('SELECT value FROM ralph_meta WHERE key = ?')
    .get('schema_version') as { value: string } | undefined;
  return row ? parseInt(row.value, 10) : 0;
}

function setSchemaVersion(database: Database.Database, version: number): void {
  database
    .prepare('INSERT OR REPLACE INTO ralph_meta (key, value) VALUES (?, ?)')
    .run('schema_version', String(version));
}

/** V1: Add task_number column + backfill existing tasks */
function migrateV1TaskNumbers(database: Database.Database): void {
  console.log('[RALPH TASK DB] Running migration v1: task numbers');

  // Add column (idempotent — check if it exists)
  const cols = database.prepare('PRAGMA table_info(ralph_tasks)').all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === 'task_number')) {
    database.exec('ALTER TABLE ralph_tasks ADD COLUMN task_number INTEGER');
  }

  database.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_ralph_tasks_number ON ralph_tasks (task_number)'
  );

  // Backfill existing tasks ordered by created_at, id
  const unassigned = database
    .prepare('SELECT id FROM ralph_tasks WHERE task_number IS NULL ORDER BY created_at ASC, id ASC')
    .all() as Array<{ id: string }>;

  if (unassigned.length > 0) {
    // Find current max task number
    const maxRow = database.prepare('SELECT MAX(task_number) as m FROM ralph_tasks').get() as {
      m: number | null;
    };
    let nextNum = (maxRow.m ?? 0) + 1;

    const update = database.prepare('UPDATE ralph_tasks SET task_number = ? WHERE id = ?');
    const backfill = database.transaction(() => {
      for (const row of unassigned) {
        update.run(nextNum, row.id);
        nextNum++;
      }
    });
    backfill();

    // Store next number in meta
    database
      .prepare('INSERT OR REPLACE INTO ralph_meta (key, value) VALUES (?, ?)')
      .run('next_task_number', String(nextNum));

    console.log(`[RALPH TASK DB] Backfilled ${unassigned.length} task numbers`);
  } else {
    // No tasks — start at 1
    const existing = database
      .prepare('SELECT value FROM ralph_meta WHERE key = ?')
      .get('next_task_number') as { value: string } | undefined;
    if (!existing) {
      database
        .prepare('INSERT OR REPLACE INTO ralph_meta (key, value) VALUES (?, ?)')
        .run('next_task_number', '1');
    }
  }
}

/** V2: Add ralph_projects table and project_id column on tasks */
function migrateV2Projects(database: Database.Database): void {
  console.log('[RALPH TASK DB] Running migration v2: projects');

  database.exec(`
    CREATE TABLE IF NOT EXISTS ralph_projects (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL UNIQUE,
      color      TEXT DEFAULT '#6366f1',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Add project_id column to tasks (idempotent)
  const cols = database.prepare('PRAGMA table_info(ralph_tasks)').all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === 'project_id')) {
    database.exec('ALTER TABLE ralph_tasks ADD COLUMN project_id TEXT');
  }

  database.exec('CREATE INDEX IF NOT EXISTS idx_ralph_tasks_project ON ralph_tasks (project_id)');
}

/** V3: Add ralph_playbooks table and playbook_id column on tasks */
function migrateV3Playbooks(database: Database.Database): void {
  console.log('[RALPH TASK DB] Running migration v3: playbooks');

  database.exec(`
    CREATE TABLE IF NOT EXISTS ralph_playbooks (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL UNIQUE,
      description TEXT DEFAULT '',
      stage_ids   TEXT NOT NULL DEFAULT '[]',
      is_default  INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );
  `);

  // Add playbook_id column to tasks (idempotent)
  const cols = database.prepare('PRAGMA table_info(ralph_tasks)').all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === 'playbook_id')) {
    database.exec('ALTER TABLE ralph_tasks ADD COLUMN playbook_id TEXT');
  }

  database.exec('CREATE INDEX IF NOT EXISTS idx_ralph_tasks_playbook ON ralph_tasks (playbook_id)');

  // Seed default playbooks if table is empty
  const count = database.prepare('SELECT COUNT(*) as c FROM ralph_playbooks').get() as {
    c: number;
  };
  if (count.c === 0) {
    const now = new Date().toISOString();
    database
      .prepare(
        `INSERT INTO ralph_playbooks (id, name, description, stage_ids, is_default, created_at, updated_at)
       VALUES (@id, @name, @description, @stage_ids, @is_default, @created_at, @updated_at)`
      )
      .run({
        id: `pb-${Date.now().toString(36)}-seed1`,
        name: 'Full Pipeline',
        description: 'All stages in order',
        stage_ids: JSON.stringify(['triage', 'planning', 'research', 'ready', 'executing']),
        is_default: 1,
        created_at: now,
        updated_at: now,
      });
    database
      .prepare(
        `INSERT INTO ralph_playbooks (id, name, description, stage_ids, is_default, created_at, updated_at)
       VALUES (@id, @name, @description, @stage_ids, @is_default, @created_at, @updated_at)`
      )
      .run({
        id: `pb-${Date.now().toString(36)}-seed2`,
        name: 'Shotgun',
        description: 'Skip planning and research — triage then execute',
        stage_ids: JSON.stringify(['triage', 'executing']),
        is_default: 0,
        created_at: now,
        updated_at: now,
      });
    console.log('[RALPH TASK DB] Seeded default playbooks');
  }
}

// ---------------------------------------------------------------------------
// Auto-migration from JSON files
// ---------------------------------------------------------------------------

function migratePromptToDescription(task: Record<string, unknown>): void {
  if (task.description === undefined && task.prompt !== undefined) {
    task.description = task.prompt;
  }
}

function autoMigrateFromJson(database: Database.Database): void {
  // Check if already migrated
  const meta = database
    .prepare('SELECT value FROM ralph_meta WHERE key = ?')
    .get('migrated_from_json') as { value: string } | undefined;
  if (meta) return;

  const tasksDir = getRalphTasksDir();
  if (!existsSync(tasksDir)) {
    // No JSON files to migrate — mark as migrated
    database
      .prepare('INSERT INTO ralph_meta (key, value) VALUES (?, ?)')
      .run('migrated_from_json', new Date().toISOString());
    return;
  }

  console.log('[RALPH TASK DB] Starting migration from JSON files');

  let files: string[];
  try {
    files = readdirSync(tasksDir).filter((f) => f.endsWith('.json') && !f.startsWith('_'));
  } catch {
    files = [];
  }

  if (files.length === 0) {
    database
      .prepare('INSERT INTO ralph_meta (key, value) VALUES (?, ?)')
      .run('migrated_from_json', new Date().toISOString());
    console.log('[RALPH TASK DB] No JSON files found, migration skipped');
    return;
  }

  const insert = database.prepare(`
    INSERT OR IGNORE INTO ralph_tasks
      (id, title, workspace_id, status, is_archived, parent_id, subtask_order,
       delivery_method, execution_job_id, task_number, project_id, playbook_id,
       created_at, updated_at, completed_at, data)
    VALUES
      (@id, @title, @workspace_id, @status, @is_archived, @parent_id, @subtask_order,
       @delivery_method, @execution_job_id, @task_number, @project_id, @playbook_id,
       @created_at, @updated_at, @completed_at, @data)
  `);

  let migrated = 0;
  let errors = 0;

  const runMigration = database.transaction(() => {
    for (const file of files) {
      try {
        const filePath = resolve(tasksDir, file);
        const content = readFileSync(filePath, 'utf-8');
        const raw = JSON.parse(content) as Record<string, unknown>;

        // Apply lazy migration
        migratePromptToDescription(raw);

        const parseResult = RalphTaskSchema.safeParse(raw);
        if (!parseResult.success) {
          console.warn(`[RALPH TASK DB] Invalid task file ${file}:`, parseResult.error.message);
          errors++;
          continue;
        }

        const task = parseResult.data;
        insert.run({
          id: task.id,
          title: task.title,
          workspace_id: task.workspaceId,
          status: task.status,
          is_archived: task.isArchived ? 1 : 0,
          parent_id: task.parentId ?? null,
          subtask_order: task.subtaskOrder ?? task.storyOrder ?? null,
          delivery_method: task.deliveryMethod ?? 'merge-request',
          execution_job_id: task.executionJobId ?? null,
          task_number: task.taskNumber ?? null,
          project_id: task.projectId ?? null,
          playbook_id: task.playbookId ?? null,
          created_at: task.createdAt,
          updated_at: task.updatedAt,
          completed_at: task.completedAt ?? null,
          data: JSON.stringify(task),
        });
        migrated++;
      } catch (err) {
        console.warn(`[RALPH TASK DB] Error migrating file ${file}:`, err);
        errors++;
      }
    }

    database
      .prepare('INSERT INTO ralph_meta (key, value) VALUES (?, ?)')
      .run('migrated_from_json', new Date().toISOString());
  });

  runMigration();
  console.log(`[RALPH TASK DB] Migration complete: ${migrated} tasks migrated, ${errors} errors`);
}

// ---------------------------------------------------------------------------
// Prepared statement cache
// ---------------------------------------------------------------------------

interface StmtCache {
  insert: Database.Statement;
  getById: Database.Statement;
  updateData: Database.Statement;
  deleteById: Database.Statement;
  exists: Database.Statement;
  boardTasks: Database.Statement;
  boardTasksArchived: Database.Statement;
  boardTasksAll: Database.Statement;
  childCount: Database.Statement;
  childStats: Database.Statement;
  deleteByWorkspace: Database.Statement;
  tasksByParent: Database.Statement;
  getStatusById: Database.Statement;
}

let stmts: StmtCache | null = null;

function getStmts(): StmtCache {
  if (stmts) return stmts;
  const database = getDb();

  stmts = {
    insert: database.prepare(`
      INSERT INTO ralph_tasks
        (id, title, workspace_id, status, is_archived, parent_id, subtask_order,
         delivery_method, execution_job_id, task_number, project_id, playbook_id,
         created_at, updated_at, completed_at, data)
      VALUES
        (@id, @title, @workspace_id, @status, @is_archived, @parent_id, @subtask_order,
         @delivery_method, @execution_job_id, @task_number, @project_id, @playbook_id,
         @created_at, @updated_at, @completed_at, @data)
    `),

    getById: database.prepare('SELECT data FROM ralph_tasks WHERE id = ?'),

    updateData: database.prepare(`
      UPDATE ralph_tasks SET
        title = @title,
        workspace_id = @workspace_id,
        status = @status,
        is_archived = @is_archived,
        parent_id = @parent_id,
        subtask_order = @subtask_order,
        delivery_method = @delivery_method,
        execution_job_id = @execution_job_id,
        task_number = @task_number,
        project_id = @project_id,
        playbook_id = @playbook_id,
        created_at = @created_at,
        updated_at = @updated_at,
        completed_at = @completed_at,
        data = @data
      WHERE id = @id
    `),

    deleteById: database.prepare('DELETE FROM ralph_tasks WHERE id = ?'),

    exists: database.prepare('SELECT 1 FROM ralph_tasks WHERE id = ?'),

    boardTasks: database.prepare(`
      SELECT data FROM ralph_tasks
      WHERE is_archived = 0
      ORDER BY updated_at DESC
    `),

    boardTasksArchived: database.prepare(`
      SELECT data FROM ralph_tasks
      WHERE is_archived = 1
      ORDER BY updated_at DESC
    `),

    boardTasksAll: database.prepare(`
      SELECT data FROM ralph_tasks
      ORDER BY updated_at DESC
    `),

    childCount: database.prepare('SELECT COUNT(*) as count FROM ralph_tasks WHERE parent_id = ?'),

    childStats: database.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'executing' THEN 1 ELSE 0 END) as executing_count,
        SUM(CASE WHEN status = 'complete' THEN 1 ELSE 0 END) as completed_count,
        SUM(CASE WHEN status = 'ready' THEN 1 ELSE 0 END) as ready_count,
        SUM(CASE WHEN status NOT IN ('executing', 'complete', 'ready') THEN 1 ELSE 0 END) as pending_count
      FROM ralph_tasks
      WHERE parent_id = ?
    `),

    deleteByWorkspace: database.prepare('DELETE FROM ralph_tasks WHERE workspace_id = ?'),

    tasksByParent: database.prepare(`
      SELECT data FROM ralph_tasks
      WHERE parent_id = ?
      ORDER BY subtask_order ASC, created_at ASC
    `),

    getStatusById: database.prepare('SELECT status FROM ralph_tasks WHERE id = ?'),
  };

  return stmts;
}

// ---------------------------------------------------------------------------
// Row helpers
// ---------------------------------------------------------------------------

interface DataRow {
  data: string;
}

interface StatusRow {
  status: string;
}

interface CountRow {
  count: number;
}

interface ChildStatsRow {
  total: number;
  executing_count: number;
  completed_count: number;
  ready_count: number;
  pending_count: number;
}

function taskParams(task: RalphTask) {
  return {
    id: task.id,
    title: task.title,
    workspace_id: task.workspaceId,
    status: task.status,
    is_archived: task.isArchived ? 1 : 0,
    parent_id: task.parentId ?? null,
    subtask_order: task.subtaskOrder ?? task.storyOrder ?? null,
    delivery_method: task.deliveryMethod ?? 'merge-request',
    execution_job_id: task.executionJobId ?? null,
    task_number: task.taskNumber ?? null,
    project_id: task.projectId ?? null,
    playbook_id: task.playbookId ?? null,
    created_at: task.createdAt,
    updated_at: task.updatedAt,
    completed_at: task.completedAt ?? null,
    data: JSON.stringify(task),
  };
}

function parseTask(row: DataRow): RalphTask {
  return JSON.parse(row.data) as RalphTask;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Atomically get the next task number and increment the counter.
 */
export function dbNextTaskNumber(): number {
  const database = getDb();
  let result: number = 0;
  database.transaction(() => {
    const row = database
      .prepare("SELECT value FROM ralph_meta WHERE key = 'next_task_number'")
      .get() as { value: string } | undefined;
    result = row ? parseInt(row.value, 10) : 1;
    database
      .prepare("INSERT OR REPLACE INTO ralph_meta (key, value) VALUES ('next_task_number', ?)")
      .run(String(result + 1));
  })();
  return result;
}

export function dbInsertTask(task: RalphTask): void {
  getStmts().insert.run(taskParams(task));
}

export function dbGetTask(id: string): RalphTask | null {
  const row = getStmts().getById.get(id) as DataRow | undefined;
  return row ? parseTask(row) : null;
}

export function dbUpdateTask(task: RalphTask): void {
  getStmts().updateData.run(taskParams(task));
}

export function dbDeleteTask(id: string): boolean {
  const result = getStmts().deleteById.run(id);
  return result.changes > 0;
}

export function dbTaskExists(id: string): boolean {
  return getStmts().exists.get(id) !== undefined;
}

export function dbGetTaskStatus(id: string): string | null {
  const row = getStmts().getStatusById.get(id) as StatusRow | undefined;
  return row ? row.status : null;
}

/**
 * Get all tasks for the board display.
 * Returns parsed RalphTask objects sorted by updatedAt DESC.
 */
export function dbGetBoardTasks(options: {
  includeArchived?: boolean;
  archivedOnly?: boolean;
}): RalphTask[] {
  const s = getStmts();
  let rows: DataRow[];

  if (options.archivedOnly) {
    rows = s.boardTasksArchived.all() as DataRow[];
  } else if (options.includeArchived) {
    rows = s.boardTasksAll.all() as DataRow[];
  } else {
    rows = s.boardTasks.all() as DataRow[];
  }

  return rows.map(parseTask);
}

/**
 * Get all tasks as index entries (lightweight summary data).
 * This replaces the old JSON index.
 */
export function dbGetAllIndexEntries(): RalphTaskIndexEntry[] {
  const database = getDb();
  const rows = database
    .prepare(
      `SELECT id, title, workspace_id, status, is_archived, parent_id, subtask_order,
              task_number, project_id, playbook_id, updated_at,
              (SELECT COUNT(*) FROM ralph_tasks c WHERE c.parent_id = ralph_tasks.id) as child_count,
              json_extract(data, '$.blockedBy') as blocked_by_json
       FROM ralph_tasks
       ORDER BY updated_at DESC`
    )
    .all() as Array<{
    id: string;
    title: string;
    workspace_id: string;
    status: string;
    is_archived: number;
    parent_id: string | null;
    subtask_order: number | null;
    task_number: number | null;
    project_id: string | null;
    playbook_id: string | null;
    updated_at: string;
    child_count: number;
    blocked_by_json: string | null;
  }>;

  return rows.map((row) => {
    const blockedBy: string[] = row.blocked_by_json
      ? (JSON.parse(row.blocked_by_json) as string[])
      : [];
    return {
      id: row.id,
      title: row.title,
      workspaceId: row.workspace_id,
      status: row.status,
      isSubtask: row.parent_id != null,
      parentId: row.parent_id,
      childCount: row.child_count,
      subtaskOrder: row.subtask_order,
      taskNumber: row.task_number,
      projectId: row.project_id,
      playbookId: row.playbook_id,
      isArchived: row.is_archived === 1,
      blockedByCount: blockedBy.length,
      updatedAt: row.updated_at,
    };
  });
}

/**
 * Get child task statistics for a parent (used for feature execution status).
 */
export function dbGetChildStats(parentId: string): ChildStatsRow {
  return getStmts().childStats.get(parentId) as ChildStatsRow;
}

/**
 * Get child count for a parent task.
 */
export function dbGetChildCount(parentId: string): number {
  const row = getStmts().childCount.get(parentId) as CountRow;
  return row.count;
}

/**
 * Get child tasks for a parent.
 */
export function dbGetChildTasks(parentId: string): RalphTask[] {
  const rows = getStmts().tasksByParent.all(parentId) as DataRow[];
  return rows.map(parseTask);
}

/**
 * Delete all tasks for a workspace. Returns count of deleted rows.
 */
export function dbDeleteByWorkspace(workspaceId: string): number {
  const result = getStmts().deleteByWorkspace.run(workspaceId);
  return result.changes;
}

/**
 * Wrap multiple operations in a transaction.
 */
export function dbTransaction<T>(fn: () => T): T {
  const database = getDb();
  return database.transaction(fn)();
}

// ---------------------------------------------------------------------------
// Project CRUD
// ---------------------------------------------------------------------------

export interface DbProject {
  id: string;
  name: string;
  color: string;
  created_at: string;
  updated_at: string;
}

export function dbCreateProject(project: DbProject): void {
  const database = getDb();
  database
    .prepare(
      `INSERT INTO ralph_projects (id, name, color, created_at, updated_at)
     VALUES (@id, @name, @color, @created_at, @updated_at)`
    )
    .run(project);
}

export function dbListProjects(): DbProject[] {
  const database = getDb();
  return database
    .prepare('SELECT id, name, color, created_at, updated_at FROM ralph_projects ORDER BY name ASC')
    .all() as DbProject[];
}

export function dbGetProject(id: string): DbProject | null {
  const database = getDb();
  return (
    (database
      .prepare('SELECT id, name, color, created_at, updated_at FROM ralph_projects WHERE id = ?')
      .get(id) as DbProject | undefined) ?? null
  );
}

export function dbUpdateProject(id: string, updates: { name?: string; color?: string }): boolean {
  const database = getDb();
  const now = new Date().toISOString();
  const sets: string[] = ['updated_at = ?'];
  const values: unknown[] = [now];

  if (updates.name !== undefined) {
    sets.push('name = ?');
    values.push(updates.name);
  }
  if (updates.color !== undefined) {
    sets.push('color = ?');
    values.push(updates.color);
  }

  values.push(id);
  const result = database
    .prepare(`UPDATE ralph_projects SET ${sets.join(', ')} WHERE id = ?`)
    .run(...values);
  return result.changes > 0;
}

export function dbDeleteProject(id: string): boolean {
  const database = getDb();
  return database.transaction(() => {
    // Nullify project_id on tasks
    database.prepare('UPDATE ralph_tasks SET project_id = NULL WHERE project_id = ?').run(id);
    // Also update the JSON data blob for those tasks
    const affected = database
      .prepare("SELECT id, data FROM ralph_tasks WHERE json_extract(data, '$.projectId') = ?")
      .all(id) as Array<{ id: string; data: string }>;
    for (const row of affected) {
      const parsed = JSON.parse(row.data) as Record<string, unknown>;
      parsed.projectId = null;
      database
        .prepare('UPDATE ralph_tasks SET data = ? WHERE id = ?')
        .run(JSON.stringify(parsed), row.id);
    }
    const result = database.prepare('DELETE FROM ralph_projects WHERE id = ?').run(id);
    return result.changes > 0;
  })();
}

// ---------------------------------------------------------------------------
// Playbook CRUD
// ---------------------------------------------------------------------------

export interface DbPlaybook {
  id: string;
  name: string;
  description: string;
  stage_ids: string; // JSON text
  is_default: number;
  created_at: string;
  updated_at: string;
}

export function dbCreatePlaybook(playbook: DbPlaybook): void {
  const database = getDb();
  database
    .prepare(
      `INSERT INTO ralph_playbooks (id, name, description, stage_ids, is_default, created_at, updated_at)
     VALUES (@id, @name, @description, @stage_ids, @is_default, @created_at, @updated_at)`
    )
    .run(playbook);
}

export function dbListPlaybooks(): DbPlaybook[] {
  const database = getDb();
  return database
    .prepare(
      'SELECT id, name, description, stage_ids, is_default, created_at, updated_at FROM ralph_playbooks ORDER BY name ASC'
    )
    .all() as DbPlaybook[];
}

export function dbGetPlaybook(id: string): DbPlaybook | null {
  const database = getDb();
  return (
    (database
      .prepare(
        'SELECT id, name, description, stage_ids, is_default, created_at, updated_at FROM ralph_playbooks WHERE id = ?'
      )
      .get(id) as DbPlaybook | undefined) ?? null
  );
}

export function dbUpdatePlaybook(
  id: string,
  updates: { name?: string; description?: string; stage_ids?: string; is_default?: number }
): boolean {
  const database = getDb();

  return database.transaction(() => {
    // If setting as default, unset all others first
    if (updates.is_default === 1) {
      database.prepare('UPDATE ralph_playbooks SET is_default = 0 WHERE is_default = 1').run();
    }

    const now = new Date().toISOString();
    const sets: string[] = ['updated_at = ?'];
    const values: unknown[] = [now];

    if (updates.name !== undefined) {
      sets.push('name = ?');
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      sets.push('description = ?');
      values.push(updates.description);
    }
    if (updates.stage_ids !== undefined) {
      sets.push('stage_ids = ?');
      values.push(updates.stage_ids);
    }
    if (updates.is_default !== undefined) {
      sets.push('is_default = ?');
      values.push(updates.is_default);
    }

    values.push(id);
    const result = database
      .prepare(`UPDATE ralph_playbooks SET ${sets.join(', ')} WHERE id = ?`)
      .run(...values);
    return result.changes > 0;
  })();
}

export function dbDeletePlaybook(id: string): boolean {
  const database = getDb();
  return database.transaction(() => {
    // Nullify playbook_id on tasks
    database.prepare('UPDATE ralph_tasks SET playbook_id = NULL WHERE playbook_id = ?').run(id);
    // Also update the JSON data blob for those tasks
    const affected = database
      .prepare("SELECT id, data FROM ralph_tasks WHERE json_extract(data, '$.playbookId') = ?")
      .all(id) as Array<{ id: string; data: string }>;
    for (const row of affected) {
      const parsed = JSON.parse(row.data) as Record<string, unknown>;
      parsed.playbookId = null;
      database
        .prepare('UPDATE ralph_tasks SET data = ? WHERE id = ?')
        .run(JSON.stringify(parsed), row.id);
    }
    const result = database.prepare('DELETE FROM ralph_playbooks WHERE id = ?').run(id);
    return result.changes > 0;
  })();
}

/**
 * Close the database connection gracefully.
 */
export function dbClose(): void {
  if (db) {
    db.close();
    db = null;
    stmts = null;
  }
}
