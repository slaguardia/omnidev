/**
 * Queue Worker - Parallel job processing with workspace-level edit serialization
 *
 * Main entry point for API routes:
 * - If nothing is processing, execute immediately and return result
 * - If something is processing, queue the job and return job ID
 *
 * Background worker loop processes queued jobs in parallel, with one constraint:
 * edit-mode jobs targeting the same workspace are serialized (one at a time per workspace).
 * Everything else runs concurrently up to MAX_CONCURRENT_JOBS.
 */

import type {
  Job,
  JobType,
  ExecutionResult,
  ClaudeCodeJobPayload,
  RalphStageJobPayload,
} from './types';
import crypto from 'node:crypto';
import {
  acquireProcessingLock,
  createProcessingJob,
  enqueueJob,
  getPendingJobs,
  moveJob,
  markJobComplete,
  markJobFailed,
  cleanupOldJobs,
  requeueJobForRetry,
  detectStuckJobs,
} from './queue-manager';
import {
  executeClaudeCodeJob,
  executeGitPushJob,
  executeGitMRJob,
  executeWorkspaceCleanupJob,
  executeRalphStageJob,
} from './job-handlers';

// Worker configuration
const POLL_INTERVAL = 2000; // 2 seconds
const CLEANUP_INTERVAL = 100; // Run cleanup every 100 iterations (~3-4 minutes)
const MAX_CONCURRENT_JOBS = 5;

// Worker state
let workerRunning = false;
let workerIntervalId: ReturnType<typeof setInterval> | null = null;
let workerTickActive = false;

/** Concurrency info extracted from a job's payload */
interface JobConcurrencyInfo {
  workspacePath: string | null;
  isEdit: boolean;
}

/**
 * In-memory tracking of currently running jobs.
 * Maps job ID (string) to its concurrency info.
 */
const runningJobs = new Map<string, JobConcurrencyInfo>();

/**
 * Extract workspace path and edit status from a job's payload.
 * Used to determine which jobs can run in parallel.
 *
 * Rules:
 * - ralph-stage / claude-code: edit if editRequest or createMR is set
 * - git-push / git-mr / workspace-cleanup: always treated as edit (filesystem-modifying)
 */
function extractJobConcurrencyInfo(job: Job): JobConcurrencyInfo {
  const p = job.payload as Record<string, unknown>;
  const workspacePath = typeof p.workspacePath === 'string' ? p.workspacePath : null;

  switch (job.type) {
    case 'ralph-stage':
      return { workspacePath, isEdit: !!p.editRequest };
    case 'claude-code':
      return { workspacePath, isEdit: !!p.editRequest || !!p.createMR };
    case 'git-push':
    case 'git-mr':
    case 'workspace-cleanup':
      // Filesystem-modifying operations — always serialize per workspace
      return { workspacePath, isEdit: true };
    default:
      return { workspacePath: null, isEdit: false };
  }
}

/**
 * Build a set of workspace paths that currently have an edit job running.
 */
function getEditLockedWorkspaces(): Set<string> {
  const locked = new Set<string>();
  for (const info of runningJobs.values()) {
    if (info.isEdit && info.workspacePath) {
      locked.add(info.workspacePath);
    }
  }
  return locked;
}

/**
 * Check if starting a job with the given info would conflict with running edit jobs.
 * Only edit jobs on the same workspace conflict.
 */
function wouldConflict(info: JobConcurrencyInfo, lockedWorkspaces: Set<string>): boolean {
  if (!info.isEdit || !info.workspacePath) return false;
  return lockedWorkspaces.has(info.workspacePath);
}

/**
 * Options for executeOrQueue
 */
export interface ExecuteOrQueueOptions {
  /**
   * If true, always queue the job and return immediately with a job ID.
   * If false (default), execute immediately if no other job is processing.
   */
  forceQueue?: boolean;
}

/**
 * Main entry point for API routes - execute immediately or queue
 *
 * @param type - The job type
 * @param payload - The job payload
 * @param options - Optional configuration
 * @returns { immediate: true, result } if executed immediately
 * @returns { immediate: false, jobId } if queued
 */
export async function executeOrQueue<T>(
  type: JobType,
  payload: T,
  options?: ExecuteOrQueueOptions
): Promise<ExecutionResult> {
  const { forceQueue = false } = options ?? {};

  // If forceQueue is true, skip immediate execution and always queue
  if (forceQueue) {
    console.log(`[WORKER] Force queue enabled, enqueueing ${type} job`);
    const jobId = await enqueueJob(type, payload);
    return { immediate: false, jobId };
  }

  // Acquire atomic processing lock to prevent concurrent "execute immediately" races.
  const lock = await acquireProcessingLock('api');
  if (lock.acquired) {
    // Nothing is processing - execute immediately
    console.log(`[WORKER] No jobs processing, executing ${type} immediately`);

    // Create job in processing state to block other concurrent requests
    const job = await createProcessingJob(type, payload);

    try {
      const result = await processJob(job);
      await markJobComplete(job.id, result);
      await notifyJobCallback(job, { status: 'completed', result });

      console.log(`[WORKER] Job ${job.id} completed immediately`);
      return { immediate: true, result };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const retriesRemaining = (job.maxRetries ?? 0) - (job.retryCount ?? 0);

      if (retriesRemaining > 0) {
        await requeueJobForRetry(job.id, errorMessage);
        console.warn(`[WORKER] Job ${job.id} failed, requeued for retry: ${errorMessage}`);
      } else {
        await markJobFailed(job.id, errorMessage);
        await notifyJobCallback(job, { status: 'failed', error: errorMessage });
        console.error(`[WORKER] Job ${job.id} failed:`, errorMessage);
      }

      throw error; // Re-throw for API to handle
    } finally {
      await lock.release();
    }
  }

  // Something is processing - queue the job
  console.log(`[WORKER] Queue busy, enqueueing ${type} job`);
  const jobId = await enqueueJob(type, payload);

  return { immediate: false, jobId };
}

/**
 * Process a job based on its type
 */
async function processJob(job: Job): Promise<unknown> {
  console.log(`[WORKER] Processing job ${job.id} (${job.type})`);

  switch (job.type) {
    case 'claude-code':
      return await executeClaudeCodeJob(job.payload as ClaudeCodeJobPayload);

    case 'git-push':
      return await executeGitPushJob(job.payload as Parameters<typeof executeGitPushJob>[0]);

    case 'git-mr':
      return await executeGitMRJob(job.payload as Parameters<typeof executeGitMRJob>[0]);

    case 'workspace-cleanup':
      return await executeWorkspaceCleanupJob(
        job.payload as Parameters<typeof executeWorkspaceCleanupJob>[0]
      );

    case 'ralph-stage':
      return await executeRalphStageJob(job.payload as RalphStageJobPayload);

    default:
      throw new Error(`Unknown job type: ${job.type}`);
  }
}

/**
 * Run a single job through its full lifecycle: process, mark complete/failed, notify.
 * Runs as a fire-and-forget promise tracked by the runningJobs map.
 */
async function processJobLifecycle(job: Job): Promise<void> {
  try {
    const result = await processJob(job);
    await markJobComplete(job.id, result);
    await notifyJobCallback(job, { status: 'completed', result });
    console.log(`[WORKER] Job ${job.id} completed`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const retriesRemaining = (job.maxRetries ?? 0) - (job.retryCount ?? 0);

    if (retriesRemaining > 0) {
      await requeueJobForRetry(job.id, errorMessage);
      console.warn(`[WORKER] Job ${job.id} failed, requeued for retry: ${errorMessage}`);
    } else {
      await markJobFailed(job.id, errorMessage);
      await notifyJobCallback(job, { status: 'failed', error: errorMessage });
      console.error(`[WORKER] Job ${job.id} failed (no retries left):`, errorMessage);
    }
  }
}

/**
 * Start the background worker loop
 *
 * The worker checks for pending jobs and processes them in parallel.
 * Edit-mode jobs targeting the same workspace are serialized (one at a time per workspace).
 * All other jobs run concurrently up to MAX_CONCURRENT_JOBS.
 */
export function startWorker(): void {
  if (workerRunning) {
    console.log('[WORKER] Worker already running');
    return;
  }

  workerRunning = true;
  let iterations = 0;

  // Register graceful shutdown handlers
  const shutdownHandler = () => {
    console.log('[WORKER] Received shutdown signal, stopping worker...');
    stopWorker();
  };
  process.on('SIGTERM', shutdownHandler);
  process.on('SIGINT', shutdownHandler);

  console.log(
    `[WORKER] Starting parallel worker loop (max ${MAX_CONCURRENT_JOBS} concurrent jobs)`
  );

  workerIntervalId = setInterval(async () => {
    // Prevent overlapping ticks — if the previous tick is still selecting jobs, skip
    if (workerTickActive) return;
    workerTickActive = true;

    iterations++;

    try {
      // Periodic cleanup and stuck job detection (every ~3-4 minutes)
      if (iterations % CLEANUP_INTERVAL === 0) {
        console.log('[WORKER] Running cleanup and stuck job detection...');
        await cleanupOldJobs();
        await detectStuckJobs();
      }

      // Check capacity
      const available = MAX_CONCURRENT_JOBS - runningJobs.size;
      if (available <= 0) return;

      // Fetch pending jobs (more than we need — some may be filtered out by conflicts)
      const pendingJobs = await getPendingJobs(available + 5);
      if (pendingJobs.length === 0) return;

      // Build set of currently edit-locked workspaces
      const lockedWorkspaces = getEditLockedWorkspaces();
      let started = 0;

      for (const job of pendingJobs) {
        if (runningJobs.size >= MAX_CONCURRENT_JOBS) break;

        const info = extractJobConcurrencyInfo(job);

        // Skip if this edit job would conflict with a running edit on the same workspace
        if (wouldConflict(info, lockedWorkspaces)) {
          continue;
        }

        // Try to claim the job atomically (rename pointer from pending/ to processing/)
        const moved = await moveJob(job.id, 'pending', 'processing');
        if (!moved) continue; // Another tick or recovery already claimed it

        // Track the running job
        runningJobs.set(String(job.id), info);

        // If this is an edit job, lock its workspace for subsequent iterations in this tick
        if (info.isEdit && info.workspacePath) {
          lockedWorkspaces.add(info.workspacePath);
        }

        // Fire and forget — processJobLifecycle handles completion/failure/retry
        processJobLifecycle(job).finally(() => {
          runningJobs.delete(String(job.id));
        });

        started++;
      }

      if (started > 0) {
        console.log(`[WORKER] Started ${started} job(s), ${runningJobs.size} now running`);
      }
    } catch (error) {
      console.error('[WORKER] Worker loop error:', error);
    } finally {
      workerTickActive = false;
    }
  }, POLL_INTERVAL);
}

type CallbackNotification =
  | { status: 'completed'; result: unknown }
  | { status: 'failed'; error: string };

function isHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function signPayload(secret: string, body: string): string {
  const digest = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return `sha256=${digest}`;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function notifyJobCallback(job: Job, notification: CallbackNotification): Promise<void> {
  // Only Claude Code jobs currently carry callback config.
  if (job.type !== 'claude-code') return;
  const payload = job.payload as ClaudeCodeJobPayload;
  const callback = payload.callback;
  if (!callback?.url) return;

  if (!isHttpUrl(callback.url)) {
    console.warn(`[WORKER] Callback URL ignored (non-http): ${callback.url}`);
    return;
  }

  const bodyObj: Record<string, unknown> = {
    jobId: job.id,
    type: job.type,
    status: notification.status,
    timestamp: new Date().toISOString(),
  };
  if (notification.status === 'completed') {
    bodyObj.result = notification.result;
  } else {
    bodyObj.error = notification.error;
  }

  const body = JSON.stringify(bodyObj);
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-workflow-job-id': String(job.id),
    'x-workflow-job-type': job.type,
    'x-workflow-job-status': notification.status,
  };
  if (callback.secret) {
    headers['x-workflow-signature'] = signPayload(callback.secret, body);
  }

  // Retry a few times. Callback delivery should not fail the job.
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(callback.url, {
        method: 'POST',
        headers,
        body,
        // 10s per attempt so we don't block the worker forever
        signal: AbortSignal.timeout(10_000),
      });

      if (res.ok) {
        console.log(`[WORKER] Callback delivered for job ${job.id} (attempt ${attempt})`);
        return;
      }

      const text = await res.text().catch(() => '');
      console.warn(
        `[WORKER] Callback failed for job ${job.id} (attempt ${attempt}) HTTP ${res.status}: ${text.substring(0, 300)}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[WORKER] Callback error for job ${job.id} (attempt ${attempt}): ${msg}`);
    }

    if (attempt < maxAttempts) {
      await sleep(1000 * 2 ** (attempt - 1)); // 1s, 2s
    }
  }
}

/**
 * Stop the background worker loop
 */
export function stopWorker(): void {
  if (!workerRunning || !workerIntervalId) {
    console.log('[WORKER] Worker not running');
    return;
  }

  clearInterval(workerIntervalId);
  workerIntervalId = null;
  workerRunning = false;

  console.log(`[WORKER] Worker stopped (${runningJobs.size} jobs still finishing)`);
}

/**
 * Check if the worker is currently running
 */
export function isWorkerRunning(): boolean {
  return workerRunning;
}

/**
 * Get the number of currently running jobs (for diagnostics)
 */
export function getRunningJobCount(): number {
  return runningJobs.size;
}
