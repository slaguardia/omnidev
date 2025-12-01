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
import {
  isProcessing,
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
 * Main entry point for API routes - execute immediately or queue
 *
 * @returns { immediate: true, result } if executed immediately
 * @returns { immediate: false, jobId } if queued
 */
export async function executeOrQueue<T>(type: JobType, payload: T): Promise<ExecutionResult> {
  // Check if something is already processing
  const processing = await isProcessing();

  if (!processing) {
    // Nothing is processing - execute immediately
    console.log(`[WORKER] No jobs processing, executing ${type} immediately`);

    // Create job in processing state to block other concurrent requests
    const job = await createProcessingJob(type, payload);

    try {
      const result = await processJob(job);
      await markJobComplete(job.id, result);

      console.log(`[WORKER] Job ${job.id} completed immediately`);
      return { immediate: true, result };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await markJobFailed(job.id, errorMessage);

      console.error(`[WORKER] Job ${job.id} failed:`, errorMessage);
      throw error; // Re-throw for API to handle
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
        console.log(`[WORKER] Job ${job.id} completed`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await markJobFailed(job.id, errorMessage);
        console.error(`[WORKER] Job ${job.id} failed:`, errorMessage);
      }
    } catch (error) {
      console.error('[WORKER] Worker loop error:', error);
    }
  }, POLL_INTERVAL);
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
