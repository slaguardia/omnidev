/**
 * Chat — PostgreSQL via Prisma (`chat_conversations`, `chat_messages`).
 */

import { prisma } from '@/lib/db/prisma';
import type { ChatConversation, ChatMessage } from './chat-db-sqlite';

function mapConv(r: {
  id: string;
  workspaceId: string;
  title: string;
  sessionId: string | null;
  createdAt: string;
  updatedAt: string;
  isArchived: number;
}): ChatConversation {
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    title: r.title,
    sessionId: r.sessionId,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    isArchived: r.isArchived === 1,
  };
}

function mapMsg(r: {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  createdAt: string;
  usageJson: string | null;
  durationMs: number | null;
}): ChatMessage {
  return {
    id: r.id,
    conversationId: r.conversationId,
    role: r.role as ChatMessage['role'],
    content: r.content,
    createdAt: r.createdAt,
    usageJson: r.usageJson,
    durationMs: r.durationMs,
  };
}

export async function dbCreateConversation(conv: {
  id: string;
  workspaceId: string;
  title: string;
  sessionId?: string | null;
}): Promise<ChatConversation> {
  const now = new Date().toISOString();
  await prisma.chatConversation.create({
    data: {
      id: conv.id,
      workspaceId: conv.workspaceId,
      title: conv.title,
      sessionId: conv.sessionId ?? null,
      createdAt: now,
      updatedAt: now,
      isArchived: 0,
    },
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

export async function dbGetConversation(id: string): Promise<ChatConversation | null> {
  const r = await prisma.chatConversation.findUnique({ where: { id } });
  return r ? mapConv(r) : null;
}

export async function dbListConversations(workspaceId: string): Promise<ChatConversation[]> {
  const rows = await prisma.chatConversation.findMany({
    where: { workspaceId, isArchived: 0 },
    orderBy: { updatedAt: 'desc' },
  });
  return rows.map(mapConv);
}

export async function dbUpdateConversationTitle(id: string, title: string): Promise<void> {
  const now = new Date().toISOString();
  await prisma.chatConversation.update({
    where: { id },
    data: { title, updatedAt: now },
  });
}

export async function dbUpdateConversationSessionId(id: string, sessionId: string): Promise<void> {
  const now = new Date().toISOString();
  await prisma.chatConversation.update({
    where: { id },
    data: { sessionId, updatedAt: now },
  });
}

export async function dbUpdateConversationTimestamp(id: string): Promise<void> {
  const now = new Date().toISOString();
  await prisma.chatConversation.update({
    where: { id },
    data: { updatedAt: now },
  });
}

export async function dbDeleteConversation(id: string): Promise<boolean> {
  try {
    await prisma.chatConversation.delete({ where: { id } });
    return true;
  } catch {
    return false;
  }
}

export async function dbInsertMessage(msg: {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  usageJson?: string | null;
  durationMs?: number | null;
}): Promise<ChatMessage> {
  const now = new Date().toISOString();
  await prisma.chatMessage.create({
    data: {
      id: msg.id,
      conversationId: msg.conversationId,
      role: msg.role,
      content: msg.content,
      createdAt: now,
      usageJson: msg.usageJson ?? null,
      durationMs: msg.durationMs ?? null,
    },
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

export async function dbGetMessages(conversationId: string): Promise<ChatMessage[]> {
  const rows = await prisma.chatMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map(mapMsg);
}

export async function dbCloseChatDb(): Promise<void> {
  /* Shared Prisma client — do not disconnect */
}
