import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { randomUUID } from 'node:crypto';
import { CreateConversationSchema } from '@/lib/api/chat-validation';
import { dbCreateConversation, dbListConversations } from '@/lib/managers/chat-db';

/**
 * GET /api/chat?workspaceId=xxx — List conversations for a workspace
 */
export async function GET(request: NextRequest) {
  const authResult = await withAuth(request);
  if (!authResult.success) return authResult.response!;

  const workspaceId = request.nextUrl.searchParams.get('workspaceId');
  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId query param is required' }, { status: 400 });
  }

  const conversations = dbListConversations(workspaceId);
  return NextResponse.json({ conversations });
}

/**
 * POST /api/chat — Create a new conversation
 */
export async function POST(request: NextRequest) {
  const authResult = await withAuth(request);
  if (!authResult.success) return authResult.response!;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = CreateConversationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const conversation = dbCreateConversation({
    id: randomUUID(),
    workspaceId: parsed.data.workspaceId,
    title: 'New conversation',
  });

  return NextResponse.json({ conversation }, { status: 201 });
}
