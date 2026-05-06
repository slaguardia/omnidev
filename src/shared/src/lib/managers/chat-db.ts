/**
 * Chat database — PostgreSQL when DATABASE_URL is set, else SQLite (`data/chat.db`).
 */

import { isPrismaConfigured } from '@/lib/db/prisma';
import * as pg from './chat-db-pg';
import * as sqlite from './chat-db-sqlite';

export type { ChatConversation, ChatMessage } from './chat-db-sqlite';

export async function dbCreateConversation(conv: {
  id: string;
  workspaceId: string;
  title: string;
  sessionId?: string | null;
}): Promise<import('./chat-db-sqlite').ChatConversation> {
  return isPrismaConfigured()
    ? pg.dbCreateConversation(conv)
    : Promise.resolve(sqlite.dbCreateConversation(conv));
}

export async function dbGetConversation(
  id: string
): Promise<import('./chat-db-sqlite').ChatConversation | null> {
  return isPrismaConfigured()
    ? pg.dbGetConversation(id)
    : Promise.resolve(sqlite.dbGetConversation(id));
}

export async function dbListConversations(
  workspaceId: string
): Promise<import('./chat-db-sqlite').ChatConversation[]> {
  return isPrismaConfigured()
    ? pg.dbListConversations(workspaceId)
    : Promise.resolve(sqlite.dbListConversations(workspaceId));
}

export async function dbUpdateConversationTitle(id: string, title: string): Promise<void> {
  return isPrismaConfigured()
    ? pg.dbUpdateConversationTitle(id, title)
    : Promise.resolve(sqlite.dbUpdateConversationTitle(id, title));
}

export async function dbUpdateConversationTimestamp(id: string): Promise<void> {
  return isPrismaConfigured()
    ? pg.dbUpdateConversationTimestamp(id)
    : Promise.resolve(sqlite.dbUpdateConversationTimestamp(id));
}

export async function dbDeleteConversation(id: string): Promise<boolean> {
  return isPrismaConfigured()
    ? pg.dbDeleteConversation(id)
    : Promise.resolve(sqlite.dbDeleteConversation(id));
}

export async function dbInsertMessage(msg: {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  usageJson?: string | null;
  durationMs?: number | null;
}): Promise<import('./chat-db-sqlite').ChatMessage> {
  return isPrismaConfigured()
    ? pg.dbInsertMessage(msg)
    : Promise.resolve(sqlite.dbInsertMessage(msg));
}

export async function dbGetMessages(
  conversationId: string
): Promise<import('./chat-db-sqlite').ChatMessage[]> {
  return isPrismaConfigured()
    ? pg.dbGetMessages(conversationId)
    : Promise.resolve(sqlite.dbGetMessages(conversationId));
}

export async function dbCloseChatDb(): Promise<void> {
  return isPrismaConfigured() ? pg.dbCloseChatDb() : Promise.resolve(sqlite.dbCloseChatDb());
}
