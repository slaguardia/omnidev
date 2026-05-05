/**
 * Standalone worker process for Omnidev.
 *
 * Entry point: tsx src/worker/index.ts
 * Polls the database for pending jobs, claims them atomically, and executes
 * up to WORKER_CONCURRENCY of them in parallel within a single Node process.
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
import { createScheduler, resolveConcurrency } from './scheduler';

const POLL_INTERVAL_MS = 2000;
const HEARTBEAT_INTERVAL_MS = 30_000; // 30 seconds
const STALE_JOB_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const DEFAULT_CONCURRENCY = 3;

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
 * Per-job lifecycle: agent run record + heartbeat + dispatch + cleanup.
 * Errors are caught and recorded; this function never throws.
 */
async function runJob(job: RalphJob): Promise<void> {
  console.log(`[WORKER] Claimed job ${job.id} (task: ${job.task_id}, type: ${job.agent_type})`);

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

  const heartbeatHandle = setInterval(() => {
    void dbHeartbeatJob(job.id);
  }, HEARTBEAT_INTERVAL_MS);

  try {
    const { logs } = await dispatchJob(job);

    await dbUpdateAgentRun(runId, {
      status: 'completed',
      logs,
      completed_at: new Date().toISOString(),
    });

    console.log(`[WORKER] Job ${job.id} completed (${job.agent_type}): ${logs}`);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[WORKER] Job ${job.id} failed:`, errorMessage);

    await dbUpdateJob(job.id, {
      status: 'failed',
      error: errorMessage,
    });

    await dbUpdateAgentRun(runId, {
      status: 'failed',
      logs: `Error: ${errorMessage}`,
      completed_at: new Date().toISOString(),
    });
  } finally {
    clearInterval(heartbeatHandle);
    const revoked = await revokeJobTokens(job.id);
    if (revoked > 0) {
      console.log(`[WORKER] Revoked ${revoked} stage token(s) for job ${job.id}`);
    }
  }
}

const scheduler = createScheduler<RalphJob>({
  maxConcurrency: resolveConcurrency(process.env.WORKER_CONCURRENCY, DEFAULT_CONCURRENCY),
  pollIntervalMs: POLL_INTERVAL_MS,
  claimNextJob: dbClaimNextPendingJob,
  runJob,
  recoverStaleJobs: () => {
    const cutoff = new Date(Date.now() - STALE_JOB_TIMEOUT_MS).toISOString();
    return dbRecoverStaleJobs(cutoff);
  },
  revokeExpiredTokens,
});

/**
 * Graceful shutdown handler.
 */
function shutdown(): void {
  console.log('[WORKER] Shutting down...');
  scheduler.stop();
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

  scheduler.start();
}

void main();
