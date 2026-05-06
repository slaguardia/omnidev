/**
 * GET /api/ralph/jobs/:jobId/events
 *
 * Server-Sent Events stream of the agent_events timeline for a job.
 * Emits all existing events for the most recent agent_run, then live
 * events appended by the worker, then closes when the run reaches a
 * terminal status (completed, failed, cancelled).
 *
 * Wire format (one SSE message per event):
 *   event: agent_event
 *   data: { id, runId, seq, type, payload, createdAt }
 *
 * Plus a terminal `done` message when the run finishes:
 *   event: done
 *   data: { status: 'completed' | 'failed' | 'cancelled' }
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { dbGetAgentRunsByJob, dbGetJob, dbStreamAgentEvents } from '@/lib/managers/ralph-task-db';

interface RouteContext {
  params: Promise<{ jobId: string }>;
}

export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  const authResult = await withAuth(request);
  if (!authResult.success) return authResult.response!;

  const { jobId } = await context.params;

  const job = await dbGetJob(jobId);
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  // Pick the most recent agent_run for this job. dbGetAgentRunsByJob orders
  // by started_at DESC so [0] is the latest attempt.
  const runs = await dbGetAgentRunsByJob(jobId);
  const run = runs[0];
  if (!run) {
    return NextResponse.json({ error: 'No agent run found for this job' }, { status: 404 });
  }

  // Resume cursor: the client may pass ?fromSeq=N to skip events it has
  // already seen (used after EventSource auto-reconnect).
  const fromSeqRaw = request.nextUrl.searchParams.get('fromSeq');
  const fromSeq = fromSeqRaw !== null ? Number(fromSeqRaw) : undefined;
  const startCursor = Number.isFinite(fromSeq) ? (fromSeq as number) : undefined;

  // Per-connection AbortController so client disconnects clean up the
  // poll loop in dbStreamAgentEvents (no leaked timers).
  const abortController = new AbortController();
  request.signal.addEventListener('abort', () => abortController.abort());

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function writeSSE(eventName: string, data: unknown): void {
        const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          // Controller closed (client disconnected).
        }
      }

      try {
        const streamOpts: Parameters<typeof dbStreamAgentEvents>[1] = {
          signal: abortController.signal,
        };
        if (startCursor !== undefined) streamOpts.fromSeq = startCursor;

        for await (const event of dbStreamAgentEvents(run.id, streamOpts)) {
          writeSSE('agent_event', {
            id: event.id,
            runId: event.run_id,
            seq: event.seq,
            type: event.type,
            payload: safeParseJson(event.payload),
            createdAt: event.created_at,
          });
        }

        // dbStreamAgentEvents returns once the agent_run reaches a terminal
        // status — emit a final `done` so the client knows to close cleanly.
        const finalRuns = await dbGetAgentRunsByJob(jobId);
        const finalStatus = finalRuns[0]?.status ?? run.status;
        writeSSE('done', { status: finalStatus });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        writeSSE('error', { message });
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      }
    },
    cancel() {
      abortController.abort();
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

function safeParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
