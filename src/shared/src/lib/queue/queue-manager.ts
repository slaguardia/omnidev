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
import { isLegacyFileQueueEnabled, LEGACY_FILE_QUEUE_DISABLED_ERROR } from './legacy-file-queue';

// Queue configuration
const QUEUE_BASE_DIR = 'data/queue';
const JOBS_BASE_DIR = 'data/jobs';
const QUEUE_FOLDERS: QueueFolder[] = ['pending', 'processing']; // Only active queue folders
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const PROCESSING_LOCK_FILENAME = 'processing.lock.json';
const PROCESSING_LOCK_STALE_MS = 10 * 60 * 1000; // 10 minutes (margin above Claude Code's ~5min inactivity timeout)
const STUCK_JOB_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

// Use globalThis to persist across hot module reloads in development
const globalKey = Symbol.for('omnidev.queue.initPromise');
type GlobalWithInit = typeof globalThis & { [globalKey]?: Promise<void> };

/**
 * Get or create the initialization promise (singleton pattern).
 * Ensures initialization runs exactly once, even across hot reloads.
 */
function getOrCreateInitPromise(): Promise<void> {
  const g = globalThis as GlobalWithInit;
  if (!g[globalKey]) {
    g[globalKey] = performQueueInitialization();
  }
  return g[globalKey];
}

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
  await getOrCreateInitPromise();
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
 * Initialize queue directories and job store if they don't exist.
 * Safe to call multiple times - only runs once.
 */
export async function initializeQueue(): Promise<void> {
  if (!isLegacyFileQueueEnabled()) {
    return;
  }
  await getOrCreateInitPromise();
}

/**
 * Internal initialization logic - only called once via getOrCreateInitPromise()
 */
async function performQueueInitialization(): Promise<void> {
  if (!isLegacyFileQueueEnabled()) {
    console.log('[QUEUE] Legacy file queue disabled — skipping data/queue initialization.');
    return;
  }

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

  // Recover any orphaned jobs left in processing/ from a previous crash
  await recoverOrphanedJobs();
}

/**
 * Migrate from legacy queue layout (done/failed folders) to new normalized layout
 * This is idempotent and safe to run multiple times
 */
async function migrateLegacyLayout(): Promise<void> {
  const legacyDonePath = resolve(getQueueBasePath(), 'done');
  const legacyFailedPath = resolve(getQueueBasePath(), 'failed');
  const legacyHistoryPath = resolve(process.cwd(), 'data', 'execution-history.json');

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
  if (!isLegacyFileQueueEnabled()) return false;
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
  if (!isLegacyFileQueueEnabled()) return false;
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
  updates: Partial<
    Pick<
      Job,
      'status' | 'startedAt' | 'completedAt' | 'result' | 'error' | 'retryCount' | 'retryAfter'
    >
  >
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
/**
 * Get default max retries for a job type
 */
function getDefaultMaxRetries(type: JobType): number {
  switch (type) {
    case 'claude-code':
    case 'ralph-stage':
      return 2; // Expensive Claude Code-backed jobs, can fail transiently
    case 'git-push':
    case 'git-mr':
      return 1; // Quick network ops, single retry
    case 'workspace-cleanup':
      return 0; // Best-effort, not critical
    default:
      return 0;
  }
}

/**
 * Create a new job in the pending folder
 */
export async function enqueueJob<T>(type: JobType, payload: T): Promise<JobId> {
  if (!isLegacyFileQueueEnabled()) {
    throw new Error(LEGACY_FILE_QUEUE_DISABLED_ERROR);
  }
  await ensureQueueInitialized();
  const jobId = createJobId(crypto.randomUUID().substring(0, 8));

  const job: Job<T> = {
    id: jobId,
    type,
    payload,
    status: 'pending',
    createdAt: new Date().toISOString(),
    retryCount: 0,
    maxRetries: getDefaultMaxRetries(type),
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
  if (!isLegacyFileQueueEnabled()) {
    throw new Error(LEGACY_FILE_QUEUE_DISABLED_ERROR);
  }
  await ensureQueueInitialized();
  const jobId = createJobId(crypto.randomUUID().substring(0, 8));

  const job: Job<T> = {
    id: jobId,
    type,
    payload,
    status: 'processing',
    createdAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    retryCount: 0,
    maxRetries: getDefaultMaxRetries(type),
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
  if (!isLegacyFileQueueEnabled()) return null;
  await ensureQueueInitialized();
  return await readJobRecord(jobId);
}

/**
 * Get multiple pending jobs that are ready to process (oldest first).
 * Respects retry backoff — jobs with a future retryAfter are skipped.
 */
export async function getPendingJobs(limit: number = 10): Promise<Job[]> {
  if (!isLegacyFileQueueEnabled()) return [];
  await ensureQueueInitialized();
  const pendingPath = getQueueFolderPath('pending');
  const jobs: Job[] = [];

  try {
    const files = await readdir(pendingPath);
    const pointerFiles = files.filter((f) => f.endsWith('.ref.json')).sort(); // Oldest first

    if (pointerFiles.length === 0) return [];

    const now = Date.now();

    for (const pointerFilename of pointerFiles) {
      if (jobs.length >= limit) break;

      const pointerPath = resolve(pendingPath, pointerFilename);
      const pointerContent = await readFile(pointerPath, 'utf-8');
      const pointer = JSON.parse(pointerContent) as { jobId: string };

      const job = await readJobRecord(createJobId(pointer.jobId));
      if (!job) continue;

      // Skip jobs that are waiting for retry backoff
      if (job.retryAfter) {
        const retryAfterTime = new Date(job.retryAfter).getTime();
        if (now < retryAfterTime) continue;
      }

      jobs.push(job);
    }
  } catch (error) {
    console.error('[QUEUE] Error getting pending jobs:', error);
  }

  return jobs;
}

/**
 * Get the next pending job (oldest first based on filename sort)
 */
export async function getNextPendingJob(): Promise<Job | null> {
  if (!isLegacyFileQueueEnabled()) return null;
  await ensureQueueInitialized();
  const pendingPath = getQueueFolderPath('pending');

  try {
    const files = await readdir(pendingPath);
    const pointerFiles = files.filter((f) => f.endsWith('.ref.json')).sort(); // Oldest first

    if (pointerFiles.length === 0) {
      return null;
    }

    const now = Date.now();

    // Iterate through pending jobs to find one that's ready to process
    for (const pointerFilename of pointerFiles) {
      const pointerPath = resolve(pendingPath, pointerFilename);
      const pointerContent = await readFile(pointerPath, 'utf-8');
      const pointer = JSON.parse(pointerContent) as { jobId: string };

      const job = await readJobRecord(createJobId(pointer.jobId));
      if (!job) continue;

      // Skip jobs that are waiting for retry backoff
      if (job.retryAfter) {
        const retryAfterTime = new Date(job.retryAfter).getTime();
        if (now < retryAfterTime) {
          continue; // Not ready yet, try next job
        }
      }

      return job;
    }
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
  if (!isLegacyFileQueueEnabled()) return false;
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
  if (!isLegacyFileQueueEnabled()) return false;
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
  if (!isLegacyFileQueueEnabled()) return false;
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
  if (!isLegacyFileQueueEnabled()) return { deleted: 0, errors: 0 };
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
  if (!isLegacyFileQueueEnabled()) return [];
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
  if (!isLegacyFileQueueEnabled()) {
    return { success: false, reason: 'not_found' };
  }
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
  if (!isLegacyFileQueueEnabled()) {
    return { acquired: false, release: async () => {} };
  }
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

/**
 * Calculate exponential backoff delay for retries: 30s, 60s, 120s
 */
function getRetryBackoffMs(retryCount: number): number {
  return 30_000 * Math.pow(2, retryCount);
}

/**
 * Requeue a job for retry after a transient failure.
 *
 * - Increments retryCount
 * - Sets retryAfter with exponential backoff
 * - Resets status to pending
 * - Moves pointer from processing/ back to pending/
 */
export async function requeueJobForRetry(jobId: JobId, errorMessage: string): Promise<boolean> {
  if (!isLegacyFileQueueEnabled()) return false;
  await ensureQueueInitialized();

  const job = await readJobRecord(jobId);
  if (!job) {
    console.error(`[QUEUE] Cannot requeue job ${jobId}: record not found`);
    return false;
  }

  const newRetryCount = (job.retryCount ?? 0) + 1;
  const backoffMs = getRetryBackoffMs(job.retryCount ?? 0);
  const retryAfter = new Date(Date.now() + backoffMs).toISOString();

  // Update canonical record (startedAt will be overwritten when job re-enters processing)
  const updated = await updateJobRecord(jobId, {
    status: 'pending',
    retryCount: newRetryCount,
    retryAfter,
    error: errorMessage,
  });

  if (!updated) {
    console.error(`[QUEUE] Failed to update job record ${jobId} for retry`);
    return false;
  }

  // Move pointer from processing to pending (create new pointer, delete old)
  const processingPointer = await findPointerInQueueFolder(jobId, 'processing');
  if (processingPointer) {
    await unlink(processingPointer.path);
  }

  // Create new pending pointer
  const pointerFilename = generatePointerFilename(jobId);
  const pointerPath = resolve(getQueueFolderPath('pending'), pointerFilename);
  const pointer = { jobId, status: 'pending', createdAt: new Date().toISOString() };
  await writeFile(pointerPath, JSON.stringify(pointer, null, 2), 'utf-8');

  console.log(
    `[QUEUE] Requeued job ${jobId} for retry ${newRetryCount}/${job.maxRetries ?? 0} (backoff ${Math.round(backoffMs / 1000)}s): ${errorMessage}`
  );

  return true;
}

/**
 * Recover orphaned jobs found in the processing folder at startup.
 *
 * If the server crashes while processing a job, the processing pointer stays
 * in processing/ and blocks the queue. This function runs during initialization
 * to recover those jobs.
 */
export async function recoverOrphanedJobs(): Promise<{ recovered: number; failed: number }> {
  if (!isLegacyFileQueueEnabled()) return { recovered: 0, failed: 0 };
  const processingPath = getQueueFolderPath('processing');
  let recovered = 0;
  let failed = 0;

  try {
    const files = await readdir(processingPath);
    const pointerFiles = files.filter((f) => f.endsWith('.ref.json'));

    if (pointerFiles.length === 0) {
      return { recovered: 0, failed: 0 };
    }

    console.log(`[QUEUE] Found ${pointerFiles.length} orphaned job(s) in processing folder`);

    for (const pointerFilename of pointerFiles) {
      try {
        const pointerPath = resolve(processingPath, pointerFilename);
        const pointerContent = await readFile(pointerPath, 'utf-8');
        const pointer = JSON.parse(pointerContent) as { jobId: string };
        const jobId = createJobId(pointer.jobId);
        const job = await readJobRecord(jobId);

        if (!job) {
          // No canonical record — delete orphaned pointer
          console.warn(`[QUEUE] Orphaned pointer for missing job ${pointer.jobId}, removing`);
          await unlink(pointerPath);
          failed++;
          continue;
        }

        const retriesRemaining = (job.maxRetries ?? 0) - (job.retryCount ?? 0);

        if (retriesRemaining > 0) {
          // Requeue for retry
          const newRetryCount = (job.retryCount ?? 0) + 1;
          const backoffMs = getRetryBackoffMs(job.retryCount ?? 0);
          const retryAfter = new Date(Date.now() + backoffMs).toISOString();

          await updateJobRecord(jobId, {
            status: 'pending',
            retryCount: newRetryCount,
            retryAfter,
            error: 'Server restarted during processing',
          });

          // Delete processing pointer and create pending pointer
          await unlink(pointerPath);
          const newPointerFilename = generatePointerFilename(jobId);
          const newPointerPath = resolve(getQueueFolderPath('pending'), newPointerFilename);
          const newPointer = {
            jobId: String(jobId),
            status: 'pending',
            createdAt: new Date().toISOString(),
          };
          await writeFile(newPointerPath, JSON.stringify(newPointer, null, 2), 'utf-8');

          console.log(
            `[QUEUE] Recovered orphaned job ${jobId} (${job.type}) — requeued for retry ${newRetryCount}/${job.maxRetries}`
          );
          recovered++;
        } else {
          // No retries left — mark as failed
          await updateJobRecord(jobId, {
            status: 'failed',
            completedAt: new Date().toISOString(),
            error: 'Server restarted during processing (no retries remaining)',
          });

          // Delete processing pointer, create finished pointer
          await unlink(pointerPath);
          await addFinishedPointer(jobId, 'failed');

          console.log(
            `[QUEUE] Orphaned job ${jobId} (${job.type}) marked as failed (no retries remaining)`
          );
          failed++;
        }
      } catch (error) {
        console.error(`[QUEUE] Error recovering orphaned pointer ${pointerFilename}:`, error);
        failed++;
      }
    }
  } catch (error) {
    console.error('[QUEUE] Error scanning processing folder for orphans:', error);
  }

  // Also delete any stale lock file at startup — guaranteed stale since we just booted
  const lockPath = getProcessingLockPath();
  if (existsSync(lockPath)) {
    try {
      await unlink(lockPath);
      console.log('[QUEUE] Deleted stale processing lock from previous run');
    } catch {
      // Ignore — non-critical
    }
  }

  if (recovered > 0 || failed > 0) {
    console.log(`[QUEUE] Orphan recovery complete: ${recovered} requeued, ${failed} failed`);
  }

  return { recovered, failed };
}

/**
 * Detect and handle jobs stuck in the processing state.
 *
 * Scans processing/ for pointer files and checks if the canonical job record's
 * startedAt is older than STUCK_JOB_THRESHOLD_MS. Stuck jobs are retried or
 * marked as failed.
 */
export async function detectStuckJobs(): Promise<{ requeued: number; failed: number }> {
  if (!isLegacyFileQueueEnabled()) return { requeued: 0, failed: 0 };
  await ensureQueueInitialized();
  const processingPath = getQueueFolderPath('processing');
  let requeued = 0;
  let failed = 0;
  const now = Date.now();

  try {
    const files = await readdir(processingPath);
    const pointerFiles = files.filter((f) => f.endsWith('.ref.json'));

    for (const pointerFilename of pointerFiles) {
      try {
        const pointerPath = resolve(processingPath, pointerFilename);
        const pointerContent = await readFile(pointerPath, 'utf-8');
        const pointer = JSON.parse(pointerContent) as { jobId: string };
        const jobId = createJobId(pointer.jobId);
        const job = await readJobRecord(jobId);

        if (!job) {
          // Orphaned pointer with no job record — clean up
          await unlink(pointerPath);
          failed++;
          continue;
        }

        if (!job.startedAt) continue;

        const startedAtTime = new Date(job.startedAt).getTime();
        const elapsed = now - startedAtTime;

        if (elapsed <= STUCK_JOB_THRESHOLD_MS) {
          continue; // Not stuck yet
        }

        const elapsedMin = Math.round(elapsed / 60_000);
        const retriesRemaining = (job.maxRetries ?? 0) - (job.retryCount ?? 0);

        if (retriesRemaining > 0) {
          // Delete processing pointer first, then requeue
          await unlink(pointerPath);

          const newRetryCount = (job.retryCount ?? 0) + 1;
          const backoffMs = getRetryBackoffMs(job.retryCount ?? 0);
          const retryAfter = new Date(Date.now() + backoffMs).toISOString();

          await updateJobRecord(jobId, {
            status: 'pending',
            retryCount: newRetryCount,
            retryAfter,
            error: `Job exceeded maximum processing time (${elapsedMin}min)`,
          });

          const newPointerFilename = generatePointerFilename(jobId);
          const newPointerPath = resolve(getQueueFolderPath('pending'), newPointerFilename);
          const newPointer = {
            jobId: String(jobId),
            status: 'pending',
            createdAt: new Date().toISOString(),
          };
          await writeFile(newPointerPath, JSON.stringify(newPointer, null, 2), 'utf-8');

          console.warn(
            `[QUEUE] Stuck job ${jobId} (${job.type}, ${elapsedMin}min) requeued for retry ${newRetryCount}/${job.maxRetries}`
          );
          requeued++;
        } else {
          // No retries — mark as failed
          await updateJobRecord(jobId, {
            status: 'failed',
            completedAt: new Date().toISOString(),
            error: `Job exceeded maximum processing time (${elapsedMin}min, no retries remaining)`,
          });

          await unlink(pointerPath);
          await addFinishedPointer(jobId, 'failed');

          console.warn(
            `[QUEUE] Stuck job ${jobId} (${job.type}, ${elapsedMin}min) marked as failed (no retries remaining)`
          );
          failed++;
        }
      } catch (error) {
        console.error(`[QUEUE] Error checking stuck job ${pointerFilename}:`, error);
      }
    }
  } catch (error) {
    console.error('[QUEUE] Error scanning for stuck jobs:', error);
  }

  if (requeued > 0 || failed > 0) {
    console.log(`[QUEUE] Stuck job detection: ${requeued} requeued, ${failed} failed`);
  }

  return { requeued, failed };
}
