# Omnidev Continuous Architecture Audit

You are a product-aware systems architect performing a gap analysis on the Omnidev project. Your job is to compare the current implementation against the north star architecture, identify what's missing or broken, and produce concrete, prioritized tasks.

## Instructions

1. **Read the north star.** Read `CLAUDE.md` at the project root. This is the authoritative architecture document. Everything you suggest must trace back to a principle, constraint, or success criterion defined there.

2. **Audit the current state.** Explore the codebase — not just file names, but actual implementations. Focus on:

   ### Unified Pipeline (ralph.db → worker → agent)

   - `src/worker/index.ts` — Does the worker poll `ralph.db`, claim jobs atomically, dispatch by `agent_type` (`ralph-stage` vs `coding-agent`), heartbeat during execution, and recover stale jobs?
   - `src/worker/job-executor.ts` — Does the V2 coding-agent pipeline (clone → branch → agent → commit → push) still work end-to-end after the RalphJob type migration?
   - `src/lib/queue/job-handlers.ts` — Does `executeRalphStageJob()` correctly handle stage execution, auto-loop continuation, auto-advance, question parsing, and artifact collection?
   - `src/worker/agent.ts` — Is the AgentRunner abstraction clean? Could a new agent be swapped in without touching the pipeline or database?

   ### Database Layer

   - `src/lib/managers/ralph-task-db.ts` — Is the unified schema correct? Do migrations v1–v5 run cleanly on a fresh database? Are job CRUD functions (`dbCreateJob`, `dbClaimNextPendingJob`, `dbHeartbeatJob`, `dbRecoverStaleJobs`) correct and tested?
   - Are there orphaned references to `src/lib/db/omnidev-db.ts` or `@/lib/db` imports that should have been migrated?

   ### API Surface

   - `src/app/api/ralph/` — Do the Ralph API routes cover task CRUD, stage transitions, stage runs, question answering, and artifact retrieval?
   - `src/app/api/v2/` — Do the V2 adapter routes correctly map to Ralph tasks? Does `PATCH status: "coding"` trigger a stage run?
   - Are there any API routes that still import from the old `@/lib/db` instead of `ralph-task-db`?

   ### Stage Execution Flow

   - `src/lib/ralph/stage-runner.ts` — Does `startStageRun()` insert jobs into SQLite (not the file queue)?
   - `src/lib/agent/agent-runner.ts` — Does `executeAgentRun()` use `AgentRunner` (not the deleted `StageExecutor`)?
   - Is the full stage lifecycle wired: enqueue → worker claims → agent runs → results stored → auto-loop/auto-advance?

   ### Reliability

   - Heartbeat: Does the worker update `heartbeat_at` every 30 seconds during both ralph-stage and coding-agent jobs?
   - Stale recovery: Does the poll loop mark jobs with no heartbeat for 10+ minutes as failed?
   - Self-healing: Do the task list and task detail APIs detect and clear stale `activeJobId` references?
   - Cleanup: Are temp directories always cleaned up via try/finally?
   - Are there any code paths where a job could get stuck in `running` forever?

   ### Dead Code & Residue

   - `src/lib/db/` — Is `omnidev-db.ts` still imported anywhere, or is it fully dead?
   - `src/lib/executor/` — Was the deleted StageExecutor directory fully removed? Any lingering imports?
   - `src/components/dashboard/tabs/V2TasksTab.tsx` — Was this removed? Any lingering references?
   - `src/hooks/queries/useV2Tasks.ts` — Was this removed? Any lingering imports?
   - File-based queue (`src/lib/queue/`) — Is it only used by `/api/ask` and `/api/edit` now? Are there ralph-stage references leaking back into it?

   ### UI / Dashboard

   - Ralph Board (`src/components/dashboard/tabs/ralph/`) — Does it expose all task management operations: create, edit, delete, transition, stage runs, question answering, dependency management?
   - Is the V2 Tasks tab fully removed from navigation and dashboard rendering?
   - Can a user perform the full task lifecycle from the dashboard without touching the API directly?

3. **Check against success criteria.** The architecture doc defines five success criteria:

   - Can a user create a task with a repo URL and description?
   - Does starting a stage (or moving to "coding" via V2 API) trigger a job in SQLite?
   - Does the worker claim the job, run the agent, and update task state?
   - Does the task reach a completed state with results?
   - For edit-mode tasks: does a branch exist remotely with changes?

   Trace each one through the actual code. If any step is broken or missing, that's the highest priority.

4. **Identify gaps.** Look for:

   - **Missing features**: Things the architecture promises but the code doesn't deliver
   - **Broken contracts**: Code that violates a documented constraint (e.g., agent coupling, layer bleed, two databases when there should be one)
   - **Reliability holes**: Ways a job could get stuck, leak temp dirs, or lose state
   - **Workflow rigidity**: Places where the pipeline is hardcoded when it should be configurable
   - **Dead code**: Remnants of the old V1/V2 split, unused abstractions, orphaned imports
   - **Missing tests**: Critical paths with no test coverage
   - **UX gaps**: Things the user can't do from the dashboard but should be able to
   - **Doc drift**: Places where CLAUDE.md files don't match the actual implementation

5. **Do NOT suggest:**

   - Custom LLM tool loops
   - Multi-agent orchestration
   - Agent framework abstractions beyond `AgentRunner`
   - Multi-tenant features
   - Features that assume a specific deployment model (cloud-only or local-only)

6. **Prioritize.** Rank every finding using this framework:

   - **P0 — Broken**: Success criteria not met, jobs can get stuck, data loss possible
   - **P1 — Gap**: Architecture promises something the code doesn't deliver
   - **P2 — Improvement**: Works but fragile, unclear, or could be simpler
   - **P3 — Enhancement**: Nice to have, aligns with north star but not blocking

7. **Output format.** Produce a structured task list. For each task:

```markdown
### [P{n}] {Short title}

**Gap:** What's missing or broken, traced to a specific CLAUDE.md section.

**Current state:** What the code does now (cite file paths and line ranges).

**Target state:** What it should do, concretely.

**Scope:** Files to modify, estimated complexity (small/medium/large).

**Acceptance criteria:**

- [ ] Concrete, testable condition 1
- [ ] Concrete, testable condition 2
```

8. **Be honest about what works.** If a system is solid, say so and move on. Don't invent problems. The goal is to find real gaps, not to generate busywork.

9. **Consider the full loop.** After producing tasks, think about what the NEXT audit cycle would need to check. Note any areas that are changing fast and should be re-audited after the current tasks are completed.

## Context

- V1 (Ralph workflows) and V2 (worker/SQLite architecture) have been **converged into one system**
- All tasks are Ralph tasks. The V2 API routes are backward-compatible adapters over Ralph tasks.
- All jobs (both `ralph-stage` and `coding-agent`) live in the `jobs` table in `ralph.db`
- The standalone worker (`pnpm worker`) polls `ralph.db` and dispatches by `agent_type`
- `StageExecutor` was replaced by `AgentRunner` — the old `src/lib/executor/` directory was deleted
- The file-based queue (`src/lib/queue/`) is retained only for `/api/ask` and `/api/edit` legacy routes
- `src/lib/db/omnidev-db.ts` may still exist but should be dead code after convergence
- The V2 Tasks tab and useV2Tasks hook were removed from the dashboard
- The worker has not been tested end-to-end against a real repository with ralph-stage jobs yet

## What to read first

1. `CLAUDE.md` (root) — north star architecture
2. `src/worker/` — all files (poll loop, dispatch, agent, job executor)
3. `src/lib/managers/ralph-task-db.ts` — unified database layer
4. `src/lib/ralph/stage-runner.ts` — stage run enqueuing
5. `src/lib/agent/agent-runner.ts` — stage execution with AgentRunner
6. `src/lib/queue/job-handlers.ts` — ralph stage job handler
7. `src/app/api/ralph/` — all Ralph API routes
8. `src/app/api/v2/` — V2 adapter routes
9. `src/components/dashboard/tabs/ralph/` — Ralph Board UI
10. `package.json` — scripts section
11. `docker-compose.yml` + `docker-compose.override.yml`
