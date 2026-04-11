/**
 * Stage Token Management — scoped, short-lived tokens for agent CLI access.
 *
 * Tokens are opaque hex strings (crypto.randomBytes). Only the SHA-256 hash
 * is stored in SQLite. Tokens are revoked when the job completes or fails.
 *
 * No npm dependencies — uses Node.js built-in crypto only.
 */

import { randomBytes, createHash } from 'node:crypto';
import { nanoid } from 'nanoid';
import {
  dbInsertStageToken,
  dbGetStageTokenByHash,
  dbRevokeTokensByJob,
  dbRevokeExpiredTokens,
} from '@/lib/managers/ralph-task-db';
import type { CliPermission } from '@/lib/types/index';

const DEFAULT_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

export interface StageTokenInfo {
  tokenId: string;
  jobId: string;
  taskId: string;
  permissions: CliPermission[];
}

/**
 * Hash a raw token for storage. Never store the raw token.
 */
function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Generate a scoped stage token for a job.
 *
 * Returns the raw token (to be passed to the agent via env var).
 * Only the SHA-256 hash is persisted in SQLite.
 */
export async function generateStageToken(options: {
  jobId: string;
  taskId: string;
  permissions: CliPermission[];
  ttlMs?: number;
}): Promise<string> {
  const rawToken = randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const now = new Date();
  const ttl = options.ttlMs ?? DEFAULT_TTL_MS;
  const expiresAt = new Date(now.getTime() + ttl);

  await dbInsertStageToken({
    id: nanoid(10),
    token_hash: tokenHash,
    job_id: options.jobId,
    task_id: options.taskId,
    permissions: JSON.stringify(options.permissions),
    expires_at: expiresAt.toISOString(),
    created_at: now.toISOString(),
  });

  return rawToken;
}

/**
 * Validate a raw stage token.
 *
 * Returns token info if valid, or null if expired/revoked/unknown.
 */
export async function validateStageToken(rawToken: string): Promise<StageTokenInfo | null> {
  const tokenHash = hashToken(rawToken);
  const row = await dbGetStageTokenByHash(tokenHash);

  if (!row) return null;

  // Check expiration
  if (new Date(row.expires_at) < new Date()) {
    return null;
  }

  const permissions = JSON.parse(row.permissions) as CliPermission[];

  return {
    tokenId: row.id,
    jobId: row.job_id,
    taskId: row.task_id,
    permissions,
  };
}

/**
 * Revoke all tokens for a job. Call in the worker's finally block.
 */
export async function revokeJobTokens(jobId: string): Promise<number> {
  return dbRevokeTokensByJob(jobId);
}

/**
 * Revoke all expired tokens. Call periodically for cleanup.
 */
export async function revokeExpiredTokens(): Promise<number> {
  return dbRevokeExpiredTokens();
}
