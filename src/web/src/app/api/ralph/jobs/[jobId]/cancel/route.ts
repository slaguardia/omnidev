/**
 * POST /api/ralph/jobs/:jobId/cancel
 *
 * Marks the job's most recent agent_run as cancellation-requested. The
 * worker observes the marker via short-poll while iterating the agent
 * stream, aborts the per-run AbortSignal, and the agent's run.cancel()
 * exits cleanly with a `done` (stopReason='cancelled') event.
 *
 * Returns 200 if the cancellation was recorded, 404 if no agent run
 * exists for the job, and 409 if the run has already terminated.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import {
  dbGetAgentRunsByJob,
  dbGetJob,
  dbUpdateAgentRunSummary,
} from '@/lib/managers/ralph-task-db';

interface RouteContext {
  params: Promise<{ jobId: string }>;
}

export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  const authResult = await withAuth(request);
  if (!authResult.success) return authResult.response!;

  const { jobId } = await context.params;

  const job = await dbGetJob(jobId);
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  const runs = await dbGetAgentRunsByJob(jobId);
  const run = runs[0];
  if (!run) {
    return NextResponse.json({ error: 'No agent run found for this job' }, { status: 404 });
  }

  if (run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') {
    return NextResponse.json(
      { error: `Run already terminated (status: ${run.status})` },
      { status: 409 }
    );
  }

  const requestedAt = new Date().toISOString();
  const updated = await dbUpdateAgentRunSummary(run.id, {
    cancellation_requested_at: requestedAt,
  });
  if (!updated) {
    return NextResponse.json({ error: 'Failed to record cancellation request' }, { status: 500 });
  }

  console.log(`[CANCEL] Cancellation requested for run ${run.id} (job ${jobId}) at ${requestedAt}`);
  return NextResponse.json({
    success: true,
    runId: run.id,
    cancellationRequestedAt: requestedAt,
  });
}
