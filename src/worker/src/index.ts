/**
 * Standalone worker process for Omnidev.
 *
 * Entry point: tsx src/worker/index.ts
 * Polls ralph.db for pending jobs, claims them atomically, and executes.
 * Handles both V2 (coding-agent) and Ralph stage jobs.
 * Recovers stale jobs (no heartbeat for 10+ minutes) on each poll cycle.
 */

import { nanoid } from 'nanoid';
import { isPrismaConfigured, prisma } from '@/lib/db/prisma';
import {
  getDb,
  dbClose,
  dbClaimNextPendingJob,
  dbUpdateJob,
  dbCreateAgentRun,
  dbUpdateAgentRun,
  dbHeartbeatJob,
  dbRecoverStaleJobs,
  type RalphJob,
} from '@/lib/managers/ralph-task-db';
import { revokeJobTokens, revokeExpiredTokens } from '@/lib/auth/stage-tokens';
import { ClaudeCodeAgent } from '@/lib/agent/claude-code-agent';
import { executeV2Job } from './job-executor';
import { executeRalphStageJob } from '@/lib/queue/job-handlers';
import type { RalphStageJobPayload } from '@/lib/queue/types';

const POLL_INTERVAL_MS = 2000;
const HEARTBEAT_INTERVAL_MS = 30_000; // 30 seconds
const STALE_JOB_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

let shouldStop = false;
let pollHandle: ReturnType<typeof setTimeout> | null = null;

const agent = new ClaudeCodeAgent();

/**
 * Execute a job based on its agent_type.
 */
async function dispatchJob(job: RalphJob): Promise<{ logs: string }> {
  if (job.agent_type === 'ralph-stage') {
    const payload = JSON.parse(job.payload) as RalphStageJobPayload;
    const result = await executeRalphStageJob(payload, job.id);
    await dbUpdateJob(job.id, {
      status: result.error ? 'failed' : 'completed',
      result: JSON.stringify(result),
      ...(result.error ? { error: result.error } : {}),
    });
    return {
      logs: `Stage: ${result.stageName}, Iteration: ${result.iteration}, Time: ${result.executionTimeMs}ms${result.error ? `, Error: ${result.error}` : ''}`,
    };
  }

  // V2 coding-agent jobs
  const result = await executeV2Job(job, agent);

  await dbUpdateJob(job.id, {
    status: 'completed',
    result: JSON.stringify(result),
  });

  // Edit jobs → move task to complete
  if (result.execution_mode === 'edit') {
    const { updateRalphTask } = await import('@/lib/managers/ralph-task-manager');
    await updateRalphTask(job.task_id, { status: 'complete' }).catch((err) =>
      console.error(`[WORKER] Failed to update task status:`, err)
    );
  }

  return {
    logs: `Mode: ${result.execution_mode}, Branch: ${result.branch ?? 'none'}, Commit: ${result.commit_hash ?? 'none'}, Retried: ${result.retried}, Time: ${result.execution_time_ms}ms`,
  };
}

/**
 * Main poll loop — recovers stale jobs, then claims and executes one job per iteration.
 */
async function pollLoop(): Promise<void> {
  if (shouldStop) return;

  // Recover stale jobs before claiming new work
  const cutoff = new Date(Date.now() - STALE_JOB_TIMEOUT_MS).toISOString();
  const recovered = await dbRecoverStaleJobs(cutoff);
  if (recovered > 0) {
    console.log(`[WORKER] Recovered ${recovered} stale job(s) (no heartbeat for 10+ min)`);
    // Revoke tokens for recovered stale jobs
    // (dbRecoverStaleJobs doesn't return IDs, so use expired token cleanup as catch-all)
  }

  // Periodically revoke expired tokens (cheap — runs every poll cycle)
  const expiredRevoked = await revokeExpiredTokens();
  if (expiredRevoked > 0) {
    console.log(`[WORKER] Revoked ${expiredRevoked} expired stage token(s)`);
  }

  const job = await dbClaimNextPendingJob();
  if (!job) {
    pollHandle = setTimeout(() => void pollLoop(), POLL_INTERVAL_MS);
    return;
  }

  console.log(`[WORKER] Claimed job ${job.id} (task: ${job.task_id}, type: ${job.agent_type})`);

  // Create agent run record
  const runId = nanoid(10);
  const runStart = new Date().toISOString();
  await dbCreateAgentRun({
    id: runId,
    job_id: job.id,
    status: 'running',
    logs: '',
    started_at: runStart,
    completed_at: null,
  });

  // Start heartbeat — keeps the job alive during long executions
  const heartbeatHandle = setInterval(() => {
    void dbHeartbeatJob(job.id);
  }, HEARTBEAT_INTERVAL_MS);

  try {
    const { logs } = await dispatchJob(job);

    // Update agent run
    await dbUpdateAgentRun(runId, {
      status: 'completed',
      logs,
      completed_at: new Date().toISOString(),
    });

    console.log(`[WORKER] Job ${job.id} completed (${job.agent_type}): ${logs}`);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[WORKER] Job ${job.id} failed:`, errorMessage);

    // Mark job failed
    await dbUpdateJob(job.id, {
      status: 'failed',
      error: errorMessage,
    });

    // Update agent run
    await dbUpdateAgentRun(runId, {
      status: 'failed',
      logs: `Error: ${errorMessage}`,
      completed_at: new Date().toISOString(),
    });
  } finally {
    clearInterval(heartbeatHandle);
    // Revoke any scoped CLI tokens for this job
    const revoked = await revokeJobTokens(job.id);
    if (revoked > 0) {
      console.log(`[WORKER] Revoked ${revoked} stage token(s) for job ${job.id}`);
    }
  }

  // Schedule next poll (immediate — there may be more jobs)
  if (!shouldStop) {
    pollHandle = setTimeout(() => void pollLoop(), 0);
  }
}

/**
 * Graceful shutdown handler.
 */
function shutdown(): void {
  if (shouldStop) return;
  console.log('[WORKER] Shutting down...');
  shouldStop = true;

  if (pollHandle) {
    clearTimeout(pollHandle);
    pollHandle = null;
  }

  void dbClose();
  console.log('[WORKER] Database closed. Goodbye.');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('[WORKER] Omnidev Worker starting...');

  if (isPrismaConfigured()) {
    await prisma.$connect();
    console.log('[WORKER] Database initialized (PostgreSQL via Prisma)');
  } else {
    getDb();
    console.log('[WORKER] Database initialized (ralph.db)');
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  console.log(`[WORKER] Polling for jobs every ${POLL_INTERVAL_MS}ms`);
  void pollLoop();
}

void main();
