/**
 * Shallow git clone (`--depth 1`, see cloneRepository) into OS temp, cached per workspace id
 * with TTL and a max entry cap. Used for dashboard/API flows that need a local tree without
 * durable `/app/workspaces` mounts. Legacy durable paths are used when present on disk.
 *
 * @see EPHEMERAL_SHALLOW_CLONE_TTL_MS
 */

import { access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cloneRepository } from '@/lib/git/core';
import { getGitCredentialsFromConfig } from '@/lib/git/repo-credentials';
import { getConfig } from '@/lib/config/server-actions';
import type { FilePath, GitUrl, WorkspaceId } from '@/lib/types/index';

/** Time a shallow clone directory may be reused before eviction. */
export const EPHEMERAL_SHALLOW_CLONE_TTL_MS = 30 * 60 * 1000;

/** Max distinct workspace ids with a cached temp clone; oldest inserted entry is evicted first. */
export const EPHEMERAL_SHALLOW_CLONE_MAX_ENTRIES = 10;

type CacheEntry = {
  rootPath: FilePath;
  expiresAt: number;
  timeoutId: ReturnType<typeof setTimeout>;
};

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<FilePath>>();

export interface EphemeralShallowCloneInput {
  workspaceId: WorkspaceId | string;
  repoUrl: GitUrl;
  targetBranch: string;
  /** If set and the path exists, use it (durable workspace); no temp clone. */
  legacyPath?: FilePath;
}

async function removeDirQuiet(path: string): Promise<void> {
  try {
    await rm(path, { recursive: true, force: true });
  } catch (err) {
    console.warn(`[EPHEMERAL_CLONE] Failed to remove ${path}:`, err);
  }
}

function evict(workspaceId: string): void {
  const entry = cache.get(workspaceId);
  if (!entry) return;
  clearTimeout(entry.timeoutId);
  cache.delete(workspaceId);
  void removeDirQuiet(entry.rootPath);
}

function evictOldestIfFull(): void {
  if (cache.size < EPHEMERAL_SHALLOW_CLONE_MAX_ENTRIES) return;
  const oldest = cache.keys().next().value as string | undefined;
  if (oldest) evict(oldest);
}

function touchCacheEntry(workspaceId: string, entry: CacheEntry): void {
  const now = Date.now();
  clearTimeout(entry.timeoutId);
  entry.expiresAt = now + EPHEMERAL_SHALLOW_CLONE_TTL_MS;
  entry.timeoutId = setTimeout(() => evict(workspaceId), EPHEMERAL_SHALLOW_CLONE_TTL_MS);
}

/**
 * Returns a directory containing a shallow clone (or a legacy durable workspace path).
 * Concurrent calls for the same workspace id share one in-flight clone operation.
 */
export async function resolveWorkspaceRootWithEphemeralShallowClone(
  input: EphemeralShallowCloneInput
): Promise<FilePath> {
  const key = String(input.workspaceId);

  const pending = inFlight.get(key);
  if (pending) return pending;

  const promise = resolveWorkspaceRootInner(input, key);
  inFlight.set(key, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(key);
  }
}

async function resolveWorkspaceRootInner(
  input: EphemeralShallowCloneInput,
  key: string
): Promise<FilePath> {
  const { repoUrl, targetBranch, legacyPath } = input;

  if (legacyPath) {
    try {
      await access(legacyPath);
      return legacyPath;
    } catch {
      /* use ephemeral */
    }
  }

  const now = Date.now();
  const existing = cache.get(key);
  if (existing && existing.expiresAt > now) {
    touchCacheEntry(key, existing);
    return existing.rootPath;
  }

  if (existing) {
    evict(key);
  }

  evictOldestIfFull();

  const config = await getConfig();
  const credentials = getGitCredentialsFromConfig(config, repoUrl);

  const dest = join(
    tmpdir(),
    'omnidev-ephemeral',
    key,
    `clone-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  ) as FilePath;

  const cloneResult = await cloneRepository(repoUrl, dest, {
    targetBranch,
    ...(credentials ? { credentials } : {}),
  });

  if (!cloneResult.success) {
    throw new Error(cloneResult.error.message);
  }

  const timeoutId = setTimeout(() => evict(key), EPHEMERAL_SHALLOW_CLONE_TTL_MS);
  cache.set(key, {
    rootPath: dest,
    expiresAt: now + EPHEMERAL_SHALLOW_CLONE_TTL_MS,
    timeoutId,
  });

  return dest;
}

/** Clears all cached temp clones (e.g. tests). */
export function clearEphemeralShallowCloneCache(): void {
  for (const id of [...cache.keys()]) {
    evict(id);
  }
}
