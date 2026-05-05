'use server';

/**
 * Bare-clone repo cache.
 *
 * Maintains one bare clone per repository URL under `<dataDir>/repo-cache/`.
 * Per-job clones use `git clone --reference <bare>` so the object database is
 * shared across jobs — only the working tree is per-job. This makes N
 * concurrent jobs against the same repo cheap on disk and bandwidth.
 *
 * A per-repo async lock serializes the bare-clone fetch step so two
 * concurrent jobs against the same repo do not race on `git fetch`. The
 * subsequent per-job clone is lock-free because git's object database is
 * safe for concurrent readers.
 */

import { mkdir, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { getDataDir } from '@/lib/config/server-actions';
import { createSandboxedGit } from '@/lib/git/sandbox';
import type { GitUrl, FilePath, AsyncResult } from '@/lib/common/types';
import type { GitCredentials, GitCloneOptions } from '@/lib/git/types';

const CACHE_SUBDIR = 'repo-cache';
const FETCH_THROTTLE_MS = 60_000;

const repoLocks = new Map<string, Promise<unknown>>();
const lastFetchAt = new Map<string, number>();

export function deriveBarePath(repoUrl: string, dataDir: string): FilePath {
  const hash = createHash('sha256').update(repoUrl).digest('hex').slice(0, 16);
  return join(dataDir, CACHE_SUBDIR, `${hash}.git`) as FilePath;
}

export async function getCacheRoot(): Promise<FilePath> {
  const dataDir = await getDataDir();
  return join(dataDir, CACHE_SUBDIR) as FilePath;
}

/**
 * Run `fn` serialized against any other in-flight call for the same repoUrl.
 * Used so concurrent jobs do not race on `git fetch` against a shared bare clone.
 */
export async function withRepoLock<T>(repoUrl: string, fn: () => Promise<T>): Promise<T> {
  const previous = repoLocks.get(repoUrl) ?? Promise.resolve();
  const next = previous.then(fn, fn);
  repoLocks.set(
    repoUrl,
    next.then(
      () => undefined,
      () => undefined
    )
  );
  return next;
}

/**
 * Test-only: clear the per-repo lock chain and fetch-throttle bookkeeping.
 */
export function _resetRepoCacheState(): void {
  repoLocks.clear();
  lastFetchAt.clear();
}

/**
 * Clone `repoUrl` into `dest` using a shared bare cache. The bare clone is
 * created on first use and refreshed (`git fetch`) when older than the
 * fetch-throttle window. Per-job clones reference the bare via `--reference`,
 * so the object DB is shared.
 */
export async function cloneFromCache(
  repoUrl: GitUrl,
  dest: FilePath,
  options: GitCloneOptions = {}
): Promise<AsyncResult<void>> {
  try {
    const dataDir = await getDataDir();
    const barePath = deriveBarePath(repoUrl, dataDir);
    const authedUrl = options.credentials
      ? buildAuthenticatedUrl(repoUrl, options.credentials)
      : repoUrl;

    await ensureBareClone(repoUrl, authedUrl, barePath);

    await mkdir(dirname(dest), { recursive: true });
    const cloneArgs: string[] = ['--reference', barePath, '--dissociate'];
    if (options.targetBranch) {
      cloneArgs.push('--branch', options.targetBranch);
    }
    if (options.bare) {
      cloneArgs.push('--bare');
    }

    const git = createSandboxedGit();
    await git.clone(authedUrl, dest, cloneArgs);

    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to clone from cache: ${error}`),
    };
  }
}

async function ensureBareClone(
  repoUrl: string,
  authedUrl: string,
  barePath: FilePath
): Promise<void> {
  await withRepoLock(repoUrl, async () => {
    const exists = await isExistingBare(barePath);

    if (!exists) {
      await mkdir(dirname(barePath), { recursive: true });
      const git = createSandboxedGit();
      await git.clone(authedUrl, barePath, ['--bare', '--mirror']);
      lastFetchAt.set(repoUrl, Date.now());
      return;
    }

    const lastFetch = lastFetchAt.get(repoUrl) ?? 0;
    if (Date.now() - lastFetch > FETCH_THROTTLE_MS) {
      const bareGit = createSandboxedGit(barePath);
      await bareGit.fetch(['--all', '--prune']);
      lastFetchAt.set(repoUrl, Date.now());
    }
  });
}

async function isExistingBare(barePath: string): Promise<boolean> {
  try {
    const s = await stat(join(barePath, 'HEAD'));
    return s.isFile();
  } catch {
    return false;
  }
}

function buildAuthenticatedUrl(repoUrl: string, credentials: GitCredentials): string {
  try {
    const url = new URL(repoUrl);
    url.username = credentials.username;
    url.password = credentials.password;
    return url.toString();
  } catch {
    return repoUrl;
  }
}
