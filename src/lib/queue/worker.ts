/**
 * Queue Worker - Execute-or-queue pattern implementation
 *
 * Main entry point for API routes:
 * - If nothing is processing, execute immediately and return result
 * - If something is processing, queue the job and return job ID
 *
 * Background worker loop processes queued jobs sequentially.
 */

import type { Job, JobType, ExecutionResult, ClaudeCodeJobPayload } from './types';
import crypto from 'node:crypto';
import {
  isProcessing,
  acquireProcessingLock,
  createProcessingJob,
  enqueueJob,
  getNextPendingJob,
  moveJob,
  markJobComplete,
  markJobFailed,
  cleanupOldJobs,
} from './queue-manager';
import {
  executeClaudeCodeJob,
  executeGitPushJob,
  executeGitMRJob,
  executeWorkspaceCleanupJob,
} from './job-handlers';

// Worker configuration
const POLL_INTERVAL = 2000; // 2 seconds
const CLEANUP_INTERVAL = 100; // Run cleanup every 100 iterations (~3-4 minutes)

// Worker state
let workerRunning = false;
let workerIntervalId: ReturnType<typeof setInterval> | null = null;

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
      await markJobFailed(job.id, errorMessage);
      await notifyJobCallback(job, { status: 'failed', error: errorMessage });

      console.error(`[WORKER] Job ${job.id} failed:`, errorMessage);
      throw error; // Re-throw for API to handle
    } finally {
      await lock.release();
    }
  }

  // Something is processing - queue the job
  // Double-check: if already processing, enqueue; otherwise we still enqueue to preserve ordering
  // and avoid long HTTP requests when there's contention.
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

    default:
      throw new Error(`Unknown job type: ${job.type}`);
  }
}

/**
 * Start the background worker loop
 *
 * The worker checks for pending jobs and processes them sequentially.
 * It only processes one job at a time to prevent overlapping operations.
 */
export function startWorker(): void {
  if (workerRunning) {
    console.log('[WORKER] Worker already running');
    return;
  }

  workerRunning = true;
  let iterations = 0;

  console.log('[WORKER] Starting background worker loop');

  workerIntervalId = setInterval(async () => {
    iterations++;

    try {
      // Periodic cleanup (every ~3-4 minutes)
      if (iterations % CLEANUP_INTERVAL === 0) {
        console.log('[WORKER] Running cleanup...');
        await cleanupOldJobs();
      }

      // Acquire lock for worker processing. If another worker/API is processing, skip.
      const lock = await acquireProcessingLock('worker');
      if (!lock.acquired) {
        return;
      }

      try {
        // Skip if already processing (another job is running)
        if (await isProcessing()) {
          return;
        }

        // Get next pending job
        const job = await getNextPendingJob();

        if (!job) {
          return; // No pending jobs
        }

        // Move job to processing
        const moved = await moveJob(job.id, 'pending', 'processing');

        if (!moved) {
          console.error(`[WORKER] Failed to move job ${job.id} to processing`);
          return;
        }

        // Process the job
        try {
          const result = await processJob(job);
          await markJobComplete(job.id, result);
          await notifyJobCallback(job, { status: 'completed', result });
          console.log(`[WORKER] Job ${job.id} completed`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          await markJobFailed(job.id, errorMessage);
          await notifyJobCallback(job, { status: 'failed', error: errorMessage });
          console.error(`[WORKER] Job ${job.id} failed:`, errorMessage);
        }
      } finally {
        await lock.release();
      }
    } catch (error) {
      console.error('[WORKER] Worker loop error:', error);
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

  console.log('[WORKER] Worker stopped');
}

/**
 * Check if the worker is currently running
 */
export function isWorkerRunning(): boolean {
  return workerRunning;
}
