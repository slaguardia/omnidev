/**
 * Multi-worker validation: two scheduler instances racing against a shared
 * mock DB must never both claim the same job. The mock claim function uses
 * a tiny optimistic-locking shim that mirrors the production semantics
 * (findFirst + updateMany inside a transaction) used by ralph-task-db-pg.
 */

import { describe, it, expect, vi } from 'vitest';
import { createScheduler } from '../../src/worker/src/scheduler';

interface SharedJob {
  id: string;
  status: 'pending' | 'running' | 'completed';
  claimedBy?: string;
}

function makeSharedDb(jobIds: string[]) {
  const jobs: SharedJob[] = jobIds.map((id) => ({ id, status: 'pending' }));
  const claimedBy = new Map<string, string>();

  async function claim(workerId: string): Promise<string | null> {
    await Promise.resolve();
    const candidate = jobs.find((j) => j.status === 'pending');
    if (!candidate) return null;

    await Promise.resolve();

    if (candidate.status !== 'pending') return null;
    candidate.status = 'running';
    candidate.claimedBy = workerId;
    if (claimedBy.has(candidate.id)) {
      throw new Error(
        `DOUBLE CLAIM DETECTED: job ${candidate.id} was claimed by ${claimedBy.get(candidate.id)} and now by ${workerId}`
      );
    }
    claimedBy.set(candidate.id, workerId);
    return candidate.id;
  }

  return { claim, claimedBy, jobs };
}

describe('multi-worker safety (atomic claim semantics)', () => {
  it('two workers racing on the same DB never double-claim a job', async () => {
    const db = makeSharedDb(['j1', 'j2', 'j3', 'j4', 'j5', 'j6']);
    const completed: string[] = [];

    const buildScheduler = (workerId: string) =>
      createScheduler<string>({
        maxConcurrency: 2,
        pollIntervalMs: 10,
        claimNextJob: () => db.claim(workerId),
        getJobId: (id: string) => id,
        runJob: async (id: string) => {
          await new Promise((r) => setTimeout(r, 5));
          completed.push(`${workerId}:${id}`);
        },
        recoverStaleJobs: vi.fn(async () => 0),
        revokeExpiredTokens: vi.fn(async () => 0),
        logger: { log: () => {}, error: () => {} },
      });

    const w1 = buildScheduler('worker-1');
    const w2 = buildScheduler('worker-2');

    w1.start();
    w2.start();

    await new Promise((r) => setTimeout(r, 200));

    w1.stop();
    w2.stop();

    expect(completed.length).toBe(6);

    const claimedJobIds = new Set<string>();
    for (const entry of completed) {
      const [, jobId] = entry.split(':');
      expect(claimedJobIds.has(jobId)).toBe(false);
      claimedJobIds.add(jobId);
    }
    expect(claimedJobIds.size).toBe(6);

    const claimerByJob = Array.from(db.claimedBy.entries());
    expect(claimerByJob.length).toBe(6);
  });

  it('a worker that claims and then crashes mid-job leaves work for the other worker to recover', async () => {
    const db = makeSharedDb(['j1', 'j2', 'j3']);
    const completedByW2: string[] = [];

    const w1 = createScheduler<string>({
      maxConcurrency: 1,
      pollIntervalMs: 10,
      claimNextJob: () => db.claim('worker-1'),
      getJobId: (id: string) => id,
      runJob: async (id: string) => {
        if (id === 'j1') {
          await new Promise<void>(() => {});
        }
      },
      recoverStaleJobs: vi.fn(async () => 0),
      revokeExpiredTokens: vi.fn(async () => 0),
      logger: { log: () => {}, error: () => {} },
    });

    w1.start();
    await new Promise((r) => setTimeout(r, 50));

    const w2 = createScheduler<string>({
      maxConcurrency: 2,
      pollIntervalMs: 10,
      claimNextJob: () => db.claim('worker-2'),
      getJobId: (id: string) => id,
      runJob: async (id: string) => {
        completedByW2.push(id);
      },
      recoverStaleJobs: vi.fn(async () => 0),
      revokeExpiredTokens: vi.fn(async () => 0),
      logger: { log: () => {}, error: () => {} },
    });

    w2.start();
    await new Promise((r) => setTimeout(r, 100));

    w1.stop();
    w2.stop();

    expect(completedByW2.sort()).toEqual(['j2', 'j3']);
  });
});
