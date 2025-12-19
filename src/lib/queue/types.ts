/**
 * Job Queue Type Definitions
 *
 * File-based job queue with execute-or-queue semantics:
 * - If nothing is processing, execute immediately
 * - If something is processing, queue the job
 */

import type { WorkspaceId } from '@/lib/types/index';

// Branded types for type safety
export type JobId = string & { readonly brand: unique symbol };

// Job types that can be queued
export type JobType = 'claude-code' | 'git-push' | 'git-mr' | 'workspace-cleanup';

// Job lifecycle states
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

// Queue folder names (only active queue folders - pending/processing)
// Finished jobs are stored in workspaces/jobs/finished/{completed|failed}/
export type QueueFolder = 'pending' | 'processing';

/**
 * Generic job structure stored as JSON files
 */
export interface Job<T = unknown> {
  id: JobId;
  type: JobType;
  payload: T;
  status: JobStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: unknown;
  error?: string;
}

/**
 * Payload for Claude Code execution jobs
 */
export interface ClaudeCodeJobPayload {
  workspaceId: WorkspaceId;
  workspacePath: string;
  question: string;
  context?: string;
  sourceBranch?: string;
  repoUrl?: string;
  /**
   * Optional webhook callback invoked when the job completes or fails.
   * Useful for webhook-driven orchestrators (e.g. n8n) to avoid polling.
   */
  callback?: {
    /** Destination URL to POST job completion payload to. Must be http(s). */
    url: string;
    /**
     * Optional shared secret used to sign the callback payload.
     * When provided, Workflow will send `x-workflow-signature: sha256=<hex>`.
     */
    secret?: string;
  };
  /**
   * Explicitly mark this as an edit-style request so Claude runs with the right permissions mode.
   * When omitted, the job handler will infer from createMR.
   */
  editRequest?: boolean;
  /**
   * If true, the worker will run git workflow initialization before Claude and post-execution
   * commit/push/MR handling after Claude (best-effort).
   */
  createMR?: boolean;
}

/**
 * Payload for git push jobs
 */
export interface GitPushJobPayload {
  workspacePath: string;
  branch: string;
  repoUrl: string;
}

/**
 * Payload for merge request creation jobs
 */
export interface GitMRJobPayload {
  workspacePath: string;
  gitInitResult: unknown;
  repoUrl: string;
}

/**
 * Payload for workspace cleanup jobs
 */
export interface WorkspaceCleanupJobPayload {
  workspaceId: WorkspaceId;
  workspacePath: string;
}

/**
 * Result from executeOrQueue - either immediate or queued
 */
export type ExecutionResult =
  | { immediate: true; result: unknown }
  | { immediate: false; jobId: JobId };

/**
 * Individual JSON log entry from Claude Code stream
 */
export interface ClaudeCodeJsonLog {
  type: string;
  subtype?: string;
  timestamp?: string;
  message?: unknown;
  result?: string;
  duration_ms?: number;
  [key: string]: unknown;
}

/**
 * Token usage and cost information from Claude Code execution
 */
export interface ClaudeCodeUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  costUsd?: number;
}

/**
 * Result from Claude Code job execution
 */
export interface ClaudeCodeJobResult {
  output: string;
  gitInitResult?: unknown;
  executionTimeMs: number;
  /**
   * Result of post-execution git actions (commit/push/MR), if attempted.
   * Present when createMR was requested and git initialization succeeded.
   */
  postExecution?: {
    hasChanges: boolean;
    commitHash?: string;
    mergeRequestUrl?: string;
    pushedBranch?: string;
  };
  /** Token usage and cost information aggregated from Claude Code execution */
  usage?: ClaudeCodeUsage;
  /** Raw JSON stream logs from Claude Code execution */
  jsonLogs?: ClaudeCodeJsonLog[];
  /** Raw stdout output (includes all output before parsing) */
  rawOutput?: string;
}

/**
 * Helper to create a typed JobId
 */
export function createJobId(id: string): JobId {
  return id as JobId;
}

/**
 * Type guard to check if a value is a valid Job
 */
export function isJob(value: unknown): value is Job {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.type === 'string' &&
    typeof obj.status === 'string' &&
    typeof obj.createdAt === 'string' &&
    obj.payload !== undefined
  );
}
