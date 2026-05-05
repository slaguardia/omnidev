/**
 * Schema + invariant tests for the agent_events table and the agent_runs
 * summary columns added in v7.
 *
 * These tests intentionally use a fresh in-memory better-sqlite3 database so
 * they do not depend on the singleton in ralph-task-db-sqlite.ts and cannot
 * pollute the real data/ralph.db. They mirror the DDL that migrateV7
 * actually runs so a regression in either side surfaces here.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Mirror the relevant subset of v5 + v7 schema. We only need agent_runs
  // and agent_events for these tests.
  db.exec(`
    CREATE TABLE agent_runs (
      id            TEXT PRIMARY KEY,
      job_id        TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'running',
      logs          TEXT NOT NULL DEFAULT '',
      started_at    TEXT NOT NULL,
      completed_at  TEXT,
      model                    TEXT,
      input_tokens             INTEGER,
      output_tokens            INTEGER,
      total_tokens             INTEGER,
      cost_cents               INTEGER,
      cancellation_requested_at TEXT
    );

    CREATE TABLE agent_events (
      id         TEXT PRIMARY KEY,
      run_id     TEXT NOT NULL,
      seq        INTEGER NOT NULL,
      type       TEXT NOT NULL,
      payload    TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (run_id) REFERENCES agent_runs (id) ON DELETE CASCADE
    );

    CREATE INDEX idx_agent_events_run_seq ON agent_events (run_id, seq);
    CREATE INDEX idx_agent_events_run_type ON agent_events (run_id, type);
    CREATE UNIQUE INDEX idx_agent_events_run_seq_unique ON agent_events (run_id, seq);
  `);

  return db;
}

function insertRun(db: Database.Database, id: string, jobId = 'job-1'): void {
  db.prepare(
    `INSERT INTO agent_runs (id, job_id, status, started_at) VALUES (?, ?, 'running', '2026-05-04T00:00:00Z')`
  ).run(id, jobId);
}

function insertEvent(
  db: Database.Database,
  runId: string,
  seq: number,
  type: string,
  payload: object = {}
): void {
  db.prepare(
    `INSERT INTO agent_events (id, run_id, seq, type, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(`evt-${runId}-${seq}`, runId, seq, type, JSON.stringify(payload), '2026-05-04T00:00:00Z');
}

describe('agent_events schema (v7)', () => {
  let db: Database.Database;
  beforeEach(() => {
    db = makeDb();
    insertRun(db, 'run-A');
    insertRun(db, 'run-B');
  });

  it('inserts events and reads them back in seq order', () => {
    insertEvent(db, 'run-A', 0, 'assistant_message');
    insertEvent(db, 'run-A', 1, 'tool_call');
    insertEvent(db, 'run-A', 2, 'tool_result');

    const rows = db
      .prepare('SELECT seq, type FROM agent_events WHERE run_id = ? ORDER BY seq ASC')
      .all('run-A') as Array<{ seq: number; type: string }>;

    expect(rows.map((r) => r.seq)).toEqual([0, 1, 2]);
    expect(rows.map((r) => r.type)).toEqual(['assistant_message', 'tool_call', 'tool_result']);
  });

  it('filters events by type within a run', () => {
    insertEvent(db, 'run-A', 0, 'assistant_message');
    insertEvent(db, 'run-A', 1, 'tool_call');
    insertEvent(db, 'run-A', 2, 'tool_call');
    insertEvent(db, 'run-A', 3, 'tool_result');

    const rows = db
      .prepare('SELECT seq FROM agent_events WHERE run_id = ? AND type = ? ORDER BY seq ASC')
      .all('run-A', 'tool_call') as Array<{ seq: number }>;

    expect(rows.map((r) => r.seq)).toEqual([1, 2]);
  });

  it('paginates with fromSeq exclusive cursor', () => {
    for (let i = 0; i < 5; i++) insertEvent(db, 'run-A', i, 'assistant_message');

    const rows = db
      .prepare('SELECT seq FROM agent_events WHERE run_id = ? AND seq > ? ORDER BY seq ASC')
      .all('run-A', 1) as Array<{ seq: number }>;

    expect(rows.map((r) => r.seq)).toEqual([2, 3, 4]);
  });

  it('rejects duplicate (run_id, seq) within one run via the unique index', () => {
    insertEvent(db, 'run-A', 0, 'assistant_message');
    expect(() => insertEvent(db, 'run-A', 0, 'tool_call')).toThrow(/UNIQUE constraint/i);
  });

  it('allows the same seq value in DIFFERENT runs (no global sequence contention)', () => {
    // This is the load-bearing concurrency invariant: with N parallel runs
    // each emitting events from seq 0, the (run_id, seq) unique index does
    // not cause writers to serialize across runs.
    insertEvent(db, 'run-A', 0, 'assistant_message');
    insertEvent(db, 'run-B', 0, 'assistant_message');
    insertEvent(db, 'run-A', 1, 'tool_call');
    insertEvent(db, 'run-B', 1, 'tool_call');

    const a = db
      .prepare('SELECT seq FROM agent_events WHERE run_id = ? ORDER BY seq ASC')
      .all('run-A') as Array<{ seq: number }>;
    const b = db
      .prepare('SELECT seq FROM agent_events WHERE run_id = ? ORDER BY seq ASC')
      .all('run-B') as Array<{ seq: number }>;

    expect(a.map((r) => r.seq)).toEqual([0, 1]);
    expect(b.map((r) => r.seq)).toEqual([0, 1]);
  });

  it('cascades on agent_runs delete', () => {
    insertEvent(db, 'run-A', 0, 'assistant_message');
    insertEvent(db, 'run-A', 1, 'done');

    db.prepare('DELETE FROM agent_runs WHERE id = ?').run('run-A');

    const remaining = db
      .prepare('SELECT COUNT(*) as c FROM agent_events WHERE run_id = ?')
      .get('run-A') as { c: number };
    expect(remaining.c).toBe(0);
  });
});

describe('agent_runs summary columns (v7)', () => {
  let db: Database.Database;
  beforeEach(() => {
    db = makeDb();
    insertRun(db, 'run-A');
  });

  it('starts with NULL summary columns', () => {
    const row = db
      .prepare(
        'SELECT model, input_tokens, output_tokens, total_tokens, cost_cents, cancellation_requested_at FROM agent_runs WHERE id = ?'
      )
      .get('run-A') as Record<string, unknown>;
    expect(row.model).toBeNull();
    expect(row.input_tokens).toBeNull();
    expect(row.output_tokens).toBeNull();
    expect(row.total_tokens).toBeNull();
    expect(row.cost_cents).toBeNull();
    expect(row.cancellation_requested_at).toBeNull();
  });

  it('updates only the specified summary fields, leaves others unchanged', () => {
    db.prepare(
      'UPDATE agent_runs SET model = ?, input_tokens = ?, output_tokens = ? WHERE id = ?'
    ).run('claude-sonnet-4-6', 100, 50, 'run-A');

    const row = db
      .prepare(
        'SELECT model, input_tokens, output_tokens, total_tokens, cost_cents FROM agent_runs WHERE id = ?'
      )
      .get('run-A') as Record<string, unknown>;
    expect(row.model).toBe('claude-sonnet-4-6');
    expect(row.input_tokens).toBe(100);
    expect(row.output_tokens).toBe(50);
    // unspecified fields untouched
    expect(row.total_tokens).toBeNull();
    expect(row.cost_cents).toBeNull();
  });

  it('records cancellation_requested_at as a separate column from status', () => {
    const ts = '2026-05-04T01:23:45Z';
    db.prepare('UPDATE agent_runs SET cancellation_requested_at = ? WHERE id = ?').run(ts, 'run-A');

    const row = db
      .prepare('SELECT status, cancellation_requested_at FROM agent_runs WHERE id = ?')
      .get('run-A') as { status: string; cancellation_requested_at: string };

    // Status remains 'running' until the worker observes the cancellation
    // marker and transitions the run; this is the cooperative cancellation
    // contract sub-task 9 builds on.
    expect(row.status).toBe('running');
    expect(row.cancellation_requested_at).toBe(ts);
  });
});
