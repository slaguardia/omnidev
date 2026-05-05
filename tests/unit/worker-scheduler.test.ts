/**
 * Unit tests for the worker scheduler — proves N concurrent jobs run
 * simultaneously, backpressure caps at maxConcurrency, WORKER_CONCURRENCY=1
 * reproduces serial behavior, and stale-job recovery runs on the timer
 * cadence regardless of slot occupancy.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createScheduler, resolveConcurrency } from '../../src/worker/src/scheduler';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function nextTick(): Promise<void> {
  return new Promise((r) => setImmediate(r));
}

afterEach(() => {
  vi.useRealTimers();
});

describe('worker scheduler', () => {
  describe('resolveConcurrency', () => {
    it('returns fallback when env value is unset, empty, or invalid', () => {
      expect(resolveConcurrency(undefined, 3)).toBe(3);
      expect(resolveConcurrency('', 3)).toBe(3);
      expect(resolveConcurrency('not-a-number', 3)).toBe(3);
      expect(resolveConcurrency('0', 3)).toBe(3);
      expect(resolveConcurrency('-1', 3)).toBe(3);
    });

    it('parses positive integers from env', () => {
      expect(resolveConcurrency('1', 3)).toBe(1);
      expect(resolveConcurrency('5', 3)).toBe(5);
      expect(resolveConcurrency('10', 3)).toBe(10);
    });
  });

  describe('N concurrent jobs', () => {
    it('runs up to maxConcurrency jobs simultaneously', async () => {
      const queued = ['j1', 'j2', 'j3', 'j4', 'j5'];
      const claimNextJob = vi.fn(async () => queued.shift() ?? null);

      const inFlightRecord: number[] = [];
      let active = 0;
      const blockers = new Map<string, Deferred<void>>();
      const runJob = vi.fn(async (id: string) => {
        active++;
        inFlightRecord.push(active);
        const block = deferred<void>();
        blockers.set(id, block);
        await block.promise;
        active--;
      });

      const scheduler = createScheduler<string>({
        maxConcurrency: 3,
        pollIntervalMs: 1000,
        claimNextJob,
        runJob,
        recoverStaleJobs: vi.fn(async () => 0),
        revokeExpiredTokens: vi.fn(async () => 0),
        logger: { log: () => {}, error: () => {} },
      });

      scheduler.start();

      for (let i = 0; i < 10; i++) await nextTick();

      expect(scheduler.inFlightCount()).toBe(3);
      expect(Math.max(...inFlightRecord)).toBe(3);

      blockers.get('j1')!.resolve();
      blockers.get('j2')!.resolve();
      for (let i = 0; i < 10; i++) await nextTick();

      expect(scheduler.inFlightCount()).toBe(3);

      for (const b of blockers.values()) b.resolve();
      for (let i = 0; i < 20; i++) await nextTick();

      expect(scheduler.inFlightCount()).toBe(0);
      expect(runJob).toHaveBeenCalledTimes(5);

      scheduler.stop();
    });
  });

  describe('serial mode (WORKER_CONCURRENCY=1)', () => {
    it('reproduces strictly-serial behavior with maxConcurrency=1', async () => {
      const queued = ['j1', 'j2', 'j3'];
      const claimNextJob = vi.fn(async () => queued.shift() ?? null);

      const blockers = new Map<string, Deferred<void>>();
      const runJob = vi.fn(async (id: string) => {
        const block = deferred<void>();
        blockers.set(id, block);
        await block.promise;
      });

      const scheduler = createScheduler<string>({
        maxConcurrency: 1,
        pollIntervalMs: 1000,
        claimNextJob,
        runJob,
        recoverStaleJobs: vi.fn(async () => 0),
        revokeExpiredTokens: vi.fn(async () => 0),
        logger: { log: () => {}, error: () => {} },
      });

      scheduler.start();
      for (let i = 0; i < 10; i++) await nextTick();
      expect(scheduler.inFlightCount()).toBe(1);
      expect(runJob).toHaveBeenCalledTimes(1);

      blockers.get('j1')!.resolve();
      for (let i = 0; i < 10; i++) await nextTick();
      expect(scheduler.inFlightCount()).toBe(1);
      expect(runJob).toHaveBeenCalledTimes(2);

      blockers.get('j2')!.resolve();
      for (let i = 0; i < 10; i++) await nextTick();
      expect(scheduler.inFlightCount()).toBe(1);
      expect(runJob).toHaveBeenCalledTimes(3);

      blockers.get('j3')!.resolve();
      for (let i = 0; i < 20; i++) await nextTick();
      expect(scheduler.inFlightCount()).toBe(0);

      scheduler.stop();
    });
  });

  describe('per-job lifecycle isolation', () => {
    it('one job throwing does not poison sibling slots or stop the scheduler', async () => {
      const queued = ['ok1', 'fail', 'ok2'];
      const claimNextJob = vi.fn(async () => queued.shift() ?? null);

      const completed: string[] = [];
      const runJob = vi.fn(async (id: string) => {
        if (id === 'fail') throw new Error('boom');
        completed.push(id);
      });

      const scheduler = createScheduler<string>({
        maxConcurrency: 2,
        pollIntervalMs: 1000,
        claimNextJob,
        runJob,
        recoverStaleJobs: vi.fn(async () => 0),
        revokeExpiredTokens: vi.fn(async () => 0),
        logger: { log: () => {}, error: () => {} },
      });

      scheduler.start();
      for (let i = 0; i < 20; i++) await nextTick();

      expect(runJob).toHaveBeenCalledTimes(3);
      expect(completed).toContain('ok1');
      expect(completed).toContain('ok2');
      expect(scheduler.inFlightCount()).toBe(0);

      scheduler.stop();
    });
  });

  describe('stale-job recovery', () => {
    it('runs on every timer tick regardless of in-flight count', async () => {
      vi.useFakeTimers();
      const block = deferred<void>();
      const claimNextJob = vi.fn(async () => 'long-job');
      let claimedCount = 0;
      claimNextJob.mockImplementation(async () => (claimedCount++ < 1 ? 'long-job' : null));

      const runJob = vi.fn(async () => {
        await block.promise;
      });
      const recoverStaleJobs = vi.fn(async () => 0);

      const scheduler = createScheduler<string>({
        maxConcurrency: 1,
        pollIntervalMs: 100,
        claimNextJob,
        runJob,
        recoverStaleJobs,
        revokeExpiredTokens: vi.fn(async () => 0),
        logger: { log: () => {}, error: () => {} },
      });

      scheduler.start();

      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      expect(recoverStaleJobs).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(350);
      expect(recoverStaleJobs.mock.calls.length).toBeGreaterThanOrEqual(3);

      block.resolve();
      scheduler.stop();
    });
  });

  describe('stop', () => {
    it('halts further polling after stop()', async () => {
      const claimNextJob = vi.fn(async () => null);
      const recoverStaleJobs = vi.fn(async () => 0);

      const scheduler = createScheduler<string>({
        maxConcurrency: 2,
        pollIntervalMs: 10,
        claimNextJob,
        runJob: vi.fn(),
        recoverStaleJobs,
        revokeExpiredTokens: vi.fn(async () => 0),
        logger: { log: () => {}, error: () => {} },
      });

      scheduler.start();
      await nextTick();
      const callsBeforeStop = recoverStaleJobs.mock.calls.length;

      scheduler.stop();

      await new Promise((r) => setTimeout(r, 50));
      const callsAfterStop = recoverStaleJobs.mock.calls.length;

      expect(callsAfterStop - callsBeforeStop).toBeLessThanOrEqual(1);
    });
  });
});
