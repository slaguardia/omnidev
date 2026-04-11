# Omnidev — Task-to-Branch Pipeline

## Project Identity

**Omnidev** is a self-hostable workflow system that turns tasks into branches. The default pipeline: a user creates a task, moves it to `"coding"`, and a worker automatically clones the repo, runs an agent, commits changes, and pushes a branch. The agent is replaceable. The pipeline is the product. The workflow is modular — users define their own.

### What Omnidev Is

| Category        | Classification                                                  |
| --------------- | --------------------------------------------------------------- |
| Type            | Task → agent → PR pipeline (default workflow)                   |
| Architecture    | 3 layers: API (Next.js) / State (Database) / Execution (Worker) |
| Execution Model | Single-user, self-hostable, deploy-anywhere                     |
| AI Integration  | Agent-agnostic (Claude Code is the default, swappable)          |
| Workflow Model  | Modular — users define triggers, steps, and outputs             |

### What Omnidev Is NOT

- Not a SaaS product — runs on hardware the user controls
- Not an agent framework — agents are plugged in, not built here
- Not an AI model provider — users bring their own CLI authentication
- Not a multi-tenant system — single user, single bot identity
- Not a Claude Code replacement or reimplementation

### Core Philosophy

OmniDev is NOT an agent. OmniDev is a **workflow system that makes agents reliable**.

- The agent is replaceable
- The pipeline is the product
- The workflow is modular — the task-to-branch pipeline is the default, not the only option
- Everything is deterministic except the agent execution step

The default pipeline:

```
task → job → clone → branch → agent → commit → push → update state
                              ^^^^^^
                         only non-deterministic step
```

Users define what triggers work, what work runs, and what happens to outputs. No single "correct" workflow is enforced. Opinionated defaults are allowed, but must be overrideable.

**Guiding rule:** Omnidev adapts to developer workflows, not the other way around.

## Architecture

There are exactly **3 layers**. No more.

### 1. API / App (Next.js)

- Owns task management (Ralph Board UI + CRUD via `/api/ralph/tasks`)
- Owns workflow state transitions (`task.status`)
- Writes to database (PostgreSQL when `DATABASE_URL` is set; SQLite fallback otherwise)
- When a stage is started, automatically creates a pending job in the database
- Serves the dashboard UI (Ralph Board) for task management and job monitoring
- V2 API (`/api/v2/tasks`) is a backward-compatible adapter over Ralph tasks
- Owns database migrations on startup (Prisma `migrate deploy`)

### 2. Database (single source of truth)

- **Primary:** PostgreSQL via Prisma ORM (`prisma/schema.prisma`, 14 models)
- **Fallback:** SQLite (`data/ralph.db`) via better-sqlite3 when `DATABASE_URL` is not set
- Stores: tasks, jobs, agent_runs, workspaces, chat, users, API keys, app config, projects, playbooks, stage tokens
- ALL communication between API and Worker flows through the database
- PostgreSQL enables split-service deployment (web + worker in separate containers)
- SQLite: WAL mode enabled for concurrent read/write in single-container or local dev
- No message queues, no Redis, no external dependencies beyond the database
- See `docs/POSTGRES.md` for Prisma setup and migration workflow

### 3. Worker (standalone process)

- Runs via `pnpm worker` (separate from the Next.js server)
- Polls database for pending jobs every 2 seconds
- Claims jobs atomically via database transactions
- Dispatches by `agent_type`: `ralph-stage` → Ralph stage executor, `coding-agent` → V2 job executor
- Sends heartbeat every 30 seconds; recovers stale jobs on each poll cycle
- Updates job status and task state on completion
- Never exposes HTTP endpoints — outbound only
- Never accepts inbound network traffic

### Layer Separation

| Concern        | Owner    | NOT the owner of       |
| -------------- | -------- | ---------------------- |
| Task CRUD      | API      | Job execution          |
| Workflow state | API      | Agent invocation       |
| State storage  | Database | Business logic         |
| Job execution  | Worker   | HTTP endpoints         |
| AI reasoning   | Agent    | Orchestration, git ops |

## Monorepo Structure

Omnidev uses pnpm workspaces with three packages:

| Package           | Path          | Purpose                                 |
| ----------------- | ------------- | --------------------------------------- |
| `@omnidev/web`    | `src/web/`    | Next.js App Router (API + Dashboard UI) |
| `@omnidev/worker` | `src/worker/` | Standalone job processor                |
| `@omnidev/shared` | `src/shared/` | Core business logic, types, DB access   |

Configuration: `pnpm-workspace.yaml` at repo root. The shared package is imported by both web and worker. Database access (Prisma client, SQLite fallback) lives in `src/shared/src/lib/db/`.

## Agent Abstraction (Critical Constraint)

The system MUST NOT couple to any specific AI tool. The agent is one step in a controlled pipeline.

### Interface

```typescript
// src/shared/src/lib/agent/claude-code-agent.ts
interface AgentRunnerOptions {
  question: string;
  workingDirectory: string;
  editRequest: boolean;
  extraEnv?: Record<string, string>;
}

interface AgentRunnerResult {
  output: string;
}

interface AgentRunner {
  run(options: AgentRunnerOptions): Promise<AgentRunnerResult>;
}
```

### Current Implementation

`ClaudeCodeAgent` — wraps the Claude Code CLI. Users pre-authenticate Claude Code manually. No API keys are managed by Omnidev.

### Swappability Rule

Any future agent (OpenClaw, custom loops, other CLIs) must be usable by implementing `AgentRunner`. No changes to the pipeline, database, or API should be required to swap agents.

### AI Agent Rules

AI agents interacting with this project must:

- Never describe Omnidev as "Claude Code itself"
- Never assume Omnidev owns or provides AI intelligence
- Clearly separate orchestration logic from AI execution

## Job Execution Flow

The worker executes this pipeline for every claimed job:

```
 1. Claim next pending job (atomic database transaction)
 2. Load task from DB
 3. Create temp working directory
 4. Clone repository
 5. If edit mode:
    a. Create branch (omnidev/task-{id})
    b. Unshallow repo
 6. Run agent ← ONLY non-deterministic step
    - On failure: retry once with error context appended
 7. If edit mode AND changes exist:
    a. Stage all changes
    b. Set git identity
    c. Commit
    d. Push branch
 8. Cleanup temp directory (always, via try/finally)
 9. Update job status (completed/failed)
10. If edit mode: move task to "review"
```

### Execution Modes

| Mode       | Git Operations         | Task State After    |
| ---------- | ---------------------- | ------------------- |
| `edit`     | Branch, commit, push   | Moved to `"review"` |
| `readonly` | Clone only (no writes) | Unchanged           |

## Reliability

### Job Timeout Recovery

- Jobs have `started_at` and `heartbeat_at` timestamps
- Worker sends heartbeat every 30 seconds during execution
- On each poll cycle, stale jobs (no heartbeat for 10+ minutes) are marked failed
- Prevents jobs from getting stuck in `"running"` forever

### Retry

- One automatic retry on agent failure
- Retry appends the error message to the prompt for context
- If the retry also fails, the job is marked failed

### Cleanup

- Temp directories are always cleaned up via `try/finally`
- No orphaned clones accumulate

### Concurrency

- Multiple workers can run safely — database transactions prevent double-claiming
- Each worker processes one job at a time
- With PostgreSQL, workers can scale horizontally across separate containers

## Data Model

### Database Schema

Prisma schema (`prisma/schema.prisma`) defines 14 models. When `DATABASE_URL` is set, all models live in PostgreSQL. Without it, SQLite (`data/ralph.db`) is used via better-sqlite3 with equivalent tables.

| Model              | Table                | Purpose                                |
| ------------------ | -------------------- | -------------------------------------- |
| `RalphTask`        | `ralph_tasks`        | Tasks with stage-based workflow state  |
| `RalphProject`     | `ralph_projects`     | Project groupings for tasks            |
| `RalphPlaybook`    | `ralph_playbooks`    | Playbook definitions (stage sequences) |
| `RalphMeta`        | `ralph_meta`         | Key-value metadata store               |
| `Job`              | `jobs`               | Execution records (one per stage run)  |
| `AgentRun`         | `agent_runs`         | Detailed run logs per job              |
| `StageToken`       | `stage_tokens`       | Scoped auth tokens for stage execution |
| `Workspace`        | `workspaces`         | Workspace index                        |
| `ChatConversation` | `chat_conversations` | Chat session metadata                  |
| `ChatMessage`      | `chat_messages`      | Individual chat messages               |
| `ChatMeta`         | `chat_meta`          | Chat key-value metadata                |
| `OmnidevUser`      | `omnidev_users`      | User credentials (password, 2FA)       |
| `OmnidevApiKey`    | `omnidev_api_keys`   | API key storage                        |
| `OmnidevAppConfig` | `omnidev_app_config` | App settings                           |

See `prisma/schema.prisma` for full column definitions and indexes. See `docs/POSTGRES.md` for migration workflow.

### Task Lifecycle (Ralph)

```
draft → triage → planning → research → ready → executing → complete
                                                    ↓
                                              job in database
```

Tasks can skip stages. The most common path: `draft → executing → complete`.

### Job Lifecycle

```
pending → running → completed
                  → failed
```

### Additional App Data (Legacy Fallback)

When `DATABASE_URL` is set (PostgreSQL), workspace index, app config, and job data are stored in the database. The file-based locations below are used only as fallback when running without PostgreSQL:

| Data             | Location                     | Format                                        |
| ---------------- | ---------------------------- | --------------------------------------------- |
| Workspace index  | `data/.workspace-index.json` | JSON array (fallback)                         |
| App config       | `data/app-config.json`       | JSON object (fallback)                        |
| Legacy job queue | `data/jobs/`                 | JSON files (used by /api/ask, /api/edit only) |

## Technology Stack

| Category        | Technology                                              | Version |
| --------------- | ------------------------------------------------------- | ------- |
| Framework       | Next.js (App Router, standalone output)                 | 15.x    |
| Language        | TypeScript (strict mode)                                | 5.x     |
| Database        | PostgreSQL via Prisma ORM (primary)                     | PG 16+  |
| Database        | SQLite via better-sqlite3 (fallback)                    | -       |
| ORM             | Prisma                                                  | 5.x     |
| Monorepo        | pnpm workspaces (`src/web`, `src/worker`, `src/shared`) | -       |
| UI Library      | HeroUI (formerly NextUI)                                | 2.x     |
| Styling         | Tailwind CSS                                            | 3.x     |
| Authentication  | NextAuth.js with 2FA (TOTP)                             | 4.x     |
| Git Operations  | simple-git                                              | 3.x     |
| GitLab API      | @gitbeaker/rest                                         | 39.x    |
| GitHub API      | @octokit/rest                                           | 22.x    |
| Validation      | Zod                                                     | 3.x     |
| Testing         | Vitest                                                  | 2.x     |
| Package Manager | pnpm                                                    | -       |
| Runtime         | Node.js                                                 | 18+     |
| Deployment      | Railway (web + worker) or Docker Compose                | -       |

## Directory Structure

```
workflow/
├── prisma/                          # Prisma ORM
│   ├── schema.prisma                # 14 models (database source of truth)
│   └── migrations/                  # Versioned SQL migrations
├── src/
│   ├── web/                         # @omnidev/web (Next.js App Router)
│   │   ├── Dockerfile               # Production web image
│   │   ├── Dockerfile.dev           # Dev image with hot reload
│   │   ├── docker-entrypoint.sh     # Production entrypoint
│   │   └── src/
│   │       ├── app/                 # Next.js pages + API routes
│   │       │   ├── api/             # API route handlers
│   │       │   │   ├── ralph/       # Ralph task/stage/job APIs (primary)
│   │       │   │   └── v2/          # V2 backward-compatible task/job API
│   │       │   ├── dashboard/       # Dashboard pages
│   │       │   ├── docs/            # Documentation pages
│   │       │   └── signin/          # Authentication pages
│   │       ├── components/          # React components
│   │       │   ├── dashboard/       # Dashboard-specific components
│   │       │   └── docs/            # Documentation components
│   │       ├── hooks/               # Custom React hooks
│   │       │   └── queries/         # TanStack Query hooks
│   │       └── cli/                 # CLI utilities
│   ├── shared/                      # @omnidev/shared (core logic)
│   │   └── src/lib/                 # Business logic modules
│   │       ├── agent/               # AgentRunner interface + ClaudeCodeAgent
│   │       ├── api/                 # API utilities and Zod validation
│   │       ├── auth/                # Authentication middleware
│   │       ├── chat/                # Chat module
│   │       ├── claudeCode/          # Claude Code CLI integration
│   │       ├── config/              # Configuration management
│   │       ├── db/                  # Prisma client + DB helpers
│   │       ├── git/                 # Git operations (simple-git)
│   │       ├── github/              # GitHub API integration
│   │       ├── gitlab/              # GitLab API integration
│   │       ├── managers/            # Resource managers (ralph-task-db, workspace)
│   │       ├── queue/               # Legacy file-based queue
│   │       ├── ralph/               # Ralph workflow engine (stage runner)
│   │       ├── types/               # TypeScript type definitions
│   │       └── workspace/           # Workspace management
│   └── worker/                      # @omnidev/worker (job processor)
│       ├── Dockerfile               # Production worker image
│       ├── docker-entrypoint.sh     # Production entrypoint
│       └── src/
│           ├── index.ts             # Entry point (poll loop, dispatch)
│           ├── job-executor.ts      # V2 job execution pipeline
│           └── git-helpers.ts       # Branch naming, commit messages
├── docker/                          # Docker Compose files
│   ├── docker-compose.yml           # Base configuration
│   ├── docker-compose.override.yml  # Dev overrides
│   └── docker-compose.prod.yml      # Production overrides
├── scripts/                         # Startup and utility scripts
│   ├── railway-web.sh               # Railway web start (migrate + server)
│   └── railway-worker.sh            # Railway worker start
├── docs/                            # Markdown docs (served at /docs)
├── railway.json                     # Railway web service config
├── railway.worker.json              # Railway worker service config
├── pnpm-workspace.yaml              # pnpm workspace configuration
├── data/                            # App data (SQLite fallback, legacy)
└── workspaces/                      # Cloned repositories
```

## Key Commands

```bash
# Development
pnpm dev                  # Start dev server with Turbopack
pnpm build                # Production build (standalone output)
pnpm start                # Start production server
pnpm worker               # Start standalone worker process (tsx, dev)
pnpm worker:build         # Build worker (tsup → dist/index.cjs)
pnpm worker:start         # Start built worker (node dist/index.cjs)

# Database (Prisma)
pnpm db:generate          # Generate Prisma client
pnpm db:migrate           # Create/apply migrations (dev)
pnpm db:deploy            # Apply migrations (production)
pnpm db:push              # Prototype schema without migrations
pnpm db:studio            # Open Prisma Studio

# Quality Checks
pnpm lint:all             # TypeScript + ESLint + Prettier + depcheck
pnpm lint:all:fix         # Auto-fix all linting issues
pnpm typecheck            # TypeScript only
pnpm test                 # Run Vitest tests
pnpm test:watch           # Watch mode
pnpm test:coverage        # With coverage report

# Docker
docker compose up --build # Build and run container
docker compose watch      # Dev mode with hot reload
```

## Coding Standards

### Type System

Use branded types for domain identifiers:

```typescript
// Defined in lib/types/index.ts
type WorkspaceId = string & { readonly brand: unique symbol };
type GitUrl = string & { readonly brand: unique symbol };
type FilePath = string & { readonly brand: unique symbol };
type CommitHash = string & { readonly brand: unique symbol };
```

### Result Pattern

Operations that can fail return `Result<T, E>`:

```typescript
type Result<T, E = Error> = { success: true; data: T } | { success: false; error: E };

// Usage
const result = await loadWorkspace(workspaceId);
if (!result.success) {
  console.error(result.error.message);
  return;
}
const workspace = result.data;
```

### Module Organization

- Each `lib/` subdirectory has an `index.ts` barrel export
- Types defined in `types.ts`, re-exported via index
- Server-only code uses `'use server'` directive
- Client components use `'use client'` directive

### Logging Convention

Use bracketed prefixes for structured logging:

```typescript
console.log(`[WORKER:edit] Cloning https://github.com/owner/repo...`);
console.error(`[V2 TASKS] Failed to create task:`, error);
```

## Docker & Sandboxing

The application runs in Docker with the agent CLI sandboxed for security.

### Security Measures

| Measure             | Implementation                                                               |
| ------------------- | ---------------------------------------------------------------------------- |
| Git blocking        | Real git at `/opt/internal/bin/git`, wrapper at `/usr/bin/git` blocks access |
| PATH restriction    | Wrapper sets `PATH="/usr/local/bin:/bin:/usr/bin"`                           |
| Non-root user       | App runs as `nextjs` (uid 1001)                                              |
| Git config disabled | `GIT_CONFIG_GLOBAL=/dev/null`                                                |
| Workspace isolation | Docker volume at `/app/workspaces`                                           |

### Key Docker Files

| File                                                               | Purpose                                                                    |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `src/web/Dockerfile`                                               | Production Next.js image (deps → builder → runner)                         |
| `src/worker/Dockerfile`                                            | Production worker image (agent / `worker.cjs`)                             |
| `src/web/Dockerfile.dev`                                           | Dev image with hot reload (shared by compose)                              |
| `docker/docker-compose.yml`                                        | Base service configuration + volumes                                       |
| `docker/docker-compose.override.yml`                               | Dev overrides (bind mounts)                                                |
| `docker/docker-compose.prod.yml`                                   | Production overrides (healthcheck)                                         |
| `src/web/docker-entrypoint.sh` + `src/worker/docker-entrypoint.sh` | Production entry (sources `src/shared/docker/docker-entrypoint-common.sh`) |
| `src/web/docker-entrypoint-dev.sh`                                 | Dev container entry (compose)                                              |
| `claude-code-wrapper.sh`                                           | Sandboxed agent CLI execution (repo root)                                  |
| `railway.json`                                                     | Railway web service config (Dockerfile + start command)                    |
| `railway.worker.json`                                              | Railway worker service config                                              |
| `src/web/scripts/railway-web.sh`                                   | Railway web start (wait for Postgres, migrate, serve)                      |
| `src/worker/scripts/railway-worker.sh`                             | Railway worker start                                                       |

### Running the Worker in Docker

```bash
# Dev (source bind-mounted, worker runs inside app container)
docker compose -f docker/docker-compose.yml up -d
docker compose -f docker/docker-compose.yml exec app pnpm worker

# Agent authentication (once, persisted in volume)
docker compose -f docker/docker-compose.yml exec app claude
```

## API Authentication

All API routes require authentication:

1. **NextAuth session** - For web UI users
2. **API key** - `X-API-Key` header for external clients

```typescript
import { withAuth } from '@/lib/auth/middleware';

export async function POST(request: NextRequest) {
  const authResult = await withAuth(request);
  if (!authResult.success) {
    return authResult.response!;
  }
  // Proceed with authenticated request
}
```

## Ralph API Endpoints (Primary)

| Endpoint                            | Method | Purpose                                     |
| ----------------------------------- | ------ | ------------------------------------------- |
| `/api/ralph/tasks`                  | GET    | List tasks with enriched data               |
| `/api/ralph/tasks/:id`              | GET    | Full task detail with workspace info        |
| `/api/ralph/tasks/:id`              | PATCH  | Update task fields                          |
| `/api/ralph/tasks/:id`              | DELETE | Delete a task                               |
| `/api/ralph/tasks/:id/transition`   | POST   | Transition task to a new stage              |
| `/api/ralph/tasks/:id/run-stage`    | POST   | Start a stage run (creates job in database) |
| `/api/ralph/tasks/:id/stage-answer` | POST   | Answer pending stage questions              |
| `/api/ralph/tasks/:id/artifact`     | GET    | Get task artifacts                          |

## V2 API Endpoints (Backward-Compatible Adapter)

These routes are thin adapters over Ralph tasks with V2-style status names.

| Endpoint            | Method | Purpose                                              |
| ------------------- | ------ | ---------------------------------------------------- |
| `/api/v2/tasks`     | GET    | List tasks (optional `?status=` filter)              |
| `/api/v2/tasks`     | POST   | Create a task                                        |
| `/api/v2/tasks/:id` | GET    | Read a single task                                   |
| `/api/v2/tasks/:id` | PATCH  | Update task; auto-creates job on status → `"coding"` |
| `/api/v2/jobs`      | GET    | List jobs (optional `?task_id=` filter)              |

### Creating and Running a Task

```bash
# Create (V2 adapter)
curl -X POST /api/v2/tasks \
  -d '{"title": "Add validation", "description": "...", "repo_url": "https://..."}'

# Trigger execution (auto-creates job)
curl -X PATCH /api/v2/tasks/{id} \
  -d '{"status": "coding", "execution_mode": "edit"}'
```

## Environment Variables

| Variable                           | Required | Description                                                     |
| ---------------------------------- | -------- | --------------------------------------------------------------- |
| `NEXTAUTH_SECRET`                  | Yes      | Session encryption key                                          |
| `NEXTAUTH_URL`                     | Yes      | App URL for auth callbacks                                      |
| `DATABASE_URL`                     | No       | PostgreSQL connection string (Prisma). Omit for SQLite fallback |
| `INITIAL_SIGNUP_TOKEN`             | No       | First-user signup token (recommended for production)            |
| `OMNIDEV_SKIP_DATA_VOLUME_SYMLINK` | No       | Skip `/app/workspaces` symlink in container                     |
| `OMNIDEV_SKIP_LEGACY_QUEUE_DIRS`   | No       | Skip creating legacy queue directories                          |
| `OMNIDEV_RUN_WORKER`               | No       | Force worker role in single-image deploy                        |
| `GITLAB_URL`                       | No       | GitLab instance URL                                             |
| `GITLAB_TOKEN`                     | No       | GitLab personal access token                                    |
| `GITHUB_TOKEN`                     | No       | GitHub personal access token                                    |
| `API_RATE_LIMIT`                   | No       | Requests per hour (default: 100)                                |
| `ALLOWED_IPS`                      | No       | IP whitelist (\* for all)                                       |

For the complete environment variable reference, see `docs/ENVIRONMENT.md`.

## Deployment Model

Omnidev is **deploy-anywhere**. Cloud and local are equally supported:

- Railway (two-service: web + worker with shared PostgreSQL) — see `docs/RAILWAY.md`
- Docker Compose (single host, with optional separate worker) — see `docs/DOCKER.md`
- Cloud infrastructure (Docker, Kubernetes, VPS)
- Local development machines (SQLite fallback, no external database needed)
- Private servers / on-premise

No feature may require a hosted Omnidev service. No feature may assume local-only execution. No SaaS lock-in. No managed service dependency. The user owns the deployment, the data, and the agent authentication.

## Extensibility & Control

Users may:

- Shell into the container
- Attach MCPs to the agent CLI
- Swap the agent implementation
- Wire external systems (e.g., n8n)
- Run multiple worker instances

Omnidev must not obscure or restrict this control. Power-user access is a feature, not a liability.

## Documentation Principles

| Rule                           | Rationale                                           |
| ------------------------------ | --------------------------------------------------- |
| No first-person pronouns       | Avoid "I", "we", "our" in all documentation         |
| Agent CLI is a dependency      | Not a partnership; users authenticate it themselves |
| Curious tone, not promotional  | Documentation explains; marketing sells             |
| Acknowledge opinionated design | State limitations clearly                           |

### Acceptable Phrasing

- "Workflow system that makes agents reliable"
- "The agent is replaceable, the pipeline is the product"
- "Task → agent → PR system"
- "Self-hostable developer automation"
- "Deploy-anywhere workflow pipeline"
- "Modular workflows, swappable agents"

### Avoid

- "AI platform" or "Agent framework"
- "Powered by Claude" or "Built on Claude"
- "Multi-bot system" or "Multi-tenant"
- "Hosted AI service"
- Any phrasing suggesting resale or access provision

## Nested CLAUDE.md Files

| File                               | Purpose                           |
| ---------------------------------- | --------------------------------- |
| `docs/CLAUDE.md`                   | Documentation writing standards   |
| `src/CLAUDE.md`                    | Source code overview and patterns |
| `src/shared/src/lib/CLAUDE.md`     | Library modules detail            |
| `src/web/src/components/CLAUDE.md` | UI component patterns             |
| `src/web/src/app/api/CLAUDE.md`    | API route patterns                |
| `src/web/src/app/docs/CLAUDE.md`   | Documentation rendering system    |

## Contributor Expectations

Contributions must:

- Maintain the 3-layer separation (API / Database / Worker)
- Keep agents swappable via the `AgentRunner` interface
- Never couple pipeline logic to a specific AI tool
- Preserve single-user, deploy-anywhere assumptions
- Keep workflows modular — defaults are overrideable, not hardcoded
- Ensure jobs never get stuck (heartbeat, cleanup, retry)
- Maintain deploy-anywhere compatibility

Any contribution that:

- Embeds agent-specific logic in the pipeline
- Adds external service dependencies to core flow
- Assumes multi-tenancy or hosted execution
- Hardcodes a single workflow that cannot be overridden
- Breaks the deterministic pipeline around the agent step

...must be treated as architecturally invalid unless explicitly approved.

## Design North Star

When in doubt, prefer:

- **determinism** over cleverness — the pipeline must be predictable
- **separation** over convenience — API, state, worker, agent are distinct
- **reliability** over features — a stuck job is worse than a missing feature
- **simplicity** over abstraction — three layers, one interface, one database
- **deploy-anywhere** over deploy-somewhere — works on a laptop, works in the cloud

## What NOT to Build

- Custom LLM tool loops (use existing agent CLIs)
- Multi-agent orchestration systems
- Agent framework abstractions beyond `AgentRunner`
- Cloud-hosted SaaS features
- Multi-tenant auth or billing

Focus: **task → job → repo change → branch pushed**

## Success Criteria

The system works when:

1. A user creates a task with a repo URL and description
2. Moving the task to `"coding"` triggers a job
3. The worker automatically clones, branches, runs the agent, commits, and pushes
4. The task ends in `"review"`
5. A branch exists remotely with the changes

## Common Tasks

### Adding a New API Route

1. Create `src/web/src/app/api/[route]/route.ts`
2. Add Zod schema in `src/shared/src/lib/api/route-validation.ts`
3. Use `withAuth()` for authentication
4. Return `NextResponse.json()` with consistent error format

### Adding a New Library Module

1. Create directory under `src/shared/src/lib/`
2. Add `types.ts` for type definitions
3. Add `index.ts` barrel export
4. Use `'use server'` if server-only

### Adding a New Dashboard Component

1. Create component in `src/web/src/components/dashboard/`
2. Add `'use client'` directive
3. Use HeroUI components as base
4. Export via `src/web/src/components/dashboard/index.ts`

### Adding a New Agent Implementation

1. Create a class implementing `AgentRunner` in `src/shared/src/lib/agent/` (see existing `AgentRunner` wiring)
2. Add a factory or config switch in `src/worker/src/index.ts`
3. No changes to job-executor, API, or database required
