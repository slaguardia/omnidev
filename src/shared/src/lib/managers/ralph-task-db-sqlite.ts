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

  if (version < 4) {
    migrateV4PlaybookPromptOverrides(database);
    setSchemaVersion(database, 4);
  }

  if (version < 5) {
    migrateV5Jobs(database);
    setSchemaVersion(database, 5);
  }

  if (version < 6) {
    migrateV6StageTokens(database);
    setSchemaVersion(database, 6);
  }

  if (version < 7) {
    migrateV7AgentEvents(database);
    setSchemaVersion(database, 7);
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

/** V5: Add jobs + agent_runs tables (ported from omnidev.db) */
function migrateV5Jobs(database: Database.Database): void {
  console.log('[RALPH TASK DB] Running migration v5: jobs + agent_runs tables');

  database.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id            TEXT PRIMARY KEY,
      task_id       TEXT NOT NULL,
      agent_type    TEXT NOT NULL DEFAULT 'coding-agent',
      status        TEXT NOT NULL DEFAULT 'pending',
      payload       TEXT NOT NULL DEFAULT '{}',
      result        TEXT,
      error         TEXT,
      started_at    TEXT,
      heartbeat_at  TEXT,
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (status);
    CREATE INDEX IF NOT EXISTS idx_jobs_task ON jobs (task_id);

    CREATE TABLE IF NOT EXISTS agent_runs (
      id            TEXT PRIMARY KEY,
      job_id        TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'running',
      logs          TEXT NOT NULL DEFAULT '',
      started_at    TEXT NOT NULL,
      completed_at  TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_agent_runs_job ON agent_runs (job_id);
  `);
}

/**
 * V7: Add agent_events table + per-run summary columns on agent_runs.
 *
 * agent_events is a row-per-event timeline emitted by the streaming
 * AgentRunner during a single run. seq is monotonic per-run (not global) so
 * concurrent runs do not contend on a global sequence; the unique index on
 * (run_id, seq) catches any application-side bug that produces duplicates
 * within one run.
 */
function migrateV7AgentEvents(database: Database.Database): void {
  console.log('[RALPH TASK DB] Running migration v7: agent_events + agent_runs summary fields');

  // New columns on agent_runs (idempotent — check before adding).
  const cols = database.prepare('PRAGMA table_info(agent_runs)').all() as Array<{ name: string }>;
  const colNames = new Set(cols.map((c) => c.name));
  const additions: Array<[string, string]> = [
    ['model', 'TEXT'],
    ['input_tokens', 'INTEGER'],
    ['output_tokens', 'INTEGER'],
    ['total_tokens', 'INTEGER'],
    ['cost_cents', 'INTEGER'],
    ['cancellation_requested_at', 'TEXT'],
  ];
  for (const [name, type] of additions) {
    if (!colNames.has(name)) {
      database.exec(`ALTER TABLE agent_runs ADD COLUMN ${name} ${type}`);
    }
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS agent_events (
      id         TEXT PRIMARY KEY,
      run_id     TEXT NOT NULL,
      seq        INTEGER NOT NULL,
      type       TEXT NOT NULL,
      payload    TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (run_id) REFERENCES agent_runs (id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_agent_events_run_seq ON agent_events (run_id, seq);
    CREATE INDEX IF NOT EXISTS idx_agent_events_run_type ON agent_events (run_id, type);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_events_run_seq_unique ON agent_events (run_id, seq);
  `);
}

/** V6: Add stage_tokens table for scoped CLI tokens */
function migrateV6StageTokens(database: Database.Database): void {
  console.log('[RALPH TASK DB] Running migration v6: stage_tokens');

  database.exec(`
    CREATE TABLE IF NOT EXISTS stage_tokens (
      id          TEXT PRIMARY KEY,
      token_hash  TEXT NOT NULL UNIQUE,
      job_id      TEXT NOT NULL,
      task_id     TEXT NOT NULL,
      permissions TEXT NOT NULL,
      expires_at  TEXT NOT NULL,
      revoked     INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL,
      revoked_at  TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_stage_tokens_hash ON stage_tokens (token_hash);
    CREATE INDEX IF NOT EXISTS idx_stage_tokens_job ON stage_tokens (job_id);
  `);
}

/** V4: Add prompt_overrides column to playbooks */
function migrateV4PlaybookPromptOverrides(database: Database.Database): void {
  console.log('[RALPH TASK DB] Running migration v4: playbook prompt overrides');

  const cols = database.prepare('PRAGMA table_info(ralph_playbooks)').all() as Array<{
    name: string;
  }>;
  if (!cols.some((c) => c.name === 'prompt_overrides')) {
    database.exec("ALTER TABLE ralph_playbooks ADD COLUMN prompt_overrides TEXT DEFAULT '{}'");
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

  // Job statements
  insertJob: Database.Statement;
  getJob: Database.Statement;
  listJobs: Database.Statement;
  listJobsByTask: Database.Statement;
  claimJob: Database.Statement;
  nextPendingJob: Database.Statement;
  heartbeatJob: Database.Statement;

  // Agent run statements
  insertAgentRun: Database.Statement;
  agentRunsByJob: Database.Statement;

  // Agent event statements
  insertAgentEvent: Database.Statement;
  agentEventsByRun: Database.Statement;
  agentEventsByRunFromSeq: Database.Statement;
  agentEventsByRunAndType: Database.Statement;

  // Stage token statements
  insertStageToken: Database.Statement;
  getStageTokenByHash: Database.Statement;
  revokeTokensByJob: Database.Statement;
  revokeExpiredTokens: Database.Statement;
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

    // Job statements
    insertJob: database.prepare(`
      INSERT INTO jobs (id, task_id, agent_type, status, payload, result, error, created_at, updated_at)
      VALUES (@id, @task_id, @agent_type, @status, @payload, @result, @error, @created_at, @updated_at)
    `),
    getJob: database.prepare('SELECT * FROM jobs WHERE id = ?'),
    listJobs: database.prepare('SELECT * FROM jobs ORDER BY created_at DESC'),
    listJobsByTask: database.prepare(
      'SELECT * FROM jobs WHERE task_id = ? ORDER BY created_at DESC'
    ),
    claimJob: database.prepare(
      "UPDATE jobs SET status = 'running', started_at = ?, heartbeat_at = ?, updated_at = ? WHERE id = ? AND status = 'pending'"
    ),
    nextPendingJob: database.prepare(
      "SELECT * FROM jobs WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1"
    ),
    heartbeatJob: database.prepare(
      "UPDATE jobs SET heartbeat_at = ? WHERE id = ? AND status = 'running'"
    ),

    // Agent run statements
    insertAgentRun: database.prepare(`
      INSERT INTO agent_runs (id, job_id, status, logs, started_at, completed_at)
      VALUES (@id, @job_id, @status, @logs, @started_at, @completed_at)
    `),
    agentRunsByJob: database.prepare(
      'SELECT * FROM agent_runs WHERE job_id = ? ORDER BY started_at DESC'
    ),

    // Agent event statements
    insertAgentEvent: database.prepare(`
      INSERT INTO agent_events (id, run_id, seq, type, payload, created_at)
      VALUES (@id, @run_id, @seq, @type, @payload, @created_at)
    `),
    agentEventsByRun: database.prepare(
      'SELECT * FROM agent_events WHERE run_id = ? ORDER BY seq ASC'
    ),
    agentEventsByRunFromSeq: database.prepare(
      'SELECT * FROM agent_events WHERE run_id = ? AND seq > ? ORDER BY seq ASC'
    ),
    agentEventsByRunAndType: database.prepare(
      'SELECT * FROM agent_events WHERE run_id = ? AND type = ? ORDER BY seq ASC'
    ),

    // Stage token statements
    insertStageToken: database.prepare(`
      INSERT INTO stage_tokens (id, token_hash, job_id, task_id, permissions, expires_at, revoked, created_at)
      VALUES (@id, @token_hash, @job_id, @task_id, @permissions, @expires_at, 0, @created_at)
    `),
    getStageTokenByHash: database.prepare(
      'SELECT * FROM stage_tokens WHERE token_hash = ? AND revoked = 0'
    ),
    revokeTokensByJob: database.prepare(
      'UPDATE stage_tokens SET revoked = 1, revoked_at = ? WHERE job_id = ? AND revoked = 0'
    ),
    revokeExpiredTokens: database.prepare(
      'UPDATE stage_tokens SET revoked = 1, revoked_at = ? WHERE revoked = 0 AND expires_at < ?'
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
  prompt_overrides: string; // JSON text: Record<stageId, promptTemplate>
  is_default: number;
  created_at: string;
  updated_at: string;
}

export function dbCreatePlaybook(playbook: DbPlaybook): void {
  const database = getDb();
  database
    .prepare(
      `INSERT INTO ralph_playbooks (id, name, description, stage_ids, prompt_overrides, is_default, created_at, updated_at)
     VALUES (@id, @name, @description, @stage_ids, @prompt_overrides, @is_default, @created_at, @updated_at)`
    )
    .run(playbook);
}

export function dbListPlaybooks(): DbPlaybook[] {
  const database = getDb();
  return database
    .prepare(
      'SELECT id, name, description, stage_ids, prompt_overrides, is_default, created_at, updated_at FROM ralph_playbooks ORDER BY name ASC'
    )
    .all() as DbPlaybook[];
}

export function dbGetPlaybook(id: string): DbPlaybook | null {
  const database = getDb();
  return (
    (database
      .prepare(
        'SELECT id, name, description, stage_ids, prompt_overrides, is_default, created_at, updated_at FROM ralph_playbooks WHERE id = ?'
      )
      .get(id) as DbPlaybook | undefined) ?? null
  );
}

export function dbUpdatePlaybook(
  id: string,
  updates: {
    name?: string;
    description?: string;
    stage_ids?: string;
    prompt_overrides?: string;
    is_default?: number;
  }
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
    if (updates.prompt_overrides !== undefined) {
      sets.push('prompt_overrides = ?');
      values.push(updates.prompt_overrides);
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

// ---------------------------------------------------------------------------
// Job types (unified — replaces OmnidevJob/OmnidevAgentRun from lib/db)
// ---------------------------------------------------------------------------

export type RalphJobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface RalphJob {
  id: string;
  task_id: string;
  agent_type: string;
  status: RalphJobStatus;
  payload: string; // JSON
  result: string | null;
  error: string | null;
  started_at: string | null;
  heartbeat_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RalphAgentRun {
  id: string;
  job_id: string;
  status: string;
  logs: string;
  started_at: string;
  completed_at: string | null;
  // Per-run summary fields populated by the streaming AgentRunner. The
  // detailed timeline lives in the agent_events table.
  model?: string | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  total_tokens?: number | null;
  cost_cents?: number | null;
  cancellation_requested_at?: string | null;
}

/**
 * Single event row emitted by an AgentRunner during a run. seq is monotonic
 * per-run (not global) so concurrent runs cannot collide on (run_id, seq).
 */
export interface RalphAgentEvent {
  id: string;
  run_id: string;
  seq: number;
  type: string;
  /** JSON-encoded variant payload. Decoded by callers using the AgentEvent
   *  discriminated union from src/shared/src/lib/agent/types.ts. */
  payload: string;
  created_at: string;
}

/**
 * Partial fields used to update the per-run summary on agent_runs (model,
 * token counts, cost, cancellation marker). All fields are optional and
 * unspecified fields are left unchanged.
 */
export interface RalphAgentRunSummaryUpdate {
  model?: string | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  total_tokens?: number | null;
  cost_cents?: number | null;
  cancellation_requested_at?: string | null;
}

// ---------------------------------------------------------------------------
// Job CRUD
// ---------------------------------------------------------------------------

export function dbCreateJob(job: RalphJob): void {
  getStmts().insertJob.run({
    id: job.id,
    task_id: job.task_id,
    agent_type: job.agent_type,
    status: job.status,
    payload: job.payload,
    result: job.result,
    error: job.error,
    created_at: job.created_at,
    updated_at: job.updated_at,
  });
}

export function dbGetJob(id: string): RalphJob | null {
  return (getStmts().getJob.get(id) as RalphJob | undefined) ?? null;
}

/**
 * Atomically claim the next pending job.
 * Prevents two worker instances from grabbing the same job.
 */
export function dbClaimNextPendingJob(): RalphJob | null {
  const database = getDb();
  const s = getStmts();
  const now = new Date().toISOString();

  let claimed: RalphJob | null = null;

  database.transaction(() => {
    const row = s.nextPendingJob.get() as RalphJob | undefined;
    if (!row) return;

    const result = s.claimJob.run(now, now, now, row.id);
    if (result.changes > 0) {
      claimed = { ...row, status: 'running', started_at: now, heartbeat_at: now, updated_at: now };
    }
  })();

  return claimed;
}

export function dbUpdateJob(
  id: string,
  updates: Partial<Pick<RalphJob, 'status' | 'result' | 'error'>>
): boolean {
  const database = getDb();
  const now = new Date().toISOString();
  const sets: string[] = ['updated_at = ?'];
  const values: unknown[] = [now];

  if (updates.status !== undefined) {
    sets.push('status = ?');
    values.push(updates.status);
  }
  if (updates.result !== undefined) {
    sets.push('result = ?');
    values.push(updates.result);
  }
  if (updates.error !== undefined) {
    sets.push('error = ?');
    values.push(updates.error);
  }

  values.push(id);
  const result = database.prepare(`UPDATE jobs SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return result.changes > 0;
}

export function dbListJobs(filters?: { task_id?: string }): RalphJob[] {
  if (filters?.task_id) {
    return getStmts().listJobsByTask.all(filters.task_id) as RalphJob[];
  }
  return getStmts().listJobs.all() as RalphJob[];
}

/**
 * Update heartbeat timestamp for a running job.
 */
export function dbHeartbeatJob(jobId: string): boolean {
  const now = new Date().toISOString();
  const result = getStmts().heartbeatJob.run(now, jobId);
  return result.changes > 0;
}

/**
 * Mark stale running jobs as failed.
 * Returns the number of recovered jobs.
 */
export function dbRecoverStaleJobs(cutoffIso: string): number {
  const database = getDb();
  const now = new Date().toISOString();
  const result = database
    .prepare(
      `UPDATE jobs
       SET status = 'failed', error = 'Job timed out (no heartbeat for 10+ minutes)', updated_at = ?
       WHERE status = 'running' AND (heartbeat_at IS NULL OR heartbeat_at < ?)`
    )
    .run(now, cutoffIso);
  return result.changes;
}

export interface WorkerHealth {
  pendingJobs: number;
  runningJobs: number;
  lastHeartbeat: string | null;
}

export function dbGetWorkerHealth(): WorkerHealth {
  const database = getDb();
  const row = database
    .prepare(
      `SELECT
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_jobs,
         SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS running_jobs,
         MAX(CASE WHEN status = 'running' THEN heartbeat_at ELSE NULL END) AS last_heartbeat
       FROM jobs`
    )
    .get() as { pending_jobs: number; running_jobs: number; last_heartbeat: string | null };
  return {
    pendingJobs: row.pending_jobs || 0,
    runningJobs: row.running_jobs || 0,
    lastHeartbeat: row.last_heartbeat || null,
  };
}

// ---------------------------------------------------------------------------
// Agent Run CRUD
// ---------------------------------------------------------------------------

export function dbCreateAgentRun(run: RalphAgentRun): void {
  getStmts().insertAgentRun.run({
    id: run.id,
    job_id: run.job_id,
    status: run.status,
    logs: run.logs,
    started_at: run.started_at,
    completed_at: run.completed_at,
  });
}

export function dbUpdateAgentRun(
  id: string,
  updates: Partial<Pick<RalphAgentRun, 'status' | 'logs' | 'completed_at'>>
): boolean {
  const database = getDb();
  const sets: string[] = [];
  const values: unknown[] = [];

  if (updates.status !== undefined) {
    sets.push('status = ?');
    values.push(updates.status);
  }
  if (updates.logs !== undefined) {
    sets.push('logs = ?');
    values.push(updates.logs);
  }
  if (updates.completed_at !== undefined) {
    sets.push('completed_at = ?');
    values.push(updates.completed_at);
  }

  if (sets.length === 0) return false;

  values.push(id);
  const result = database
    .prepare(`UPDATE agent_runs SET ${sets.join(', ')} WHERE id = ?`)
    .run(...values);
  return result.changes > 0;
}

export function dbGetAgentRunsByJob(jobId: string): RalphAgentRun[] {
  return getStmts().agentRunsByJob.all(jobId) as RalphAgentRun[];
}

/**
 * Update the per-run summary fields populated by the streaming AgentRunner
 * (model, token counts, cost, cancellation marker). Unspecified fields are
 * left unchanged. Returns true if a row was updated.
 */
export function dbUpdateAgentRunSummary(id: string, updates: RalphAgentRunSummaryUpdate): boolean {
  const database = getDb();
  const sets: string[] = [];
  const values: unknown[] = [];

  if (updates.model !== undefined) {
    sets.push('model = ?');
    values.push(updates.model);
  }
  if (updates.input_tokens !== undefined) {
    sets.push('input_tokens = ?');
    values.push(updates.input_tokens);
  }
  if (updates.output_tokens !== undefined) {
    sets.push('output_tokens = ?');
    values.push(updates.output_tokens);
  }
  if (updates.total_tokens !== undefined) {
    sets.push('total_tokens = ?');
    values.push(updates.total_tokens);
  }
  if (updates.cost_cents !== undefined) {
    sets.push('cost_cents = ?');
    values.push(updates.cost_cents);
  }
  if (updates.cancellation_requested_at !== undefined) {
    sets.push('cancellation_requested_at = ?');
    values.push(updates.cancellation_requested_at);
  }

  if (sets.length === 0) return false;

  values.push(id);
  const result = database
    .prepare(`UPDATE agent_runs SET ${sets.join(', ')} WHERE id = ?`)
    .run(...values);
  return result.changes > 0;
}

// ---------------------------------------------------------------------------
// Agent Event CRUD
// ---------------------------------------------------------------------------

/**
 * Append a single event to a run's timeline. Caller-provided seq is trusted;
 * the unique index on (run_id, seq) catches application-side bugs that
 * produce duplicates within one run. Concurrent inserts across DIFFERENT
 * runs do not contend because each has a different run_id.
 */
export function dbAppendAgentEvent(event: RalphAgentEvent): void {
  getStmts().insertAgentEvent.run({
    id: event.id,
    run_id: event.run_id,
    seq: event.seq,
    type: event.type,
    payload: event.payload,
    created_at: event.created_at,
  });
}

export interface ListAgentEventsOptions {
  /** Only return events with seq strictly greater than this value. */
  fromSeq?: number;
  /** Only return events with this type. Mutually exclusive with fromSeq. */
  type?: string;
}

/**
 * List events for a run in seq order. Bounded read — backfills the SSE
 * timeline endpoint on initial connect. The (run_id, seq) index makes this
 * an index range scan; readers do not block writers under WAL mode.
 */
export function dbListAgentEvents(
  runId: string,
  options: ListAgentEventsOptions = {}
): RalphAgentEvent[] {
  const stmts = getStmts();
  if (options.type !== undefined) {
    return stmts.agentEventsByRunAndType.all(runId, options.type) as RalphAgentEvent[];
  }
  if (options.fromSeq !== undefined) {
    return stmts.agentEventsByRunFromSeq.all(runId, options.fromSeq) as RalphAgentEvent[];
  }
  return stmts.agentEventsByRun.all(runId) as RalphAgentEvent[];
}

export interface StreamAgentEventsOptions {
  /** Resume from this seq exclusively (only events with seq > fromSeq). */
  fromSeq?: number;
  /** Polling cadence in ms while the run is active. Default 250ms. */
  pollIntervalMs?: number;
  /** Optional abort signal to stop the stream early. */
  signal?: AbortSignal;
}

/**
 * Stream events for a run as an async iterable. Yields all existing events
 * in seq order (backfill), then polls for new events appended after the
 * starting cursor until the run reaches a terminal status (completed,
 * failed, or cancelled). Used by the SSE timeline endpoint in sub-task 8.
 *
 * Polling is the default cross-process strategy (works for both PostgreSQL
 * and SQLite). Postgres LISTEN/NOTIFY is a future optimization layered on
 * top of this same iterator shape.
 */
export async function* dbStreamAgentEvents(
  runId: string,
  options: StreamAgentEventsOptions = {}
): AsyncGenerator<RalphAgentEvent, void, undefined> {
  const pollIntervalMs = options.pollIntervalMs ?? 250;
  let cursor = options.fromSeq ?? -1;

  while (!options.signal?.aborted) {
    const batch = dbListAgentEvents(runId, { fromSeq: cursor });
    for (const event of batch) {
      yield event;
      cursor = event.seq;
    }

    if (options.signal?.aborted) return;

    // Stop streaming once the run reaches a terminal status. Re-poll once
    // more after observing terminal status to capture any events that
    // landed between the last batch and the status read.
    const run = getDb().prepare('SELECT status FROM agent_runs WHERE id = ?').get(runId) as
      | { status: string }
      | undefined;
    const terminal =
      run !== undefined &&
      (run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled');

    if (terminal) {
      const tail = dbListAgentEvents(runId, { fromSeq: cursor });
      for (const event of tail) {
        yield event;
        cursor = event.seq;
      }
      return;
    }

    await sleep(pollIntervalMs);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Stage Token CRUD
// ---------------------------------------------------------------------------

export interface DbStageToken {
  id: string;
  token_hash: string;
  job_id: string;
  task_id: string;
  permissions: string; // JSON array
  expires_at: string;
  revoked: number;
  created_at: string;
  revoked_at: string | null;
}

export function dbInsertStageToken(token: Omit<DbStageToken, 'revoked' | 'revoked_at'>): void {
  getStmts().insertStageToken.run({
    id: token.id,
    token_hash: token.token_hash,
    job_id: token.job_id,
    task_id: token.task_id,
    permissions: token.permissions,
    expires_at: token.expires_at,
    created_at: token.created_at,
  });
}

export function dbGetStageTokenByHash(tokenHash: string): DbStageToken | null {
  return (getStmts().getStageTokenByHash.get(tokenHash) as DbStageToken | undefined) ?? null;
}

export function dbRevokeTokensByJob(jobId: string): number {
  const now = new Date().toISOString();
  const result = getStmts().revokeTokensByJob.run(now, jobId);
  return result.changes;
}

export function dbRevokeExpiredTokens(): number {
  const now = new Date().toISOString();
  const result = getStmts().revokeExpiredTokens.run(now, now);
  return result.changes;
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
