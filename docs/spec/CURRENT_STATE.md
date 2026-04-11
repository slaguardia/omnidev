# Current State — System Inventory

> Last updated: 2026-03-11

This document captures a comprehensive inventory of the tasking and workflow engine as it exists today.

---

## 1. Task Data Model

### RalphTask (Core Entity)

Storage: SQLite (`data/ralph.db`) via `ralph-task-manager.ts` and `ralph-task-db.ts`.

#### Identity & Metadata

| Field         | Type          | Description                                                                   |
| ------------- | ------------- | ----------------------------------------------------------------------------- |
| `id`          | string        | Unique ID (`ralph-{timestamp}-{random}`)                                      |
| `taskNumber`  | number        | Sequential human-readable ID (RLP-N), auto-assigned via atomic SQLite counter |
| `title`       | string        | Required task title                                                           |
| `workspaceId` | WorkspaceId   | Required workspace reference                                                  |
| `createdAt`   | ISO timestamp | Creation time                                                                 |
| `updatedAt`   | ISO timestamp | Last modification time                                                        |
| `completedAt` | ISO timestamp | Completion time (null until done)                                             |

#### Lifecycle & Status

| Field        | Type    | Description                                                                                    |
| ------------ | ------- | ---------------------------------------------------------------------------------------------- |
| `status`     | string  | Free-form (draft, triage, planning, research, ready, executing, complete, or custom stage IDs) |
| `isArchived` | boolean | Soft-deletion flag                                                                             |

Status is free-form — tasks can move between any status. There is no enforced state machine.

#### Hierarchy & Dependencies

| Field          | Type     | Description                                     |
| -------------- | -------- | ----------------------------------------------- |
| `parentId`     | string?  | Parent task ID (features have stories/subtasks) |
| `childIds`     | string[] | Child task IDs                                  |
| `subtaskOrder` | number   | Order within parent (1-based)                   |
| `blockedBy`    | string[] | Task IDs that must complete first               |

Circular dependency detection is implemented.

#### Git & Delivery

| Field            | Type    | Description                            |
| ---------------- | ------- | -------------------------------------- |
| `featureBranch`  | string? | Git branch created for edit operations |
| `baseBranch`     | string? | Base for feature branch                |
| `prTargetBranch` | string? | Target for PR/MR                       |
| `deliveryMethod` | enum    | `merge-request` or `direct-commit`     |
| `prUrl`          | string? | Populated on task completion           |

#### Content

| Field                | Type     | Description                             |
| -------------------- | -------- | --------------------------------------- |
| `description`        | string   | Task description                        |
| `instructions`       | string?  | Detailed instructions                   |
| `filePaths`          | string[] | Relevant code file paths                |
| `userStory`          | string?  | User story format ("As a... I want...") |
| `acceptanceCriteria` | string[] | List of acceptance criteria             |

#### Execution State

| Field            | Type    | Description                                   |
| ---------------- | ------- | --------------------------------------------- |
| `executionJobId` | string? | Currently running job ID                      |
| `executionError` | string? | Error message if execution fails              |
| `stageOutputs`   | Record  | Keyed by stage name — see Stage Outputs below |

#### Specialized Content

| Field            | Type    | Description                                                  |
| ---------------- | ------- | ------------------------------------------------------------ |
| `triageAnalysis` | object? | Complexity/scope analysis from triage stage                  |
| `planningState`  | object? | Plan iterations, generated story previews, pending questions |
| `researchState`  | object? | Research iterations, identified gaps, user feedback          |

#### Organization

| Field        | Type    | Description                                       |
| ------------ | ------- | ------------------------------------------------- |
| `projectId`  | string? | Optional project grouping                         |
| `playbookId` | string? | Named subset of stages for workflow customization |

### Stage Outputs

Each entry in `stageOutputs[stageName]` contains:

| Field              | Type             | Description                                                                   |
| ------------------ | ---------------- | ----------------------------------------------------------------------------- |
| `prompt`           | string           | Resolved prompt template                                                      |
| `currentIteration` | number           | Current iteration count                                                       |
| `maxIterations`    | number           | Maximum allowed iterations                                                    |
| `returnQuestions`  | boolean          | Whether to pause for human input                                              |
| `autoLoop`         | boolean          | Whether to auto-advance iterations                                            |
| `iterations`       | StageIteration[] | Array of execution results                                                    |
| `pendingQuestions` | Question[]       | Awaiting human answers                                                        |
| `activeJobId`      | string?          | Currently running job for this stage                                          |
| `autoLoopActive`   | boolean          | Whether auto-loop is running                                                  |
| `completionReason` | string?          | Why auto-loop stopped (complete, max-iterations, error, questions, cancelled) |

### StageIteration

| Field         | Type          | Description                      |
| ------------- | ------------- | -------------------------------- |
| `output`      | string        | Claude Code response text        |
| `questions`   | Question[]?   | Extracted questions              |
| `startedAt`   | ISO timestamp | Iteration start                  |
| `completedAt` | ISO timestamp | Iteration end                    |
| `jobId`       | string?       | Job that produced this iteration |

---

## 2. Workflow Definition

### Custom Stage System (Fully Implemented)

Users can define, edit, reorder, add, and delete workflow stages through the UI.

**Components:**

| Component          | Location                                                | Purpose                                        |
| ------------------ | ------------------------------------------------------- | ---------------------------------------------- |
| Stage Editor UI    | `src/components/dashboard/tabs/WorkflowSettingsTab.tsx` | Full CRUD for stages with drag-drop reorder    |
| Definition Manager | `src/lib/managers/workflow-definition-manager.ts`       | Persistence to `data/workflow-definition.json` |
| API Route          | `src/app/api/workflow/definition/route.ts`              | `GET/PUT/DELETE /api/workflow/definition`      |
| Client Hook        | `src/hooks/queries/useWorkflowDefinition.ts`            | Reactive access with derived helpers           |
| Schema/Defaults    | `src/lib/workflow/definition.ts`                        | Zod schema + `DEFAULT_WORKFLOW_DEFINITION`     |

**Editor capabilities:**

- Drag-and-drop stage reordering (Framer Motion `Reorder`)
- Add new stages with auto-generated unique IDs
- Delete stages (minimum 1 required)
- Edit per stage: ID (slug), display label, color, execution mode (readonly/edit), prompt template (textarea), max iterations, return questions toggle
- Shows "Draft" and "Complete" system bookends
- Save persists to disk; Reset deletes file and reverts to defaults

**Runtime integration:**

- Stage runner (`stage-runner.ts`) calls `loadWorkflowDefinition()` at execution time
- Falls back to `DEFAULT_WORKFLOW_DEFINITION` if no custom definition exists
- Zod validates on both save and load

Source: `src/lib/workflow/definition.ts`

### WorkflowStageDefinition

```typescript
{
  id: string             // e.g., 'triage', 'planning', 'executing'
  label: string          // Display name, e.g., 'Triage'
  color: ChipColor       // 'default' | 'warning' | 'secondary' | 'success' | 'primary' | 'danger'
  executionMode: string  // 'readonly' | 'edit'
  config: {
    prompt: string | null  // Template with {title}, {description}, {filePaths}
    maxIterations: number  // Default 1
    returnQuestions: boolean
    autoLoop: boolean
  }
  onEnter?: string       // 'branch-creation' | 'confirm-pr'
}
```

### Default Stages (Hardcoded)

| Stage     | Mode     | Iterations | Questions | Auto-Loop | Purpose                                         |
| --------- | -------- | ---------- | --------- | --------- | ----------------------------------------------- |
| triage    | readonly | 1          | no        | no        | Analyze scope, complexity, risks, decomposition |
| planning  | readonly | 1          | no        | no        | Create step-by-step implementation plan         |
| research  | readonly | 1          | yes       | no        | Validate plan against codebase, identify gaps   |
| ready     | readonly | —          | —         | —         | Final pre-execution check (no prompt)           |
| executing | edit     | 1          | no        | no        | Make code changes, creates feature branch + PR  |

### System Statuses (Bookends)

- `draft` — Initial status before any stages
- `complete` — Final status after execution

### Playbooks

Stored in `ralph_playbooks` SQLite table. Playbooks are named subsets of stages.

Default playbooks seeded on migration:

1. **Full Pipeline** (default): triage → planning → research → ready → executing
2. **Shotgun**: triage → executing

### Projects

Stored in `ralph_projects` SQLite table. Simple grouping with `id`, `name`, `color`.

---

## 3. Execution Engine

### Stage Runner (`src/lib/ralph/stage-runner.ts`)

Entry point: `startStageRun(taskId, stageName, options?)`

Flow:

1. Load workflow definition, find stage
2. Load task and workspace
3. Create feature branch (for edit-mode stages)
4. Transition task to stage status
5. Resolve prompt template (`{title}`, `{description}`, `{filePaths}`)
6. Guard against duplicate auto-loop triggers
7. Queue job via `executeOrQueue('ralph-stage', payload)`
8. Write `activeJobId` to `task.stageOutputs[stageName]`

### Prompt Resolution

Template variables available:

- `{title}` — Task title
- `{description}` — Task description
- `{filePaths}` — Formatted file paths list

**Limitation:** No access to previous stage outputs, acceptance criteria, workspace state, or sibling task results.

### Auto-Loop

- Agent signals completion via `<promise>COMPLETE</promise>` in output
- If not complete and not at max iterations: auto-enqueue next iteration
- Tracks `autoLoopActive`, `completionReason` in `stageOutputs`

### Auto-Advance

- When an auto-loop stage completes, the system auto-advances to the next playbook stage
- Fast-forwards through no-prompt stages
- Enqueues `run-stage` jobs for prompt-bearing stages

---

## 4. Job Queue System

### Architecture

File-based job queue at `data/queue/` and `data/jobs/`.

| Directory                       | Purpose                  |
| ------------------------------- | ------------------------ |
| `data/queue/pending/`           | Jobs waiting to run      |
| `data/queue/processing/`        | Currently executing jobs |
| `data/jobs/by-id/`              | Canonical job records    |
| `data/jobs/finished/completed/` | Success results          |
| `data/jobs/finished/failed/`    | Failure results          |

### Job Types

| Type                | Purpose                   | Retry |
| ------------------- | ------------------------- | ----- |
| `claude-code`       | Ask/edit operations       | 2     |
| `ralph-stage`       | Workflow stage execution  | 2     |
| `git-push`          | Push changes to remote    | 1     |
| `git-mr`            | Create merge/pull request | 1     |
| `workspace-cleanup` | Stale workspace cleanup   | 0     |

### Concurrency Model

- **Max concurrent jobs:** 5
- **Read-only jobs (ask):** Run in parallel
- **Edit jobs:** Serialized per workspace (no two edit jobs on same workspace simultaneously)
- **Workspace locking:** In-memory via `runningJobs` Map, cleared on process restart
- **Poll interval:** 2 seconds
- **Stuck job detection:** 15-minute threshold
- **Stale lock detection:** 10-minute threshold

### Retry Configuration

Exponential backoff: 30s → 60s → 120s. Retries are per-job-type configurable.

### Job Lifecycle

```
Enqueue → Pending → Processing → Completed/Failed
                              ↑
                              └── Retry (if retries remaining)
```

### Cleanup

- Finished jobs retained for 7 days
- Stuck job scan every ~3-4 minutes (100 poll iterations)
- Orphan recovery at startup

---

## 5. Claude Code Orchestrator

Source: `src/lib/claudeCode/orchestrator.ts`

### Execution

- Spawns Claude Code CLI as subprocess
- Uses sandboxed wrapper in Docker: `/usr/local/bin/claude-code-wrapper`
- Streams JSON output, parses `{ type: 'result', result, usage }`
- Activity-based timeout: 5 minutes inactivity

### Git Workflow Integration

- `git-workflow.ts`: Loads workspace, initializes branch for edits
- `post-execution.ts`: Detects changes, stages, commits, pushes, creates PR/MR
- Commit messages: semantic if task context provided (`feat: [RLP-N] title`), timestamp-based otherwise

---

## 6. Board UI

### Views

| View       | Description                                                                      |
| ---------- | -------------------------------------------------------------------------------- |
| **Kanban** | Columns: Draft → [workflow stages] → Complete. Drag-drop transitions.            |
| **List**   | Grouped by status, collapsible groups, hierarchical display for features/stories |

### Task Cards

Display: task number (RLP-N), title, workspace, status chip (colored), file paths, relative update time.

Indicators: pending questions, execution status, child counts.

Actions menu: transition, execute, complete, archive, clone, delete, view stories, create subtask.

Feature-specific actions: execute next story, execute all, complete feature.

### Filtering (`BoardFilterBar.tsx`)

- By workspace (multi-select)
- By task type (all, top-level, subtasks)
- View archived tasks

### Task Detail Screen

Full-screen view with: metadata, description, instructions, file paths, branch config, hierarchy, dependencies, project/playbook assignment, stage output history, pending question UI, action buttons.

### Projects Subtab

CRUD for projects (name + color). Tasks can be assigned to projects.

### Playbooks Subtab

CRUD for playbooks (name + stage subset). Tasks can be assigned to playbooks.

---

## 7. API Routes

### Task Management

| Method | Route                                       | Purpose                                                |
| ------ | ------------------------------------------- | ------------------------------------------------------ |
| GET    | `/api/ralph/tasks`                          | List tasks (enriched with workspace names, job status) |
| POST   | `/api/ralph/tasks/create`                   | Create task                                            |
| GET    | `/api/ralph/tasks/[taskId]`                 | Get task detail                                        |
| PUT    | `/api/ralph/tasks/[taskId]`                 | Update task                                            |
| POST   | `/api/ralph/tasks/[taskId]/run-stage`       | Start stage execution                                  |
| POST   | `/api/ralph/tasks/[taskId]/override-status` | Manual status override                                 |
| POST   | `/api/ralph/tasks/[taskId]/archive`         | Archive task                                           |
| POST   | `/api/ralph/tasks/[taskId]/complete`        | Mark complete with PR                                  |
| POST   | `/api/ralph/tasks/[taskId]/stage-answer`    | Answer pending questions                               |
| POST   | `/api/ralph/tasks/[taskId]/cancel-loop`     | Cancel auto-loop                                       |

### Feature Execution

| Method | Route                                        | Purpose                             |
| ------ | -------------------------------------------- | ----------------------------------- |
| GET    | `/api/ralph/tasks/[taskId]/batch-execute`    | Execute all ready children          |
| POST   | `/api/ralph/tasks/[taskId]/complete-feature` | Complete parent + aggregate results |
| POST   | `/api/ralph/tasks/[taskId]/execute`          | Execute next ready child            |

### Organization

| Method     | Route                               | Purpose                |
| ---------- | ----------------------------------- | ---------------------- |
| GET/POST   | `/api/ralph/projects`               | List/create projects   |
| PUT/DELETE | `/api/ralph/projects/[projectId]`   | Update/delete project  |
| GET/POST   | `/api/ralph/playbooks`              | List/create playbooks  |
| PUT/DELETE | `/api/ralph/playbooks/[playbookId]` | Update/delete playbook |

### Dependencies

| Method | Route                                        | Purpose                            |
| ------ | -------------------------------------------- | ---------------------------------- |
| GET    | `/api/ralph/tasks/[taskId]/dependencies`     | Get blockedBy/blocks relationships |
| GET    | `/api/ralph/tasks/[taskId]/dependency-graph` | Full dependency visualization      |

---

## 8. Infrastructure Layer

### Workspace Manager

- SQLite-backed workspace CRUD
- Tracks: path, repoUrl, targetBranch, timestamps, size, commitHash, isActive, gitConfig, permissions
- 7-day inactivity cleanup (configurable)

### Repository Manager

- Clone with credential injection
- Branch operations (create, switch, delete)
- Permission checking (push/merge capabilities)
- Provider detection (GitHub/GitLab/unknown)

### Discovery System

- GitHub: Octokit pagination, maps to `DiscoveredRepository`
- GitLab: Gitbeaker pagination with loose type handling
- Registry at `data/.discovery-registry.json`
- Auto-triggered on config save when tokens change (fire-and-forget)
- Clone status annotation at read time

### Configuration

- Stored at `data/app-config.json`
- Sections: gitlab, github, claude, workspace, security, logging
- Token encryption via `encryptValue()`/`decryptValue()`
- Git config propagation to all workspaces on identity change

### Authentication

- NextAuth sessions for web UI
- API key (`X-API-Key` header) for external clients
- IP whitelisting (optional)
- Rate limiting (default 100/hour)

---

## 9. Dashboard Navigation

### Top-Level Tabs

1. **Ralph Board** — Task workflow management
2. **Chat** — Conversation interface
3. **Operations** — Claude Code ask/edit interface
4. **External Tasking** — Webhook/event-driven execution history

### Configuration Section (Collapsible)

1. **Workspaces** — Manage cloned repos
2. **Git Source Config** — GitHub/GitLab credentials & git identity
3. **Environment Settings** — App-wide configuration
4. **Account Security** — 2FA, password management

---

## 10. Storage Layout

```
workflow/
├── workspaces/                  # Git repos (Claude Code accessible)
│   └── {workspaceId}/           # Individual cloned repos
├── data/                        # App-managed files (NOT Claude Code accessible)
│   ├── ralph.db                 # SQLite: tasks, projects, playbooks
│   ├── app-config.json          # Configuration (encrypted tokens)
│   ├── .discovery-registry.json # GitHub/GitLab discovery results
│   ├── queue/
│   │   ├── pending/             # Waiting jobs
│   │   ├── processing/          # Currently running
│   │   └── processing.lock.json
│   └── jobs/
│       ├── by-id/               # Canonical job records
│       └── finished/
│           ├── completed/
│           └── failed/
```
