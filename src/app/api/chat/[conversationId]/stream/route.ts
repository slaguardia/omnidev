import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import {
  dbGetConversation,
  dbInsertMessage,
  dbUpdateConversationSessionId,
  dbUpdateConversationTitle,
  dbUpdateConversationTimestamp,
} from '@/lib/managers/chat-db';
import { loadWorkspace } from '@/lib/managers/workspace-manager';
import { streamClaudeCode } from '@/lib/claudeCode/stream';
import type { ClaudeCodeJsonLog } from '@/lib/claudeCode/types';
import type { FilePath, WorkspaceId } from '@/lib/types/index';

/**
 * Build context instructions telling Claude about the create-task script.
 */
function buildTaskCreationContext(workspaceId: string): string {
  return `You have a task creation tool available. When the user asks you to create a task, run this command:

create-task --workspace-id "${workspaceId}" --title "Task title" --description "Detailed description"

Optional flags: --file-paths "src/foo.ts,src/bar.ts" --delivery-method "merge-request" (or "direct-commit")

Only run this command when the user explicitly asks to create a task.`;
}

/**
 * Detect task creation from Claude Code's tool_use log events.
 * Looks for bash tool calls that invoke the create-task script and
 * extracts the task info from the tool_result stdout.
 */
function parseTaskCreatedFromLogs(
  logs: ClaudeCodeJsonLog[]
): Array<{ id: string; title: string; taskNumber: number }> {
  const created: Array<{ id: string; title: string; taskNumber: number }> = [];

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i]!;

    // Look for tool_result events that follow a create-task bash call
    if (log.subtype === 'tool_result') {
      const content = log.message;
      if (typeof content === 'string' && content.includes('"task_created":true')) {
        try {
          const parsed = JSON.parse(content);
          if (parsed.task_created && parsed.id && parsed.title) {
            created.push({ id: parsed.id, title: parsed.title, taskNumber: parsed.taskNumber });
          }
        } catch {
          // Not JSON or wrong shape
        }
      }
      // Also handle content blocks array format
      if (Array.isArray(content)) {
        for (const block of content) {
          const b = block as Record<string, unknown>;
          if (
            b.type === 'text' &&
            typeof b.text === 'string' &&
            b.text.includes('"task_created":true')
          ) {
            try {
              const parsed = JSON.parse(b.text);
              if (parsed.task_created && parsed.id && parsed.title) {
                created.push({ id: parsed.id, title: parsed.title, taskNumber: parsed.taskNumber });
              }
            } catch {
              // Not JSON or wrong shape
            }
          }
        }
      }
    }
  }

  return created;
}

const StreamBodySchema = z.object({
  message: z.string().min(1, 'Message is required'),
});

// Concurrency guard — one active stream per conversation
const activeStreams = new Set<string>();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const authResult = await withAuth(request);
  if (!authResult.success) return authResult.response!;

  const { conversationId } = await params;

  // Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = StreamBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { message } = parsed.data;

  // Load conversation
  const conversation = dbGetConversation(conversationId);
  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  // Load workspace to get working directory
  const wsResult = await loadWorkspace(conversation.workspaceId as WorkspaceId);
  if (!wsResult.success) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
  }
  const workspace = wsResult.data;

  // Concurrency guard
  if (activeStreams.has(conversationId)) {
    return NextResponse.json(
      { error: 'A stream is already active for this conversation' },
      { status: 409 }
    );
  }

  // Save user message
  dbInsertMessage({
    id: randomUUID(),
    conversationId,
    role: 'user',
    content: message,
  });

  // Session management
  let sessionId = conversation.sessionId;
  let isResume = false;
  if (!sessionId) {
    sessionId = randomUUID();
    dbUpdateConversationSessionId(conversationId, sessionId);
  } else {
    isResume = true;
  }

  // Auto-title: set title to truncated first message if it's the default
  if (conversation.title === 'New conversation') {
    const truncated = message.length > 80 ? message.substring(0, 77) + '...' : message;
    dbUpdateConversationTitle(conversationId, truncated);
  }

  activeStreams.add(conversationId);

  // Create SSE stream
  const encoder = new TextEncoder();
  let accumulatedText = '';
  const startTime = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      function writeSSE(event: string, data: unknown) {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          // Controller closed
        }
      }

      try {
        const collectedLogs: ClaudeCodeJsonLog[] = [];

        const generator = streamClaudeCode({
          message,
          workingDirectory: workspace.path as FilePath,
          sessionId: sessionId!,
          isResume,
          context: buildTaskCreationContext(conversation.workspaceId),
        });

        for await (const event of generator) {
          switch (event.type) {
            case 'text':
              accumulatedText += event.content;
              writeSSE('assistant_delta', { content: event.content });
              break;

            case 'log':
              collectedLogs.push(event.data);
              writeSSE('log', { logType: event.logType, data: event.data });
              break;

            case 'result':
              // If we got a result with content but no accumulated text, use result content
              if (event.content && !accumulatedText) {
                accumulatedText = event.content;
              }
              writeSSE('result', {
                content: event.content,
                durationMs: event.durationMs,
              });
              break;

            case 'error':
              writeSSE('error', { message: event.message });
              break;
          }
        }

        // Detect tasks created via the create-task script from tool_use logs
        const createdTasks = parseTaskCreatedFromLogs(collectedLogs);
        for (const task of createdTasks) {
          console.log(`[CHAT STREAM] Detected task creation: ${task.title} (#${task.taskNumber})`);
          writeSSE('task_created', task);
        }

        // Save assistant message
        const finalContent = accumulatedText.trim();
        if (finalContent) {
          const durationMs = Date.now() - startTime;
          dbInsertMessage({
            id: randomUUID(),
            conversationId,
            role: 'assistant',
            content: finalContent,
            durationMs,
          });
        }

        dbUpdateConversationTimestamp(conversationId);
        writeSSE('done', { messageId: randomUUID() });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`[CHAT STREAM] Error:`, errorMsg);
        writeSSE('error', { message: errorMsg });
      } finally {
        activeStreams.delete(conversationId);
        controller.close();
      }
    },
    cancel() {
      activeStreams.delete(conversationId);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
