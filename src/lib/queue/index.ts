/**
 * Job Queue Module - Public API
 *
 * File-based job queue with execute-or-queue semantics:
 * - If nothing is processing, execute immediately and return result
 * - If something is processing, queue the job for background processing
 */

// Core queue operations
export {
  initializeQueue,
  isProcessing,
  hasPendingJobs,
  enqueueJob,
  getJob,
  listJobs,
  cleanupOldJobs,
} from './queue-manager';

// Worker functions
export { executeOrQueue, startWorker, stopWorker, isWorkerRunning } from './worker';

// Types
export type {
  Job,
  JobId,
  JobType,
  JobStatus,
  ExecutionResult,
  ClaudeCodeJobPayload,
  ClaudeCodeJobResult,
  GitPushJobPayload,
  GitMRJobPayload,
  WorkspaceCleanupJobPayload,
} from './types';

export { createJobId } from './types';
