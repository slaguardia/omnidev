/**
 * In-process N-slot job scheduler for the standalone worker.
 *
 * Replaces the strictly-serial pollLoop with an async pool that runs up to
 * WORKER_CONCURRENCY jobs in parallel. Each in-flight job owns its own
 * lifecycle (heartbeat + dispatch + cleanup) and frees its slot on completion.
 *
 * Stale-job recovery and expired-token cleanup run on the fixed POLL_INTERVAL
 * cadence regardless of slot count, so a saturated worker still reaps stuck
 * jobs from peer workers.
 *
 * Setting WORKER_CONCURRENCY=1 reproduces the previous one-job-at-a-time
 * behavior.
 */

export interface SchedulerOptions<TJob> {
  /** Max concurrent in-flight jobs. */
  maxConcurrency: number;
  /** Idle poll interval in ms (also the cadence for stale-job recovery). */
  pollIntervalMs: number;
  /** Atomically claim the next pending job, or return null if none are pending. */
  claimNextJob: () => Promise<TJob | null>;
  /** Stable identifier for a job — used to report unfinished jobs from drain(). */
  getJobId: (job: TJob) => string;
  /** Run the per-job lifecycle. Should never throw — handle errors internally. */
  runJob: (job: TJob) => Promise<void>;
  /** Periodic recovery of stuck jobs (no heartbeat past timeout). */
  recoverStaleJobs: () => Promise<number>;
  /** Periodic cleanup of expired auth tokens. */
  revokeExpiredTokens: () => Promise<number>;
  /** Optional logger override (defaults to console). */
  logger?: { log: (msg: string) => void; error: (msg: string, err?: unknown) => void };
}

export interface DrainResult {
  drainedJobIds: string[];
  abandonedJobIds: string[];
  timedOut: boolean;
}

export interface Scheduler {
  start(): void;
  /** Hard stop — halts polling but does not wait for in-flight jobs. */
  stop(): void;
  /**
   * Stop accepting new jobs and wait for in-flight ones up to `timeoutMs`.
   * Returns the IDs of jobs that finished cleanly versus the IDs of jobs
   * that didn't finish in time (so the caller can requeue them).
   */
  drain(timeoutMs: number): Promise<DrainResult>;
  /** Number of in-flight jobs. Useful for tests and observability. */
  inFlightCount(): number;
  /** Snapshot of currently in-flight job IDs. */
  inFlightJobIds(): string[];
}

export function createScheduler<TJob>(opts: SchedulerOptions<TJob>): Scheduler {
  const log = opts.logger ?? {
    log: (m) => console.log(m),
    error: (m, e) => console.error(m, e),
  };

  const inFlight = new Map<string, Promise<void>>();
  let stopped = false;
  let draining = false;
  let pollHandle: ReturnType<typeof setTimeout> | null = null;

  /** Claim jobs until either no slots are free or the queue is empty. */
  async function tryClaimMore(): Promise<void> {
    while (!stopped && !draining && inFlight.size < opts.maxConcurrency) {
      let job: TJob | null;
      try {
        job = await opts.claimNextJob();
      } catch (err) {
        log.error('[WORKER] Failed to claim job', err);
        return;
      }
      if (!job) return;

      const jobId = opts.getJobId(job);
      const p = (async () => {
        try {
          await opts.runJob(job);
        } catch (err) {
          log.error('[WORKER] Unhandled error in runJob (should be caught internally)', err);
        }
      })().finally(() => {
        inFlight.delete(jobId);
        if (!stopped && !draining) void tryClaimMore();
      });
      inFlight.set(jobId, p);
    }
  }

  async function tick(): Promise<void> {
    if (stopped) return;

    try {
      const recovered = await opts.recoverStaleJobs();
      if (recovered > 0) {
        log.log(`[WORKER] Recovered ${recovered} stale job(s) (no heartbeat past timeout)`);
      }
    } catch (err) {
      log.error('[WORKER] Stale-job recovery failed', err);
    }

    try {
      const expired = await opts.revokeExpiredTokens();
      if (expired > 0) {
        log.log(`[WORKER] Revoked ${expired} expired stage token(s)`);
      }
    } catch (err) {
      log.error('[WORKER] Expired token cleanup failed', err);
    }

    await tryClaimMore();

    if (!stopped) {
      pollHandle = setTimeout(() => void tick(), opts.pollIntervalMs);
    }
  }

  return {
    start(): void {
      if (stopped) return;
      log.log(
        `[WORKER] Scheduler starting (concurrency=${opts.maxConcurrency}, poll=${opts.pollIntervalMs}ms)`
      );
      void tick();
    },
    stop(): void {
      stopped = true;
      if (pollHandle) {
        clearTimeout(pollHandle);
        pollHandle = null;
      }
    },
    async drain(timeoutMs: number): Promise<DrainResult> {
      draining = true;
      if (pollHandle) {
        clearTimeout(pollHandle);
        pollHandle = null;
      }

      const startingIds = Array.from(inFlight.keys());
      log.log(
        `[WORKER] Draining: waiting up to ${timeoutMs}ms for ${startingIds.length} in-flight job(s) to finish`
      );

      const allDone = Promise.all(Array.from(inFlight.values()));
      let timedOut = false;
      let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
      const timeoutPromise = new Promise<void>((resolve) => {
        timeoutHandle = setTimeout(() => {
          timedOut = true;
          resolve();
        }, timeoutMs);
      });

      await Promise.race([allDone, timeoutPromise]);
      if (timeoutHandle) clearTimeout(timeoutHandle);

      const abandoned = Array.from(inFlight.keys());
      const drained = startingIds.filter((id) => !abandoned.includes(id));

      stopped = true;
      return { drainedJobIds: drained, abandonedJobIds: abandoned, timedOut };
    },
    inFlightCount(): number {
      return inFlight.size;
    },
    inFlightJobIds(): string[] {
      return Array.from(inFlight.keys());
    },
  };
}

export function resolveConcurrency(envValue: string | undefined, fallback: number): number {
  return resolvePositiveInt(envValue, fallback);
}

export function resolvePositiveInt(envValue: string | undefined, fallback: number): number {
  if (!envValue) return fallback;
  const n = Number.parseInt(envValue, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return n;
}
