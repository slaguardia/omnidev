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
const JOBS_BASE_DIR = 'workspaces/jobs';
const QUEUE_FOLDERS: QueueFolder[] = ['pending', 'processing']; // Only active queue folders
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

/**
 * Get the base jobs directory path (canonical job store)
 */
function getJobsBasePath(): string {
  return resolve(process.cwd(), JOBS_BASE_DIR);
}

/**
 * Get the path for canonical job records
 */
function getJobStorePath(): string {
  return resolve(getJobsBasePath(), 'by-id');
}

/**
 * Get the path for finished job pointers
 */
function getFinishedPath(status: 'completed' | 'failed'): string {
  return resolve(getJobsBasePath(), 'finished', status);
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
 * Generate a pointer filename with timestamp + UUID for proper ordering
 * Format: 2025-11-29T03-12-22Z-a1b2c3d4.ref.json
 */
function generatePointerFilename(jobId: JobId): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${timestamp}-${jobId}.ref.json`;
}

/**
 * Get the canonical job record path
 */
function getCanonicalJobPath(jobId: JobId): string {
  return resolve(getJobStorePath(), `${jobId}.json`);
}

/**
 * Get the finished pointer path
 */
function getFinishedPointerPath(jobId: JobId, status: 'completed' | 'failed'): string {
  return resolve(getFinishedPath(status), `${jobId}.ref.json`);
}

/**
 * Initialize queue directories and job store if they don't exist
 */
export async function initializeQueue(): Promise<void> {
  console.log('[QUEUE] Initializing queue directories and job store...');

  const queueBasePath = getQueueBasePath();
  const jobsBasePath = getJobsBasePath();

  // Create queue base directory
  if (!existsSync(queueBasePath)) {
    await mkdir(queueBasePath, { recursive: true });
    console.log(`[QUEUE] Created queue base directory: ${queueBasePath}`);
  }

  // Create each queue folder (only pending/processing)
  for (const folder of QUEUE_FOLDERS) {
    const folderPath = getQueueFolderPath(folder);
    if (!existsSync(folderPath)) {
      await mkdir(folderPath, { recursive: true });
      console.log(`[QUEUE] Created queue folder: ${folderPath}`);
    }
  }

  // Create job store directories
  if (!existsSync(jobsBasePath)) {
    await mkdir(jobsBasePath, { recursive: true });
    console.log(`[QUEUE] Created jobs base directory: ${jobsBasePath}`);
  }

  const jobStorePath = getJobStorePath();
  if (!existsSync(jobStorePath)) {
    await mkdir(jobStorePath, { recursive: true });
    console.log(`[QUEUE] Created job store directory: ${jobStorePath}`);
  }

  // Create finished pointer directories
  for (const status of ['completed', 'failed'] as const) {
    const finishedPath = getFinishedPath(status);
    if (!existsSync(finishedPath)) {
      await mkdir(finishedPath, { recursive: true });
      console.log(`[QUEUE] Created finished directory: ${finishedPath}`);
    }
  }

  console.log('[QUEUE] Queue directories and job store initialized');

  // Run migration from legacy layout if needed
  await migrateLegacyLayout();
}

/**
 * Migrate from legacy queue layout (done/failed folders) to new normalized layout
 * This is idempotent and safe to run multiple times
 */
async function migrateLegacyLayout(): Promise<void> {
  const legacyDonePath = resolve(getQueueBasePath(), 'done');
  const legacyFailedPath = resolve(getQueueBasePath(), 'failed');
  const legacyHistoryPath = resolve(process.cwd(), 'workspaces', 'execution-history.json');

  let migrated = 0;
  let errors = 0;

  // Migrate legacy done/failed folders
  for (const [legacyFolder, status] of [
    [legacyDonePath, 'completed'] as const,
    [legacyFailedPath, 'failed'] as const,
  ]) {
    if (!existsSync(legacyFolder)) {
      continue;
    }

    try {
      const files = await readdir(legacyFolder);
      const jsonFiles = files.filter((f) => f.endsWith('.json') && !f.endsWith('.ref.json'));

      for (const filename of jsonFiles) {
        try {
          const legacyFilePath = resolve(legacyFolder, filename);
          const content = await readFile(legacyFilePath, 'utf-8');
          const job = JSON.parse(content);

          if (!isJob(job)) {
            console.warn(`[QUEUE MIGRATION] Skipping invalid job file: ${filename}`);
            continue;
          }

          // Check if already migrated (canonical record exists)
          const canonicalPath = getCanonicalJobPath(job.id);
          if (existsSync(canonicalPath)) {
            // Already migrated, just delete legacy file
            await unlink(legacyFilePath);
            continue;
          }

          // Write canonical job record
          await writeJobRecord(job);

          // Create finished pointer
          await addFinishedPointer(job.id, status);

          // Delete legacy file
          await unlink(legacyFilePath);

          migrated++;
          console.log(`[QUEUE MIGRATION] Migrated job ${job.id} from ${legacyFolder}`);
        } catch (error) {
          errors++;
          console.error(`[QUEUE MIGRATION] Error migrating file ${filename}:`, error);
        }
      }

      // Try to remove empty legacy folder
      try {
        const remainingFiles = await readdir(legacyFolder);
        if (remainingFiles.length === 0) {
          // Folder is empty, but we'll leave it for now to avoid issues
          // It can be manually removed later
        }
      } catch {
        // Ignore errors
      }
    } catch (error) {
      console.error(`[QUEUE MIGRATION] Error reading legacy folder ${legacyFolder}:`, error);
    }
  }

  // Note: We don't migrate execution-history.json because:
  // 1. It may contain entries that don't correspond to jobs
  // 2. History is now derived from finished jobs, so old entries will naturally disappear
  // 3. The file can be manually deleted if desired
  if (existsSync(legacyHistoryPath)) {
    console.log(
      '[QUEUE MIGRATION] Legacy execution-history.json exists but will not be migrated. History is now derived from finished jobs.'
    );
  }

  if (migrated > 0 || errors > 0) {
    console.log(`[QUEUE MIGRATION] Migration complete: ${migrated} migrated, ${errors} errors`);
  }
}

/**
 * Check if any job is currently being processed.
 *
 * NOTE: This only checks if there are pointer files in the processing folder.
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
    const pointerFiles = files.filter((f) => f.endsWith('.ref.json'));
    return pointerFiles.length > 0;
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
    const pointerFiles = files.filter((f) => f.endsWith('.ref.json'));
    return pointerFiles.length > 0;
  } catch {
    return false;
  }
}

/**
 * Write canonical job record to job store
 */
async function writeJobRecord<T>(job: Job<T>): Promise<void> {
  const canonicalPath = getCanonicalJobPath(job.id);
  await writeFile(canonicalPath, JSON.stringify(job, null, 2), 'utf-8');
}

/**
 * Read canonical job record from job store
 */
async function readJobRecord(jobId: JobId): Promise<Job | null> {
  const canonicalPath = getCanonicalJobPath(jobId);
  try {
    if (!existsSync(canonicalPath)) {
      return null;
    }
    const content = await readFile(canonicalPath, 'utf-8');
    const job = JSON.parse(content);
    if (isJob(job)) {
      return job;
    }
    return null;
  } catch (error) {
    console.error(`[QUEUE] Error reading job record ${jobId}:`, error);
    return null;
  }
}

/**
 * Update canonical job record with a partial update
 */
async function updateJobRecord(
  jobId: JobId,
  updates: Partial<Pick<Job, 'status' | 'startedAt' | 'completedAt' | 'result' | 'error'>>
): Promise<boolean> {
  const job = await readJobRecord(jobId);
  if (!job) {
    return false;
  }
  const updated = { ...job, ...updates };
  await writeJobRecord(updated);
  return true;
}

/**
 * Create a finished pointer file
 */
async function addFinishedPointer(jobId: JobId, status: 'completed' | 'failed'): Promise<void> {
  const pointerPath = getFinishedPointerPath(jobId, status);
  const pointer = { jobId, status, createdAt: new Date().toISOString() };
  await writeFile(pointerPath, JSON.stringify(pointer, null, 2), 'utf-8');
}

/**
 * Remove a finished pointer file
 */
async function _removeFinishedPointer(jobId: JobId, status: 'completed' | 'failed'): Promise<void> {
  const pointerPath = getFinishedPointerPath(jobId, status);
  try {
    if (existsSync(pointerPath)) {
      await unlink(pointerPath);
    }
  } catch (error) {
    console.error(`[QUEUE] Error removing finished pointer ${jobId}:`, error);
  }
}

/**
 * Create a new job in the pending folder
 */
export async function enqueueJob<T>(type: JobType, payload: T): Promise<JobId> {
  await ensureQueueInitialized();
  const jobId = createJobId(crypto.randomUUID().substring(0, 8));

  const job: Job<T> = {
    id: jobId,
    type,
    payload,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  // Write canonical job record
  await writeJobRecord(job);

  // Write pending pointer
  const pointerFilename = generatePointerFilename(jobId);
  const pointerPath = resolve(getQueueFolderPath('pending'), pointerFilename);
  const pointer = { jobId, status: 'pending', createdAt: job.createdAt };
  await writeFile(pointerPath, JSON.stringify(pointer, null, 2), 'utf-8');

  console.log(`[QUEUE] Enqueued job ${jobId} (${type})`);

  return jobId;
}

/**
 * Create a job directly in the processing folder (for immediate execution)
 */
export async function createProcessingJob<T>(type: JobType, payload: T): Promise<Job<T>> {
  await ensureQueueInitialized();
  const jobId = createJobId(crypto.randomUUID().substring(0, 8));

  const job: Job<T> = {
    id: jobId,
    type,
    payload,
    status: 'processing',
    createdAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
  };

  // Write canonical job record
  await writeJobRecord(job);

  // Write processing pointer
  const pointerFilename = generatePointerFilename(jobId);
  const pointerPath = resolve(getQueueFolderPath('processing'), pointerFilename);
  const pointer = { jobId, status: 'processing', createdAt: job.createdAt };
  await writeFile(pointerPath, JSON.stringify(pointer, null, 2), 'utf-8');

  console.log(`[QUEUE] Created processing job ${jobId} (${type})`);

  return job;
}

/**
 * Find a pointer file in a specific queue folder
 */
async function findPointerInQueueFolder(
  jobId: JobId,
  folder: QueueFolder
): Promise<{ path: string; filename: string } | null> {
  await ensureQueueInitialized();
  const folderPath = getQueueFolderPath(folder);

  try {
    const files = await readdir(folderPath);
    const pointerFile = files.find((f) => f.includes(jobId) && f.endsWith('.ref.json'));

    if (pointerFile) {
      return { path: resolve(folderPath, pointerFile), filename: pointerFile };
    }
  } catch {
    // Folder might not exist
  }

  return null;
}

/**
 * Find a finished pointer file
 */
async function findFinishedPointer(
  jobId: JobId,
  status: 'completed' | 'failed'
): Promise<{ path: string; filename: string } | null> {
  await ensureQueueInitialized();
  const finishedPath = getFinishedPath(status);

  try {
    const files = await readdir(finishedPath);
    const pointerFile = files.find((f) => f === `${jobId}.ref.json`);

    if (pointerFile) {
      return { path: resolve(finishedPath, pointerFile), filename: pointerFile };
    }
  } catch {
    // Folder might not exist
  }

  return null;
}

/**
 * Get a job by ID from canonical store
 */
export async function getJob(jobId: JobId): Promise<Job | null> {
  await ensureQueueInitialized();
  return await readJobRecord(jobId);
}

/**
 * Get the next pending job (oldest first based on filename sort)
 */
export async function getNextPendingJob(): Promise<Job | null> {
  await ensureQueueInitialized();
  const pendingPath = getQueueFolderPath('pending');

  try {
    const files = await readdir(pendingPath);
    const pointerFiles = files.filter((f) => f.endsWith('.ref.json')).sort(); // Oldest first

    if (pointerFiles.length === 0) {
      return null;
    }

    const firstFile = pointerFiles[0];
    if (!firstFile) {
      return null;
    }

    // Read pointer to get jobId
    const pointerPath = resolve(pendingPath, firstFile);
    const pointerContent = await readFile(pointerPath, 'utf-8');
    const pointer = JSON.parse(pointerContent) as { jobId: string };

    // Load canonical job record
    return await readJobRecord(createJobId(pointer.jobId));
  } catch (error) {
    console.error('[QUEUE] Error getting next pending job:', error);
  }

  return null;
}

/**
 * Move a job from one queue folder to another (atomic operation via pointer rename)
 */
export async function moveJob(
  jobId: JobId,
  fromFolder: QueueFolder,
  toFolder: QueueFolder
): Promise<boolean> {
  await ensureQueueInitialized();
  const found = await findPointerInQueueFolder(jobId, fromFolder);

  if (!found) {
    console.error(`[QUEUE] Job ${jobId} not found in ${fromFolder}`);
    return false;
  }

  const toPath = resolve(getQueueFolderPath(toFolder), found.filename);

  try {
    // Atomic move via rename
    await rename(found.path, toPath);

    // Update canonical job record
    if (toFolder === 'processing') {
      await updateJobRecord(jobId, {
        status: 'processing',
        startedAt: new Date().toISOString(),
      });
    }

    console.log(`[QUEUE] Moved job ${jobId} from ${fromFolder} to ${toFolder}`);
    return true;
  } catch (error) {
    console.error(`[QUEUE] Error moving job ${jobId}:`, error);
    return false;
  }
}

/**
 * Mark a job as completed and create finished pointer
 */
export async function markJobComplete(jobId: JobId, result: unknown): Promise<boolean> {
  await ensureQueueInitialized();
  // Find the processing pointer
  const found = await findPointerInQueueFolder(jobId, 'processing');

  if (!found) {
    console.error(`[QUEUE] Job ${jobId} not found in processing folder`);
    return false;
  }

  try {
    // Update canonical job record
    const updated = await updateJobRecord(jobId, {
      status: 'completed',
      completedAt: new Date().toISOString(),
      result,
    });

    if (!updated) {
      console.error(`[QUEUE] Failed to update job record ${jobId}`);
      return false;
    }

    // Delete processing pointer
    await unlink(found.path);

    // Create finished pointer
    await addFinishedPointer(jobId, 'completed');

    console.log(`[QUEUE] Job ${jobId} completed successfully`);
    return true;
  } catch (error) {
    console.error(`[QUEUE] Error completing job ${jobId}:`, error);
    return false;
  }
}

/**
 * Mark a job as failed and create finished pointer
 */
export async function markJobFailed(jobId: JobId, errorMessage: string): Promise<boolean> {
  await ensureQueueInitialized();
  // Find the processing pointer
  const found = await findPointerInQueueFolder(jobId, 'processing');

  if (!found) {
    console.error(`[QUEUE] Job ${jobId} not found in processing folder`);
    return false;
  }

  try {
    // Update canonical job record
    const updated = await updateJobRecord(jobId, {
      status: 'failed',
      completedAt: new Date().toISOString(),
      error: errorMessage,
    });

    if (!updated) {
      console.error(`[QUEUE] Failed to update job record ${jobId}`);
      return false;
    }

    // Delete processing pointer
    await unlink(found.path);

    // Create finished pointer
    await addFinishedPointer(jobId, 'failed');

    console.log(`[QUEUE] Job ${jobId} failed: ${errorMessage}`);
    return true;
  } catch (error) {
    console.error(`[QUEUE] Error marking job ${jobId} as failed:`, error);
    return false;
  }
}

/**
 * Cleanup old jobs from finished pointers and canonical store (7-day retention)
 */
export async function cleanupOldJobs(): Promise<{ deleted: number; errors: number }> {
  await ensureQueueInitialized();
  let deleted = 0;
  let errors = 0;
  const now = Date.now();

  for (const status of ['completed', 'failed'] as const) {
    const finishedPath = getFinishedPath(status);

    try {
      const files = await readdir(finishedPath);
      const pointerFiles = files.filter((f) => f.endsWith('.ref.json'));

      for (const pointerFilename of pointerFiles) {
        const pointerPath = resolve(finishedPath, pointerFilename);
        const jobId = pointerFilename.replace('.ref.json', '') as JobId;

        try {
          // Read job record to check completedAt
          const job = await readJobRecord(jobId);
          if (!job || !job.completedAt) {
            // Skip if job record missing or no completedAt
            continue;
          }

          const completedTime = new Date(job.completedAt).getTime();
          const age = now - completedTime;

          if (age > RETENTION_MS) {
            // Delete finished pointer
            await unlink(pointerPath);

            // Delete canonical job record
            const canonicalPath = getCanonicalJobPath(jobId);
            if (existsSync(canonicalPath)) {
              await unlink(canonicalPath);
            }

            deleted++;
            console.log(`[QUEUE] Deleted old job: ${jobId}`);
          }
        } catch (error) {
          errors++;
          console.error(`[QUEUE] Error processing finished pointer ${pointerFilename}:`, error);
        }
      }
    } catch (error) {
      console.error(`[QUEUE] Error reading finished folder ${status}:`, error);
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

  // If no filter, get all statuses
  const statusesToSearch: JobStatus[] = statusFilter || [
    'pending',
    'processing',
    'completed',
    'failed',
  ];

  for (const status of statusesToSearch) {
    if (status === 'pending' || status === 'processing') {
      // Read from queue pointers
      const folderPath = getQueueFolderPath(status);
      try {
        const files = await readdir(folderPath);
        const pointerFiles = files.filter((f) => f.endsWith('.ref.json'));

        for (const pointerFilename of pointerFiles) {
          try {
            const pointerPath = resolve(folderPath, pointerFilename);
            const pointerContent = await readFile(pointerPath, 'utf-8');
            const pointer = JSON.parse(pointerContent) as { jobId: string };
            const job = await readJobRecord(createJobId(pointer.jobId));
            if (job) {
              jobs.push(job);
            }
          } catch (error) {
            console.error(`[QUEUE] Error reading pointer ${pointerFilename}:`, error);
          }
        }
      } catch {
        // Folder might not exist
      }
    } else if (status === 'completed' || status === 'failed') {
      // Read from finished pointers
      const finishedPath = getFinishedPath(status);
      try {
        const files = await readdir(finishedPath);
        const pointerFiles = files.filter((f) => f.endsWith('.ref.json'));

        for (const pointerFilename of pointerFiles) {
          try {
            const jobId = pointerFilename.replace('.ref.json', '') as JobId;
            const job = await readJobRecord(jobId);
            if (job) {
              jobs.push(job);
            }
          } catch (error) {
            console.error(`[QUEUE] Error reading finished pointer ${pointerFilename}:`, error);
          }
        }
      } catch {
        // Folder might not exist
      }
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
 * Safety: we only delete finished jobs and never touch pending/processing jobs.
 */
export async function deleteFinishedJob(
  jobId: JobId
): Promise<
  | { success: true; deletedFrom: 'completed' | 'failed' }
  | { success: false; reason: 'not_found' | 'not_finished' | 'read_error' }
> {
  await ensureQueueInitialized();

  // If it exists in pending/processing, refuse.
  const inPending = await findPointerInQueueFolder(jobId, 'pending');
  if (inPending) {
    return { success: false, reason: 'not_finished' };
  }
  const inProcessing = await findPointerInQueueFolder(jobId, 'processing');
  if (inProcessing) {
    return { success: false, reason: 'not_finished' };
  }

  // Only allow deletion from finished pointers.
  for (const status of ['completed', 'failed'] as const) {
    const found = await findFinishedPointer(jobId, status);
    if (!found) continue;

    try {
      // Best-effort validation: ensure the job record exists and is valid.
      const job = await readJobRecord(jobId);
      if (!job) {
        return { success: false, reason: 'read_error' };
      }

      // Delete finished pointer
      await unlink(found.path);

      // Delete canonical job record
      const canonicalPath = getCanonicalJobPath(jobId);
      if (existsSync(canonicalPath)) {
        await unlink(canonicalPath);
      }

      return { success: true, deletedFrom: status };
    } catch (error) {
      console.error(`[QUEUE] Error deleting finished job ${jobId} from ${status}:`, error);
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
