import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import {
  dbGetConversation,
  dbGetMessages,
  dbInsertMessage,
  dbUpdateConversationTitle,
  dbUpdateConversationTimestamp,
} from '@/lib/managers/chat-db';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildReadOnlyRepoContextForChat } from '@/lib/chat/read-only-repo-context';
import { loadWorkspace } from '@/lib/managers/workspace-manager';
import { ClaudeCodeAgent } from '@/lib/agent';
import type { AgentEvent, AgentRunner } from '@/lib/agent';
import type { WorkspaceId } from '@/lib/types/index';

/**
 * Build context instructions telling the agent about the create-task script.
 */
function buildTaskCreationContext(workspaceId: string): string {
  return `You have a task creation tool available. When the user asks you to create a task, run this command:

create-task --workspace-id "${workspaceId}" --title "Task title" --description "Detailed description"

Optional flags: --file-paths "src/foo.ts,src/bar.ts" --delivery-method "merge-request" (or "direct-commit")

Only run this command when the user explicitly asks to create a task.`;
}

/**
 * Replay prior conversation turns into the prompt so the stateless
 * AgentRunner sees full context. Each message is rendered as
 * `[user] ...` / `[assistant] ...` blocks. The latest user message is
 * appended last as the actual question.
 */
function buildPromptWithHistory(
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  latestMessage: string
): string {
  if (history.length === 0) return latestMessage;
  const turns = history.map((m) => `[${m.role}]\n${m.content.trim()}`).join('\n\n');
  return `Conversation so far:\n\n${turns}\n\n[user]\n${latestMessage}`;
}

/**
 * Detect task creation from AgentEvent tool_result events. Looks for
 * structured JSON output of the create-task script in the tool_result
 * content payload.
 */
function parseTaskCreatedFromEvents(
  events: AgentEvent[]
): Array<{ id: string; title: string; taskNumber: number }> {
  const created: Array<{ id: string; title: string; taskNumber: number }> = [];
  for (const event of events) {
    if (event.type !== 'tool_result') continue;
    const content = event.content;
    if (typeof content !== 'string' || !content.includes('"task_created":true')) continue;
    try {
      const parsed = JSON.parse(content) as Record<string, unknown>;
      if (
        parsed.task_created === true &&
        typeof parsed.id === 'string' &&
        typeof parsed.title === 'string' &&
        typeof parsed.taskNumber === 'number'
      ) {
        created.push({ id: parsed.id, title: parsed.title, taskNumber: parsed.taskNumber });
      }
    } catch {
      // Not JSON or wrong shape — ignore.
    }
  }
  return created;
}

const StreamBodySchema = z.object({
  message: z.string().min(1, 'Message is required'),
});

// Concurrency guard — one active stream per conversation
const activeStreams = new Set<string>();

// Module-level default agent. Stateless — safe to share across concurrent
// chat streams per the AgentRunner reentrancy contract.
let defaultAgent: AgentRunner | null = null;
function getChatAgent(): AgentRunner {
  if (!defaultAgent) defaultAgent = new ClaudeCodeAgent();
  return defaultAgent;
}

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

  const conversation = await dbGetConversation(conversationId);
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

  // Read prior history BEFORE inserting the latest user message so we don't
  // double-count it in the prompt context.
  const priorMessages = await dbGetMessages(conversationId);

  await dbInsertMessage({
    id: randomUUID(),
    conversationId,
    role: 'user',
    content: message,
  });

  // Auto-title: set title to truncated first message if it's the default
  if (conversation.title === 'New conversation') {
    const truncated = message.length > 80 ? message.substring(0, 77) + '...' : message;
    await dbUpdateConversationTitle(conversationId, truncated);
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

      let scratchDir: string | undefined;
      try {
        const collectedEvents: AgentEvent[] = [];

        scratchDir = await mkdtemp(join(tmpdir(), 'omnidev-chat-'));
        const repoContext = await buildReadOnlyRepoContextForChat(workspace);
        const taskContext = buildTaskCreationContext(conversation.workspaceId);
        const sessionContext = [repoContext, taskContext].filter(Boolean).join('\n\n');

        const promptWithHistory = buildPromptWithHistory(
          priorMessages.map((m) => ({ role: m.role, content: m.content })),
          message
        );
        const fullQuestion = sessionContext
          ? `${sessionContext}\n\n${promptWithHistory}`
          : promptWithHistory;

        const agent = getChatAgent();
        for await (const event of agent.run({
          question: fullQuestion,
          workingDirectory: scratchDir,
          editRequest: false,
        })) {
          collectedEvents.push(event);

          switch (event.type) {
            case 'assistant_message':
              accumulatedText += event.text;
              writeSSE('assistant_delta', { content: event.text });
              break;

            case 'tool_call':
              writeSSE('log', {
                logType: 'tool_call',
                data: { name: event.name, input: event.input, toolUseId: event.toolUseId },
              });
              break;

            case 'tool_result':
              writeSSE('log', {
                logType: 'tool_result',
                data: {
                  toolUseId: event.toolUseId,
                  content: event.content,
                  isError: event.isError,
                },
              });
              break;

            case 'thinking':
              writeSSE('log', { logType: 'thinking', data: { text: event.text } });
              break;

            case 'usage_update':
              writeSSE('log', {
                logType: 'usage_update',
                data: {
                  inputTokens: event.inputTokens,
                  outputTokens: event.outputTokens,
                  model: event.model,
                },
              });
              break;

            case 'done':
              writeSSE('result', {
                content: accumulatedText,
                durationMs: Date.now() - startTime,
              });
              break;

            case 'error':
              writeSSE('error', { message: event.message });
              break;
          }
        }

        // Detect tasks created via the create-task script from tool_result events.
        const createdTasks = parseTaskCreatedFromEvents(collectedEvents);
        for (const task of createdTasks) {
          console.log(`[CHAT STREAM] Detected task creation: ${task.title} (#${task.taskNumber})`);
          writeSSE('task_created', task);
        }

        // Save assistant message
        const finalContent = accumulatedText.trim();
        if (finalContent) {
          const durationMs = Date.now() - startTime;
          await dbInsertMessage({
            id: randomUUID(),
            conversationId,
            role: 'assistant',
            content: finalContent,
            durationMs,
          });
        }

        await dbUpdateConversationTimestamp(conversationId);
        writeSSE('done', { messageId: randomUUID() });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`[CHAT STREAM] Error:`, errorMsg);
        writeSSE('error', { message: errorMsg });
      } finally {
        if (scratchDir) {
          rm(scratchDir, { recursive: true, force: true }).catch(() => {});
        }
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
