import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { UpdateConversationSchema } from '@/lib/api/chat-validation';
import {
  dbGetConversation,
  dbGetMessages,
  dbUpdateConversationTitle,
  dbDeleteConversation,
} from '@/lib/managers/chat-db';

/**
 * GET /api/chat/{conversationId} — Get conversation with messages
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const authResult = await withAuth(request);
  if (!authResult.success) return authResult.response!;

  const { conversationId } = await params;
  const conversation = dbGetConversation(conversationId);
  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  const messages = dbGetMessages(conversationId);
  return NextResponse.json({ conversation, messages });
}

/**
 * PATCH /api/chat/{conversationId} — Rename conversation
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const authResult = await withAuth(request);
  if (!authResult.success) return authResult.response!;

  const { conversationId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = UpdateConversationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const conversation = dbGetConversation(conversationId);
  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  dbUpdateConversationTitle(conversationId, parsed.data.title);

  return NextResponse.json({ success: true });
}

/**
 * DELETE /api/chat/{conversationId} — Delete conversation and messages (CASCADE)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const authResult = await withAuth(request);
  if (!authResult.success) return authResult.response!;

  const { conversationId } = await params;
  const deleted = dbDeleteConversation(conversationId);
  if (!deleted) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
