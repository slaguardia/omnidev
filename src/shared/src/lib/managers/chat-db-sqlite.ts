/**
 * Chat Database — SQLite (`data/chat.db`) when DATABASE_URL is unset.
 *
 * Uses better-sqlite3 (synchronous, native C++ addon) with WAL mode.
 * Routed through `chat-db.ts` when using PostgreSQL.
 */

import Database from 'better-sqlite3';
import { resolve } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';

// ---------------------------------------------------------------------------
// Singleton database instance
// ---------------------------------------------------------------------------

let db: Database.Database | null = null;

function getDbPath(): string {
  const dataDir = resolve(process.cwd(), 'data');
  return resolve(dataDir, 'chat.db');
}

/**
 * Get or initialize the chat database instance.
 * Creates schema on first access.
 */
export function getChatDb(): Database.Database {
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
  db.pragma('foreign_keys = ON');

  // Create schema
  createSchema(db);

  return db;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

function createSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS chat_conversations (
      id          TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      title       TEXT NOT NULL,
      session_id  TEXT,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL,
      is_archived INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_chat_conversations_workspace
      ON chat_conversations (workspace_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS chat_messages (
      id              TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
      role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content         TEXT NOT NULL,
      created_at      TEXT NOT NULL,
      usage_json      TEXT,
      duration_ms     INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation
      ON chat_messages (conversation_id, created_at ASC);

    CREATE TABLE IF NOT EXISTS chat_meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  runMigrations(database);
}

// ---------------------------------------------------------------------------
// Schema migrations
// ---------------------------------------------------------------------------

function runMigrations(database: Database.Database): void {
  const version = getSchemaVersion(database);

  // No migrations yet — version 0 is the initial schema
  if (version < 0) {
    // placeholder for future migrations
  }
  void version;
}

function getSchemaVersion(database: Database.Database): number {
  const row = database
    .prepare('SELECT value FROM chat_meta WHERE key = ?')
    .get('schema_version') as { value: string } | undefined;
  return row ? parseInt(row.value, 10) : 0;
}

// ---------------------------------------------------------------------------
// Prepared statement cache
// ---------------------------------------------------------------------------

interface StmtCache {
  insertConversation: Database.Statement;
  getConversation: Database.Statement;
  listConversations: Database.Statement;
  updateTitle: Database.Statement;
  updateUpdatedAt: Database.Statement;
  deleteConversation: Database.Statement;
  insertMessage: Database.Statement;
  getMessages: Database.Statement;
}

let stmts: StmtCache | null = null;

function getStmts(): StmtCache {
  if (stmts) return stmts;
  const database = getChatDb();

  stmts = {
    insertConversation: database.prepare(`
      INSERT INTO chat_conversations (id, workspace_id, title, session_id, created_at, updated_at, is_archived)
      VALUES (@id, @workspace_id, @title, @session_id, @created_at, @updated_at, @is_archived)
    `),

    getConversation: database.prepare(
      'SELECT id, workspace_id, title, session_id, created_at, updated_at, is_archived FROM chat_conversations WHERE id = ?'
    ),

    listConversations: database.prepare(`
      SELECT id, workspace_id, title, session_id, created_at, updated_at, is_archived
      FROM chat_conversations
      WHERE workspace_id = ? AND is_archived = 0
      ORDER BY updated_at DESC
    `),

    updateTitle: database.prepare(
      'UPDATE chat_conversations SET title = ?, updated_at = ? WHERE id = ?'
    ),

    updateUpdatedAt: database.prepare('UPDATE chat_conversations SET updated_at = ? WHERE id = ?'),

    deleteConversation: database.prepare('DELETE FROM chat_conversations WHERE id = ?'),

    insertMessage: database.prepare(`
      INSERT INTO chat_messages (id, conversation_id, role, content, created_at, usage_json, duration_ms)
      VALUES (@id, @conversation_id, @role, @content, @created_at, @usage_json, @duration_ms)
    `),

    getMessages: database.prepare(`
      SELECT id, conversation_id, role, content, created_at, usage_json, duration_ms
      FROM chat_messages
      WHERE conversation_id = ?
      ORDER BY created_at ASC
    `),
  };

  return stmts;
}

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export interface ChatConversation {
  id: string;
  workspaceId: string;
  title: string;
  sessionId: string | null;
  createdAt: string;
  updatedAt: string;
  isArchived: boolean;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  usageJson: string | null;
  durationMs: number | null;
}

interface ConversationRow {
  id: string;
  workspace_id: string;
  title: string;
  session_id: string | null;
  created_at: string;
  updated_at: string;
  is_archived: number;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  usage_json: string | null;
  duration_ms: number | null;
}

function parseConversation(row: ConversationRow): ChatConversation {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    sessionId: row.session_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isArchived: row.is_archived === 1,
  };
}

function parseMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
    usageJson: row.usage_json,
    durationMs: row.duration_ms,
  };
}

// ---------------------------------------------------------------------------
// Public API — Conversations
// ---------------------------------------------------------------------------

export function dbCreateConversation(conv: {
  id: string;
  workspaceId: string;
  title: string;
  sessionId?: string | null;
}): ChatConversation {
  const now = new Date().toISOString();
  getStmts().insertConversation.run({
    id: conv.id,
    workspace_id: conv.workspaceId,
    title: conv.title,
    session_id: conv.sessionId ?? null,
    created_at: now,
    updated_at: now,
    is_archived: 0,
  });
  return {
    id: conv.id,
    workspaceId: conv.workspaceId,
    title: conv.title,
    sessionId: conv.sessionId ?? null,
    createdAt: now,
    updatedAt: now,
    isArchived: false,
  };
}

export function dbGetConversation(id: string): ChatConversation | null {
  const row = getStmts().getConversation.get(id) as ConversationRow | undefined;
  return row ? parseConversation(row) : null;
}

export function dbListConversations(workspaceId: string): ChatConversation[] {
  const rows = getStmts().listConversations.all(workspaceId) as ConversationRow[];
  return rows.map(parseConversation);
}

export function dbUpdateConversationTitle(id: string, title: string): void {
  const now = new Date().toISOString();
  getStmts().updateTitle.run(title, now, id);
}

export function dbUpdateConversationTimestamp(id: string): void {
  const now = new Date().toISOString();
  getStmts().updateUpdatedAt.run(now, id);
}

export function dbDeleteConversation(id: string): boolean {
  const result = getStmts().deleteConversation.run(id);
  return result.changes > 0;
}

// ---------------------------------------------------------------------------
// Public API — Messages
// ---------------------------------------------------------------------------

export function dbInsertMessage(msg: {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  usageJson?: string | null;
  durationMs?: number | null;
}): ChatMessage {
  const now = new Date().toISOString();
  getStmts().insertMessage.run({
    id: msg.id,
    conversation_id: msg.conversationId,
    role: msg.role,
    content: msg.content,
    created_at: now,
    usage_json: msg.usageJson ?? null,
    duration_ms: msg.durationMs ?? null,
  });
  return {
    id: msg.id,
    conversationId: msg.conversationId,
    role: msg.role,
    content: msg.content,
    createdAt: now,
    usageJson: msg.usageJson ?? null,
    durationMs: msg.durationMs ?? null,
  };
}

export function dbGetMessages(conversationId: string): ChatMessage[] {
  const rows = getStmts().getMessages.all(conversationId) as MessageRow[];
  return rows.map(parseMessage);
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

export function dbCloseChatDb(): void {
  if (db) {
    db.close();
    db = null;
    stmts = null;
  }
}
