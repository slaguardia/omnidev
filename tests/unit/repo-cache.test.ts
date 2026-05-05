/**
 * Unit tests for the bare-clone repo cache. Mocks fs and the sandboxed git
 * client so the test exercises the lock + cache-key + first-clone-vs-fetch
 * decision logic without touching the disk or running git.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGit = {
  clone: vi.fn(async () => undefined),
  fetch: vi.fn(async () => undefined),
};

vi.mock('@/lib/git/sandbox', () => ({
  createSandboxedGit: vi.fn(() => mockGit),
}));

vi.mock('@/lib/config/server-actions', () => ({
  getDataDir: vi.fn(async () => '/tmp/omnidev-test-cache'),
}));

const mockStat = vi.fn();
const mockMkdir = vi.fn(async () => undefined);

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  return {
    ...actual,
    stat: (...args: unknown[]) => mockStat(...args),
    mkdir: (...args: unknown[]) => mockMkdir(...args),
  };
});

import {
  deriveBarePath,
  withRepoLock,
  cloneFromCache,
  _resetRepoCacheState,
} from '../../src/shared/src/lib/git/repo-cache';
import type { GitUrl, FilePath } from '../../src/shared/src/lib/common/types';

beforeEach(() => {
  mockGit.clone.mockClear();
  mockGit.fetch.mockClear();
  mockStat.mockReset();
  mockMkdir.mockClear();
  _resetRepoCacheState();
});

describe('repo-cache', () => {
  describe('deriveBarePath', () => {
    it('produces a stable hash-keyed path under the data dir', () => {
      const a = deriveBarePath('https://github.com/owner/repo.git', '/data');
      const b = deriveBarePath('https://github.com/owner/repo.git', '/data');
      expect(a).toBe(b);
      expect(a.startsWith('/data/repo-cache/')).toBe(true);
      expect(a.endsWith('.git')).toBe(true);
    });

    it('produces different paths for different repo URLs', () => {
      const a = deriveBarePath('https://github.com/a/repo.git', '/data');
      const b = deriveBarePath('https://github.com/b/repo.git', '/data');
      expect(a).not.toBe(b);
    });
  });

  describe('withRepoLock', () => {
    it('serializes calls for the same repo URL', async () => {
      const order: string[] = [];

      const p1 = withRepoLock('repo-x', async () => {
        order.push('p1-start');
        await new Promise((r) => setTimeout(r, 20));
        order.push('p1-end');
        return 1;
      });
      const p2 = withRepoLock('repo-x', async () => {
        order.push('p2-start');
        order.push('p2-end');
        return 2;
      });

      const [r1, r2] = await Promise.all([p1, p2]);

      expect(r1).toBe(1);
      expect(r2).toBe(2);
      expect(order).toEqual(['p1-start', 'p1-end', 'p2-start', 'p2-end']);
    });

    it('does NOT serialize calls for different repo URLs', async () => {
      const order: string[] = [];

      const p1 = withRepoLock('repo-a', async () => {
        order.push('a-start');
        await new Promise((r) => setTimeout(r, 20));
        order.push('a-end');
      });
      const p2 = withRepoLock('repo-b', async () => {
        order.push('b-start');
        order.push('b-end');
      });

      await Promise.all([p1, p2]);

      expect(order[0]).toBe('a-start');
      expect(order.slice(0, 3)).toContain('b-start');
    });

    it('continues the chain even if a previous call rejected', async () => {
      const p1 = withRepoLock('repo-y', async () => {
        throw new Error('boom');
      });
      const p2 = withRepoLock('repo-y', async () => 'ok');

      await expect(p1).rejects.toThrow('boom');
      await expect(p2).resolves.toBe('ok');
    });
  });

  describe('cloneFromCache', () => {
    it('first call for a repo creates the bare clone then derives the per-job clone via --reference', async () => {
      mockStat.mockRejectedValue(new Error('ENOENT'));

      const result = await cloneFromCache(
        'https://example.com/owner/repo.git' as GitUrl,
        '/tmp/job-1/work' as FilePath
      );

      expect(result.success).toBe(true);
      expect(mockGit.clone).toHaveBeenCalledTimes(2);

      const [bareCall, perJobCall] = mockGit.clone.mock.calls;
      expect(bareCall[2]).toContain('--bare');
      expect(bareCall[2]).toContain('--mirror');

      expect(perJobCall[2]).toContain('--reference');
      expect(perJobCall[2]).toContain('--dissociate');
      const referenceIdx = perJobCall[2].indexOf('--reference');
      expect(perJobCall[2][referenceIdx + 1]).toMatch(/repo-cache\/.*\.git$/);
    });

    it('second call for the same repo within throttle window skips the fetch', async () => {
      const bareExists = { isFile: () => true };
      mockStat.mockResolvedValue(bareExists);

      await cloneFromCache(
        'https://example.com/owner/repo.git' as GitUrl,
        '/tmp/job-2/work' as FilePath
      );
      mockGit.clone.mockClear();
      mockGit.fetch.mockClear();

      await cloneFromCache(
        'https://example.com/owner/repo.git' as GitUrl,
        '/tmp/job-3/work' as FilePath
      );

      expect(mockGit.fetch).not.toHaveBeenCalled();
      expect(mockGit.clone).toHaveBeenCalledTimes(1);
      expect(mockGit.clone.mock.calls[0][2]).toContain('--reference');
    });

    it('forwards branch and credentials into the per-job clone URL', async () => {
      const bareExists = { isFile: () => true };
      mockStat.mockResolvedValue(bareExists);

      await cloneFromCache(
        'https://example.com/owner/repo.git' as GitUrl,
        '/tmp/job-x/work' as FilePath,
        {
          targetBranch: 'feature/x',
          credentials: { username: 'user', password: 'pat-token-1' },
        }
      );

      const perJobCall = mockGit.clone.mock.calls[mockGit.clone.mock.calls.length - 1];
      const [url, , args] = perJobCall;
      expect(url).toContain('user:pat-token-1@');
      expect(args).toContain('--branch');
      expect(args[args.indexOf('--branch') + 1]).toBe('feature/x');
    });

    it('serializes bare-clone fetches for the same URL across concurrent jobs', async () => {
      const bareExists = { isFile: () => true };
      mockStat.mockResolvedValue(bareExists);

      // Prime the cache so subsequent calls go through the throttle check
      await cloneFromCache('https://e.com/r.git' as GitUrl, '/tmp/seed' as FilePath);

      // Force the throttle to expire immediately by manipulating module state
      _resetRepoCacheState();

      let inFlightFetches = 0;
      let maxInFlight = 0;
      mockGit.fetch.mockImplementation(async () => {
        inFlightFetches++;
        maxInFlight = Math.max(maxInFlight, inFlightFetches);
        await new Promise((r) => setTimeout(r, 10));
        inFlightFetches--;
      });

      await Promise.all([
        cloneFromCache('https://e.com/r.git' as GitUrl, '/tmp/a' as FilePath),
        cloneFromCache('https://e.com/r.git' as GitUrl, '/tmp/b' as FilePath),
        cloneFromCache('https://e.com/r.git' as GitUrl, '/tmp/c' as FilePath),
      ]);

      expect(maxInFlight).toBe(1);
    });
  });
});
