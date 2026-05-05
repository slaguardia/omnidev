# Concurrency

Omnidev runs multiple jobs in parallel inside a single worker process and supports horizontal scale-out across multiple worker processes.

## Tuning knobs

| Env var                      | Default | Effect                                                                             |
| ---------------------------- | ------- | ---------------------------------------------------------------------------------- |
| `WORKER_CONCURRENCY`         | `3`     | Max in-flight jobs per worker process. Set to `1` for strictly serial behavior.    |
| `WORKER_SHUTDOWN_TIMEOUT_MS` | `60000` | How long graceful shutdown waits for in-flight jobs before requeueing them.        |
| `OMNIDEV_REPO_CACHE`         | `1`     | Set to `0` to disable the bare-clone cache and fall back to per-job shallow clone. |

## How parallelism works

Today the V2 path looks like:

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Worker A     │     │ Worker B     │     │ Worker C     │
│ N in-flight  │     │ N in-flight  │     │ N in-flight  │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       └────────────────────┼────────────────────┘
                            ▼
                   ┌──────────────────┐
                   │  Postgres / SQLite │
                   │  (shared state)    │
                   └──────────────────┘
```

The DB is the only synchronization point.

### In-process N-slot scheduler

Each worker process runs an N-slot scheduler. When a slot frees, the worker immediately tries to claim another pending job — backpressure naturally caps work at `WORKER_CONCURRENCY`. Stale-job recovery and expired-token cleanup run on the fixed poll cadence regardless of slot occupancy.

Source: [`src/worker/src/scheduler.ts`](../src/worker/src/scheduler.ts).

### Multi-worker safety

The atomic claim (`dbClaimNextPendingJob` in [`ralph-task-db-pg.ts`](../src/shared/src/lib/managers/ralph-task-db-pg.ts)) uses a Prisma transaction with `findFirst` + `updateMany` gated on `status = 'pending'`. Two workers racing on the same job can never both claim it.

Validated by [`tests/unit/multi-worker-claim.test.ts`](../tests/unit/multi-worker-claim.test.ts) which spins up two scheduler instances against a shared mock DB and asserts no double-claim across N concurrent jobs.

### Workspace isolation per job

Each job gets its own working directory keyed by both task ID and job ID — see [`buildWorkspaceDir`](../src/worker/src/git-helpers.ts). Concurrent runs of the same task land in distinct directories.

### Shared bare-clone cache

When `OMNIDEV_REPO_CACHE=1` (the default), the worker maintains one bare clone per repo URL under `<dataDir>/repo-cache/`. Per-job clones use `git clone --reference <bare>` so the object database is shared across jobs. A per-repo async lock serializes the bare-clone fetch step (one fetch per repo even when 10 jobs queue at once).

Source: [`src/shared/src/lib/git/repo-cache.ts`](../src/shared/src/lib/git/repo-cache.ts).

### Graceful shutdown

On `SIGTERM` / `SIGINT`, the worker stops accepting new jobs and waits up to `WORKER_SHUTDOWN_TIMEOUT_MS` for in-flight jobs to finish. Survivors are reset to `pending` via `dbRequeueJob` so a peer worker can claim them immediately — no 10-minute stale-recovery wait.

## Observability

### Per-job duration log

Each completed V2 job emits a structured log line:

```
[WORKER:duration] {"job_id":"j-abc","task_id":"t-xyz","agent_type":"coding-agent","repo_url":"https://...","execution_mode":"edit","clone_ms":1830,"agent_ms":42101,"push_ms":612,"total_ms":44991,"retried":false}
```

Grep for `[WORKER:duration]` to extract per-job timings; pipe to `jq` for aggregation.

### In-flight count

While the worker has any jobs running, each poll tick emits:

```
[WORKER:in-flight] {"count":2,"max":3,"job_ids":["j-abc","j-def"]}
```

The same data is queryable from the DB via `dbGetWorkerHealth()` for dashboard integration.

## Scaling out

Two patterns work today:

### One container, many slots

```yaml
services:
  worker:
    environment:
      - WORKER_CONCURRENCY=5
```

Cheapest. Limited by the box's CPU and memory.

### Many containers

```yaml
services:
  worker:
    deploy:
      replicas: 3
    environment:
      - WORKER_CONCURRENCY=3
```

The DB job-claim still prevents double-claims. Each container can be sized independently. Best when you want isolation between groups of jobs (e.g., one container per repo cluster).

You can mix: `replicas: 2` × `WORKER_CONCURRENCY=4` = 8 concurrent jobs.

## Benchmarking

There is no automated benchmark script yet. Repeatable manual recipe:

1. **Set up.** Clean Postgres database, two test repositories of similar size.
2. **Sequential baseline.**
   ```bash
   WORKER_CONCURRENCY=1 OMNIDEV_REPO_CACHE=0 pnpm worker &
   # Submit K identical jobs via /api/v2/tasks (status=coding)
   # Time wall-clock from first job pending → last job completed
   ```
3. **Concurrent.**
   ```bash
   WORKER_CONCURRENCY=3 OMNIDEV_REPO_CACHE=0 pnpm worker &
   # Same K jobs
   ```
4. **Concurrent + cache.**
   ```bash
   WORKER_CONCURRENCY=3 OMNIDEV_REPO_CACHE=1 pnpm worker &
   # Same K jobs (run twice — second run measures warm-cache behavior)
   ```
5. **Aggregate.** Grep the worker logs for `[WORKER:duration]` lines, parse with `jq`:
   ```bash
   grep '\[WORKER:duration\]' worker.log | sed 's/^[^{]*//' | jq -s '
     {
       count: length,
       wall_clock_total_ms: (max_by(.total_ms).total_ms),
       avg_clone_ms:  ([.[].clone_ms]  | add / length),
       avg_agent_ms:  ([.[].agent_ms]  | add / length),
       avg_push_ms:   ([.[].push_ms]   | add / length),
       avg_total_ms:  ([.[].total_ms]  | add / length)
     }'
   ```
6. **Disk usage.** Compare `du -sh <dataDir>/repo-cache/` and `du -sh /tmp/omnidev/` with vs without the cache.

Record numbers in a follow-up PR comment so the team has a hardware-pinned baseline. The relevant axes are: K (job count), repo size, agent execution mode (edit vs readonly), and worker box specs.

## What's not solved here

Concurrent runs of the **same** task push to the same remote branch (`omnidev/task-{id}` is keyed by task only — see [`buildBranchName`](../src/worker/src/git-helpers.ts)). The second push will conflict on the remote unless the first finished cleanly. This is by design for now — the goal of this work was to safely run **different** tasks in parallel. Re-running the same task is expected to be sequential at the user level.
