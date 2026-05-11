# Architecture — System Design As-Built

> **Legacy note:** This document was written before the Cursor SDK migration. It may reference the removed Claude Code CLI integration, the `claudeCode/` directory, or sandbox-wrapper patterns that no longer apply. The Cursor SDK is the only agent backend today — see [docs/CURSOR.md](./CURSOR.md) for current setup. Sections below are preserved as historical context.

> Last updated: 2026-03-11

This document describes the layered architecture of Omnidev's tasking and workflow engine.

---

## Layer Diagram

```
┌─────────────────────────────────────────────────────┐
│                    Dashboard UI                      │
│  (Kanban Board, Task Detail, Filtering, Modals)     │
├─────────────────────────────────────────────────────┤
│                    API Routes                        │
│  (REST endpoints, auth middleware, Zod validation)   │
├─────────────────────────────────────────────────────┤
│                 Workflow Engine                       │
│  (Stage definitions, playbooks, transitions)         │
├──────────────────┬──────────────────────────────────┤
│  Stage Runner    │         Job Queue                 │
│  (Prompt build,  │  (File-based, concurrency         │
│   branch setup,  │   control, retry, polling)        │
│   job dispatch)  │                                   │
├──────────────────┴──────────────────────────────────┤
│              Claude Code Orchestrator                │
│  (Subprocess spawn, JSON streaming, timeout mgmt)    │
├─────────────────────────────────────────────────────┤
│               Git Operations Layer                   │
│  (simple-git, branch mgmt, commit, push, PR/MR)     │
├─────────────────────────────────────────────────────┤
│              Infrastructure Services                 │
│  (Workspace mgmt, config, discovery, auth)           │
├─────────────────────────────────────────────────────┤
│                   Storage                            │
│  (SQLite, filesystem, JSON config)                   │
└─────────────────────────────────────────────────────┘
```

---

## Data Flow: Task Execution

### Single Task Stage Execution

```
User clicks "Run Stage"
    │
    ▼
POST /api/ralph/tasks/{id}/run-stage
    │
    ▼
startStageRun(taskId, stageName)
    ├── Load workflow definition
    ├── Load task + workspace
    ├── Create feature branch (if edit mode)
    ├── Transition task status → stage
    ├── Resolve prompt template
    │   └── Variables: {title}, {description}, {filePaths}
    └── Queue job
        │
        ▼
    executeOrQueue('ralph-stage', payload)
        │
        ▼
    Worker picks up job
        ├── Execute Claude Code CLI
        ├── Parse output
        ├── Store iteration in task.stageOutputs
        ├── If autoLoop && not complete:
        │   └── Enqueue next iteration
        ├── If autoLoop && complete:
        │   └── Auto-advance to next stage
        └── If returnQuestions:
            └── Set pendingQuestions, pause
                │
                ▼
            User answers questions
                │
                ▼
            POST /api/ralph/tasks/{id}/stage-answer
                └── Resume iteration
```

### Feature Execution (Parent with Stories)

```
User clicks "Execute All" on feature
    │
    ▼
POST /api/ralph/tasks/{id}/batch-execute
    │
    ▼
For each child task (respecting dependency order):
    ├── Check blockedBy dependencies satisfied
    ├── startStageRun(childId, nextStage)
    └── Queue independent stories in parallel
        │
        ▼
    Workspace-level serialization ensures:
    - Edit jobs on same workspace run sequentially
    - Read-only jobs can run in parallel
    - Different workspace tasks fully parallel
        │
        ▼
All stories complete
    │
    ▼
POST /api/ralph/tasks/{id}/complete-feature
    ├── Aggregate child results
    ├── Create consolidated PR/MR
    └── Mark feature complete
```

---

## Concurrency Model

### Workspace-Level Edit Serialization

The system prevents concurrent edit operations on the same workspace directory. This is critical because Git operations are not atomic and concurrent edits would cause conflicts.

```
Workspace A:  [edit job 1] ──────► [edit job 2] ──────► [edit job 3]
                                                        (serialized)

Workspace B:  [edit job 4] ──────► [edit job 5]
              (parallel with A)    (serialized within B)

Read-only:    [ask job 6] [ask job 7] [ask job 8]
              (all parallel, no locking)
```

### Implementation

- **Tracking:** In-memory `runningJobs` Map in worker process
- **Lock scope:** Per workspace path, edit jobs only
- **Lock lifetime:** Duration of job execution
- **Recovery:** Locks cleared on process restart; stuck job detection at 15 minutes
- **Limitation:** In-memory only — does not survive process restart

### Queue Processing

```
Worker loop (every 2s):
    1. Check capacity (< 5 concurrent)
    2. Get pending jobs (respecting retry backoff)
    3. For each candidate:
       ├── Extract workspace + isEdit
       ├── Check conflict with running edit jobs
       ├── If no conflict: move pending → processing, fire-and-forget
       └── If conflict: skip, will retry next poll
    4. Every 100 iterations: cleanup + stuck detection
```

---

## Storage Architecture

### SQLite (Primary Structured Storage)

| Database     | Location            | Tables                                                           |
| ------------ | ------------------- | ---------------------------------------------------------------- |
| `ralph.db`   | `data/ralph.db`     | `ralph_tasks`, `ralph_meta`, `ralph_projects`, `ralph_playbooks` |
| Workspace DB | Via workspace-db.ts | Workspace metadata                                               |

Configuration:

- WAL mode for concurrent access
- 5-second busy timeout
- Auto-migration with version tracking

### File System (Queue & Jobs)

Jobs use a file-based queue with atomic `rename()` for state transitions:

```
Enqueue:   write to pending/{jobId}.json
Process:   rename pending/{id} → processing/{id}
Complete:  write to by-id/{id}.json, create finished/completed/{id}.json pointer
Failed:    write to by-id/{id}.json, create finished/failed/{id}.json pointer
```

### JSON Config Files

| File                            | Purpose                            | Write Frequency      |
| ------------------------------- | ---------------------------------- | -------------------- |
| `data/app-config.json`          | Application configuration          | Rare (user action)   |
| `data/.discovery-registry.json` | GitHub/GitLab repo discovery cache | On discovery trigger |

---

## Authentication & Authorization

### Request Authentication

```
Request
    │
    ├── Has NextAuth session cookie? → Authenticated (web UI)
    ├── Has X-API-Key header? → Validate against stored key → Authenticated (API)
    └── Neither → 401 Unauthorized
```

### Authorization Scope

Currently flat — any authenticated user can access any workspace and any task. There is no per-workspace or per-task authorization model.

---

## Module Dependency Graph

```
Dashboard UI
    └── API Routes
        ├── ralph-task-manager (CRUD, transitions)
        │   └── ralph-task-db (SQLite)
        ├── stage-runner (execution orchestration)
        │   ├── workflow/definition (stage definitions)
        │   ├── ralph-task-manager
        │   └── queue/executeOrQueue
        ├── queue/job-handlers (job execution)
        │   ├── claudeCode/orchestrator
        │   ├── claudeCode/git-workflow
        │   ├── claudeCode/post-execution
        │   └── ralph-task-manager
        └── workspace-manager
            └── workspace-db
```

---

## Key Design Decisions

### Why file-based job queue (not Redis/PostgreSQL)?

- Zero additional infrastructure dependencies
- Deploy-anywhere compatibility (cloud, VPS, local)
- Atomic `rename()` provides sufficient consistency for single-process worker
- Job volume is low (developer tool, not high-throughput service)

### Why SQLite for tasks (not JSON files)?

- Tasks were originally JSON files in `workspaces/.ralph-tasks/`
- Migrated to SQLite for: indexing, atomic counters (task numbers), concurrent access, query performance
- Auto-migration from legacy JSON preserves existing data

### Why free-form status (not enforced state machine)?

- Users need flexibility to skip stages, go back, or use custom workflows
- Playbooks provide soft ordering without hard enforcement
- `getValidNextStatuses()` returns all stages as valid — the UI suggests but doesn't enforce

### Why workspace-level serialization (not finer-grained)?

- Git working directory is the atomic unit — any edit operation touches the same files
- Branch-level locking would require workspace duplication (git worktrees)
- Read-only operations are safe to parallelize since they don't modify the working tree
