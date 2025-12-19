/**
 * Queue Manager - File-based queue operations
 *
 * Handles all file system operations for the job queue:
 * - Directory initialization
 * - Job CRUD operations
 * - Atomic state transitions via fs.rename
 * - Cleanup of old jobs
 */

import { resolve } from 'node:path';
import { readFile, writeFile, mkdir, readdir, rename, unlink, open } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import crypto from 'node:crypto';
import type { Job, JobId, JobType, JobStatus, QueueFolder } from './types';
import { createJobId, isJob } from './types';

// Queue configuration
const QUEUE_BASE_DIR = 'workspaces/queue';
const QUEUE_FOLDERS: QueueFolder[] = ['pending', 'processing', 'done', 'failed'];
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const PROCESSING_LOCK_FILENAME = 'processing.lock.json';
const PROCESSING_LOCK_STALE_MS = 60 * 60 * 1000; // 1 hour

let initPromise: Promise<void> | null = null;

/**
 * Get the base queue directory path
 */
function getQueueBasePath(): string {
  return resolve(process.cwd(), QUEUE_BASE_DIR);
}

function getProcessingLockPath(): string {
  return resolve(getQueueBasePath(), PROCESSING_LOCK_FILENAME);
}

async function ensureQueueInitialized(): Promise<void> {
  if (!initPromise) {
    initPromise = initializeQueue();
  }
  await initPromise;
}

/**
 * Get the path for a specific queue folder
 */
function getQueueFolderPath(folder: QueueFolder): string {
  return resolve(getQueueBasePath(), folder);
}

/**
 * Generate a job filename with timestamp + UUID for proper ordering
 * Format: 2025-11-29T03-12-22Z-a1b2c3d4.json
 */
function generateJobFilename(jobId: JobId): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${timestamp}-${jobId}.json`;
}

/**
 * Initialize queue directories if they don't exist
 */
export async function initializeQueue(): Promise<void> {
  console.log('[QUEUE] Initializing queue directories...');

  const basePath = getQueueBasePath();

  // Create base directory
  if (!existsSync(basePath)) {
    await mkdir(basePath, { recursive: true });
    console.log(`[QUEUE] Created base directory: ${basePath}`);
  }

  // Create each queue folder
  for (const folder of QUEUE_FOLDERS) {
    const folderPath = getQueueFolderPath(folder);
    if (!existsSync(folderPath)) {
      await mkdir(folderPath, { recursive: true });
      console.log(`[QUEUE] Created folder: ${folderPath}`);
    }
  }

  console.log('[QUEUE] Queue directories initialized');
}

/**
 * Check if any job is currently being processed.
 *
 * NOTE: This only checks if there are job files in the processing folder.
 * It does NOT check for the lock file, because the lock is for preventing
 * concurrent access (mutex), not for indicating processing state.
 * The worker acquires the lock before checking isProcessing(), so checking
 * the lock here would cause the worker to see its own lock and exit early.
 */
export async function isProcessing(): Promise<boolean> {
  await ensureQueueInitialized();
  const processingPath = getQueueFolderPath('processing');

  try {
    const files = await readdir(processingPath);
    const jsonFiles = files.filter((f) => f.endsWith('.json'));
    return jsonFiles.length > 0;
  } catch {
    // Directory might not exist yet
    return false;
  }
}

/**
 * Check if there are any pending jobs
 */
export async function hasPendingJobs(): Promise<boolean> {
  await ensureQueueInitialized();
  const pendingPath = getQueueFolderPath('pending');

  try {
    const files = await readdir(pendingPath);
    const jsonFiles = files.filter((f) => f.endsWith('.json'));
    return jsonFiles.length > 0;
  } catch {
    return false;
  }
}

/**
 * Create a new job in the pending folder
 */
export async function enqueueJob<T>(type: JobType, payload: T): Promise<JobId> {
  await ensureQueueInitialized();
  const jobId = createJobId(crypto.randomUUID().substring(0, 8));
  const filename = generateJobFilename(jobId);
  const filePath = resolve(getQueueFolderPath('pending'), filename);

  const job: Job<T> = {
    id: jobId,
    type,
    payload,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  await writeFile(filePath, JSON.stringify(job, null, 2), 'utf-8');
  console.log(`[QUEUE] Enqueued job ${jobId} (${type})`);

  return jobId;
}

/**
 * Create a job directly in the processing folder (for immediate execution)
 */
export async function createProcessingJob<T>(type: JobType, payload: T): Promise<Job<T>> {
  await ensureQueueInitialized();
  const jobId = createJobId(crypto.randomUUID().substring(0, 8));
  const filename = generateJobFilename(jobId);
  const filePath = resolve(getQueueFolderPath('processing'), filename);

  const job: Job<T> = {
    id: jobId,
    type,
    payload,
    status: 'processing',
    createdAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
  };

  await writeFile(filePath, JSON.stringify(job, null, 2), 'utf-8');
  console.log(`[QUEUE] Created processing job ${jobId} (${type})`);

  return job;
}

/**
 * Find a job file in a specific folder
 */
async function findJobFileInFolder(
  jobId: JobId,
  folder: QueueFolder
): Promise<{ path: string; filename: string } | null> {
  await ensureQueueInitialized();
  const folderPath = getQueueFolderPath(folder);

  try {
    const files = await readdir(folderPath);
    const jobFile = files.find((f) => f.includes(jobId) && f.endsWith('.json'));

    if (jobFile) {
      return { path: resolve(folderPath, jobFile), filename: jobFile };
    }
  } catch {
    // Folder might not exist
  }

  return null;
}

/**
 * Get a job by ID, searching all folders
 */
export async function getJob(jobId: JobId): Promise<Job | null> {
  await ensureQueueInitialized();
  // Search all folders for the job
  for (const folder of QUEUE_FOLDERS) {
    const found = await findJobFileInFolder(jobId, folder);

    if (found) {
      try {
        const content = await readFile(found.path, 'utf-8');
        const job = JSON.parse(content);

        if (isJob(job)) {
          return job;
        }
      } catch (error) {
        console.error(`[QUEUE] Error reading job file ${found.path}:`, error);
      }
    }
  }

  return null;
}

/**
 * Get the next pending job (oldest first based on filename sort)
 */
export async function getNextPendingJob(): Promise<Job | null> {
  await ensureQueueInitialized();
  const pendingPath = getQueueFolderPath('pending');

  try {
    const files = await readdir(pendingPath);
    const jsonFiles = files.filter((f) => f.endsWith('.json')).sort(); // Oldest first

    if (jsonFiles.length === 0) {
      return null;
    }

    const firstFile = jsonFiles[0];
    if (!firstFile) {
      return null;
    }

    const filePath = resolve(pendingPath, firstFile);
    const content = await readFile(filePath, 'utf-8');
    const job = JSON.parse(content);

    if (isJob(job)) {
      return job;
    }
  } catch (error) {
    console.error('[QUEUE] Error getting next pending job:', error);
  }

  return null;
}

/**
 * Move a job from one folder to another (atomic operation)
 */
export async function moveJob(
  jobId: JobId,
  fromFolder: QueueFolder,
  toFolder: QueueFolder
): Promise<boolean> {
  await ensureQueueInitialized();
  const found = await findJobFileInFolder(jobId, fromFolder);

  if (!found) {
    console.error(`[QUEUE] Job ${jobId} not found in ${fromFolder}`);
    return false;
  }

  const toPath = resolve(getQueueFolderPath(toFolder), found.filename);

  try {
    // Atomic move via rename
    await rename(found.path, toPath);

    // Update job status in file
    const content = await readFile(toPath, 'utf-8');
    const job = JSON.parse(content);

    if (toFolder === 'processing') {
      job.status = 'processing';
      job.startedAt = new Date().toISOString();
    } else if (toFolder === 'done') {
      job.status = 'completed';
      job.completedAt = new Date().toISOString();
    } else if (toFolder === 'failed') {
      job.status = 'failed';
      job.completedAt = new Date().toISOString();
    }

    await writeFile(toPath, JSON.stringify(job, null, 2), 'utf-8');

    console.log(`[QUEUE] Moved job ${jobId} from ${fromFolder} to ${toFolder}`);
    return true;
  } catch (error) {
    console.error(`[QUEUE] Error moving job ${jobId}:`, error);
    return false;
  }
}

/**
 * Mark a job as completed and move to done folder
 */
export async function markJobComplete(jobId: JobId, result: unknown): Promise<boolean> {
  await ensureQueueInitialized();
  // Find the job in processing folder
  const found = await findJobFileInFolder(jobId, 'processing');

  if (!found) {
    console.error(`[QUEUE] Job ${jobId} not found in processing folder`);
    return false;
  }

  try {
    // Read and update job
    const content = await readFile(found.path, 'utf-8');
    const job = JSON.parse(content);

    job.status = 'completed';
    job.completedAt = new Date().toISOString();
    job.result = result;

    // Write to done folder
    const donePath = resolve(getQueueFolderPath('done'), found.filename);
    await writeFile(donePath, JSON.stringify(job, null, 2), 'utf-8');

    // Delete from processing
    await unlink(found.path);

    console.log(`[QUEUE] Job ${jobId} completed successfully`);
    return true;
  } catch (error) {
    console.error(`[QUEUE] Error completing job ${jobId}:`, error);
    return false;
  }
}

/**
 * Mark a job as failed and move to failed folder
 */
export async function markJobFailed(jobId: JobId, errorMessage: string): Promise<boolean> {
  await ensureQueueInitialized();
  // Find the job in processing folder
  const found = await findJobFileInFolder(jobId, 'processing');

  if (!found) {
    console.error(`[QUEUE] Job ${jobId} not found in processing folder`);
    return false;
  }

  try {
    // Read and update job
    const content = await readFile(found.path, 'utf-8');
    const job = JSON.parse(content);

    job.status = 'failed';
    job.completedAt = new Date().toISOString();
    job.error = errorMessage;

    // Write to failed folder
    const failedPath = resolve(getQueueFolderPath('failed'), found.filename);
    await writeFile(failedPath, JSON.stringify(job, null, 2), 'utf-8');

    // Delete from processing
    await unlink(found.path);

    console.log(`[QUEUE] Job ${jobId} failed: ${errorMessage}`);
    return true;
  } catch (error) {
    console.error(`[QUEUE] Error marking job ${jobId} as failed:`, error);
    return false;
  }
}

/**
 * Cleanup old jobs from done and failed folders (7-day retention)
 */
export async function cleanupOldJobs(): Promise<{ deleted: number; errors: number }> {
  await ensureQueueInitialized();
  let deleted = 0;
  let errors = 0;
  const now = Date.now();

  for (const folder of ['done', 'failed'] as QueueFolder[]) {
    const folderPath = getQueueFolderPath(folder);

    try {
      const files = await readdir(folderPath);
      const jsonFiles = files.filter((f) => f.endsWith('.json'));

      for (const filename of jsonFiles) {
        const filePath = resolve(folderPath, filename);

        try {
          const content = await readFile(filePath, 'utf-8');
          const job = JSON.parse(content);

          if (job.completedAt) {
            const completedTime = new Date(job.completedAt).getTime();
            const age = now - completedTime;

            if (age > RETENTION_MS) {
              await unlink(filePath);
              deleted++;
              console.log(`[QUEUE] Deleted old job: ${filename}`);
            }
          }
        } catch (error) {
          errors++;
          console.error(`[QUEUE] Error processing file ${filename}:`, error);
        }
      }
    } catch (error) {
      console.error(`[QUEUE] Error reading folder ${folder}:`, error);
    }
  }

  if (deleted > 0 || errors > 0) {
    console.log(`[QUEUE] Cleanup complete: ${deleted} deleted, ${errors} errors`);
  }

  return { deleted, errors };
}

/**
 * List all jobs with optional status filter
 */
export async function listJobs(statusFilter?: JobStatus[]): Promise<Job[]> {
  await ensureQueueInitialized();
  const jobs: Job[] = [];

  // Map status to folder
  const foldersToSearch: QueueFolder[] = statusFilter
    ? statusFilter.map((s) => (s === 'completed' ? 'done' : s) as QueueFolder)
    : QUEUE_FOLDERS;

  for (const folder of foldersToSearch) {
    const folderPath = getQueueFolderPath(folder);

    try {
      const files = await readdir(folderPath);
      const jsonFiles = files.filter((f) => f.endsWith('.json'));

      for (const filename of jsonFiles) {
        try {
          const content = await readFile(resolve(folderPath, filename), 'utf-8');
          const job = JSON.parse(content);

          if (isJob(job)) {
            jobs.push(job);
          }
        } catch (error) {
          console.error(`[QUEUE] Error reading job file ${filename}:`, error);
        }
      }
    } catch {
      // Folder might not exist
    }
  }

  // Sort by createdAt (newest first)
  return jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Delete a finished job (completed/failed) by ID.
 *
 * This is intended for external orchestrators (e.g. n8n) that have processed the result
 * and want to remove it early rather than waiting for retention cleanup.
 *
 * Safety: we only delete from the finished folders (done/failed) and never touch
 * pending/processing jobs.
 */
export async function deleteFinishedJob(
  jobId: JobId
): Promise<
  | { success: true; deletedFrom: 'done' | 'failed' }
  | { success: false; reason: 'not_found' | 'not_finished' | 'read_error' }
> {
  await ensureQueueInitialized();

  // If it exists in pending/processing, refuse.
  const inPending = await findJobFileInFolder(jobId, 'pending');
  if (inPending) {
    return { success: false, reason: 'not_finished' };
  }
  const inProcessing = await findJobFileInFolder(jobId, 'processing');
  if (inProcessing) {
    return { success: false, reason: 'not_finished' };
  }

  // Only allow deletion from finished folders.
  for (const folder of ['done', 'failed'] as const) {
    const found = await findJobFileInFolder(jobId, folder);
    if (!found) continue;

    try {
      // Best-effort validation: ensure the file is a valid job.
      const content = await readFile(found.path, 'utf-8');
      const parsed: unknown = JSON.parse(content);
      if (!isJob(parsed)) {
        return { success: false, reason: 'read_error' };
      }

      await unlink(found.path);
      return { success: true, deletedFrom: folder };
    } catch (error) {
      console.error(`[QUEUE] Error deleting finished job ${jobId} from ${folder}:`, error);
      return { success: false, reason: 'read_error' };
    }
  }

  return { success: false, reason: 'not_found' };
}

/**
 * Acquire an atomic processing lock for execute-or-queue and worker processing.
 * Prevents two concurrent requests from both deciding to "execute immediately".
 *
 * Best-effort stale lock cleanup: if a lock exists and is older than the stale threshold,
 * we remove it and try again.
 */
export async function acquireProcessingLock(
  owner: 'api' | 'worker'
): Promise<{ acquired: boolean; release: () => Promise<void> }> {
  await ensureQueueInitialized();
  const lockPath = getProcessingLockPath();
  const now = Date.now();

  const release = async () => {
    try {
      await unlink(lockPath);
    } catch {
      // ignore
    }
  };

  // Fast path: attempt exclusive create
  try {
    const fh = await open(lockPath, 'wx');
    try {
      await fh.writeFile(
        JSON.stringify(
          {
            owner,
            createdAt: new Date(now).toISOString(),
            pid: process.pid,
          },
          null,
          2
        ),
        'utf-8'
      );
    } finally {
      await fh.close();
    }
    return { acquired: true, release };
  } catch {
    // Lock exists or cannot be created.
  }

  // Stale lock handling
  try {
    const content = await readFile(lockPath, 'utf-8');
    const parsed = JSON.parse(content) as { createdAt?: string };
    const createdAt = parsed.createdAt ? new Date(parsed.createdAt).getTime() : NaN;
    const ageMs = Number.isFinite(createdAt) ? now - createdAt : PROCESSING_LOCK_STALE_MS + 1;
    if (ageMs > PROCESSING_LOCK_STALE_MS) {
      console.warn(
        `[QUEUE] Stale processing lock detected (age ${Math.round(ageMs / 1000)}s), removing...`
      );
      await release();
      // Retry once
      return await acquireProcessingLock(owner);
    }
  } catch {
    // ignore parse/read errors
  }

  return { acquired: false, release };
}
