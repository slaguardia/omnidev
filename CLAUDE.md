# OmniDev — Developer Bot Orchestration Runtime

## Project Identity

**OmniDev** is a single developer bot orchestration runtime that spans many workspaces, adapts to user-defined workflows, runs anywhere, and uses the user's own Claude Code subscription for intelligence and execution.

### What OmniDev Is

| Category        | Classification                                                 |
| --------------- | -------------------------------------------------------------- |
| Type            | Developer automation platform / workflow orchestration runtime |
| Architecture    | One bot identity spanning many workspaces                      |
| Execution Model | Workspace-scoped behavior, not bot-scoped                      |
| AI Integration  | Bring your own Claude Code subscription                        |

### What OmniDev Is NOT

- Not a SaaS AI product
- Not a multi-bot system
- Not an AI model provider
- Not a Claude Code replacement or reimplementation

### Bot Model (Critical Constraint)

OmniDev operates **one bot identity** that spans many workspaces (repos, teams, orgs). There must be no assumption of:

- one bot per repo
- one bot per team
- multiple concurrent bot personalities

**Mental model:** One omnipresent developer agent with many execution contexts.

## Project Overview

A Next.js 15 web application that provides a web UI for managing Git workspaces and integrating with Claude Code CLI for AI-powered code analysis. Users can clone repositories from GitHub or GitLab, ask questions about code, and request AI-assisted edits with automatic branch creation and pull/merge request support.

## Technology Stack

| Category        | Technology                              | Version |
| --------------- | --------------------------------------- | ------- |
| Framework       | Next.js (App Router, standalone output) | 15.x    |
| Language        | TypeScript (strict mode)                | 5.x     |
| UI Library      | HeroUI (formerly NextUI)                | 2.x     |
| Styling         | Tailwind CSS                            | 3.x     |
| Authentication  | NextAuth.js with 2FA (TOTP)             | 4.x     |
| Git Operations  | simple-git                              | 3.x     |
| GitLab API      | @gitbeaker/rest                         | 39.x    |
| GitHub API      | @octokit/rest                           | 22.x    |
| Validation      | Zod                                     | 3.x     |
| Testing         | Vitest                                  | 2.x     |
| Package Manager | pnpm                                    | -       |
| Runtime         | Node.js                                 | 18+     |

## Directory Structure

```
workflow/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/                # API route handlers
│   │   ├── dashboard/          # Dashboard pages
│   │   ├── docs/               # Documentation pages
│   │   ├── signin/             # Authentication pages
│   │   └── layout.tsx          # Root layout
│   ├── components/             # React components
│   │   ├── dashboard/          # Dashboard-specific components
│   │   └── docs/               # Documentation components
│   ├── hooks/                  # Custom React hooks
│   └── lib/                    # Core business logic
│       ├── api/                # API utilities and validation
│       ├── auth/               # Authentication logic
│       ├── claudeCode/         # Claude Code CLI integration
│       ├── config/             # Configuration management
│       ├── git/                # Git operations (simple-git)
│       ├── github/             # GitHub API integration
│       ├── gitlab/             # GitLab API integration
│       ├── managers/           # Resource managers
│       ├── queue/              # Job queue system
│       ├── types/              # TypeScript type definitions
│       └── workspace/          # Workspace management
├── docs/                       # Markdown docs (served at /docs)
├── scripts/                    # Shell scripts
├── data/                       # Runtime data (jobs, history)
└── workspaces/                 # Cloned repositories (Docker volume)
```

## Key Commands

```bash
# Development
pnpm dev                  # Start dev server with Turbopack
pnpm build                # Production build (standalone output)
pnpm start                # Start production server

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

## Architecture Overview

### Request Flow

1. **Web UI** → User interacts with dashboard
2. **API Route** → `/api/ask` or `/api/edit` receives request
3. **Authentication** → `withAuth()` validates session or API key
4. **Validation** → Zod schema validates request body
5. **Job Queue** → `executeOrQueue()` handles execution
6. **Claude Code** → CLI executes in sandboxed environment
7. **Response** → Results returned (immediate or polled via job ID)

### Core Subsystems

| Subsystem                | Location                             | Purpose                     |
| ------------------------ | ------------------------------------ | --------------------------- |
| Workspace Manager        | `lib/managers/workspace-manager.ts`  | CRUD for git workspaces     |
| Repository Manager       | `lib/managers/repository-manager.ts` | Git clone/branch operations |
| Claude Code Orchestrator | `lib/claudeCode/orchestrator.ts`     | Execute Claude Code CLI     |
| Job Queue                | `lib/queue/`                         | Async job execution         |
| Git Operations           | `lib/git/`                           | simple-git wrapper          |
| GitHub Integration       | `lib/github/`                        | PR creation, repository API |
| GitLab Integration       | `lib/gitlab/`                        | MR creation, project API    |

### Data Storage

| Data              | Location                           | Format             |
| ----------------- | ---------------------------------- | ------------------ |
| Workspace index   | `workspaces/.workspace-index.json` | JSON array         |
| Job data          | `data/jobs/`                       | JSON files per job |
| Execution history | `data/execution-history.json`      | JSON array         |
| App config        | `workspaces/app-config.json`       | JSON object        |

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
console.log(`[WORKSPACE MANAGER] Loading workspace: ${id}`);
console.error(`[ASK API] Failed to execute:`, error);
```

## Docker & Sandboxing

The application runs in Docker with Claude Code sandboxed for security.

### Security Measures

| Measure             | Implementation                                                               |
| ------------------- | ---------------------------------------------------------------------------- |
| Git blocking        | Real git at `/opt/internal/bin/git`, wrapper at `/usr/bin/git` blocks access |
| PATH restriction    | Wrapper sets `PATH="/usr/local/bin:/bin:/usr/bin"`                           |
| Non-root user       | App runs as `nextjs` (uid 1001)                                              |
| Git config disabled | `GIT_CONFIG_GLOBAL=/dev/null`                                                |
| Workspace isolation | Docker volume at `/app/workspaces`                                           |

### Key Docker Files

| File                        | Purpose                                     |
| --------------------------- | ------------------------------------------- |
| `Dockerfile`                | Multi-stage build (deps → builder → runner) |
| `docker-compose.yml`        | Service configuration                       |
| `docker-entrypoint.sh`      | Secret initialization                       |
| `claude-code-wrapper.sh`    | Sandboxed Claude Code execution             |
| `scripts/verify-sandbox.sh` | Sandbox verification script                 |

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

## Environment Variables

| Variable            | Required | Description                      |
| ------------------- | -------- | -------------------------------- |
| `NEXTAUTH_SECRET`   | Yes      | Session encryption key           |
| `NEXTAUTH_URL`      | Yes      | App URL for auth callbacks       |
| `ANTHROPIC_API_KEY` | Yes      | Claude API key                   |
| `GITLAB_URL`        | No       | GitLab instance URL              |
| `GITLAB_TOKEN`      | No       | GitLab personal access token     |
| `GITHUB_TOKEN`      | No       | GitHub personal access token     |
| `API_RATE_LIMIT`    | No       | Requests per hour (default: 100) |
| `ALLOWED_IPS`       | No       | IP whitelist (\* for all)        |

## Relationship to Claude Code

OmniDev uses Claude Code as an execution and reasoning engine. OmniDev does not replace, reimplement, or resell Claude Code. Users must bring their own Claude Code subscription.

### Responsibility Boundaries

| Responsible Entity | Responsibilities                                                                                                                                                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OmniDev**        | Workflow orchestration, event handling (GitHub, GitLab, CI, n8n, manual triggers), workspace scoping and configuration, permission boundaries and execution context, integration lifecycle, infrastructure/runtime concerns |
| **Claude Code**    | Code understanding, command execution, research and reasoning, repo-level operations                                                                                                                                        |

### Claude Code Treatment

Claude Code is treated as:

- A dependency
- An execution backend
- An interchangeable engine (in principle)

AI agents interacting with this project must:

- Never describe OmniDev as "Claude Code itself"
- Never assume OmniDev owns or provides AI intelligence
- Clearly separate orchestration logic from AI execution

## Workflow Philosophy

OmniDev is **workflow-agnostic**. Users define:

- what triggers work
- what work runs
- what happens to outputs

No single "correct" workflow is enforced. Opinionated defaults are allowed, but must be overrideable.

**Guiding rule:** OmniDev adapts to developer workflows, not the other way around.

## Deployment Model

OmniDev is **cloud-first but not cloud-required**. Must be deployable to:

- cloud infrastructure
- VPS
- local environments

No feature may require a hosted OmniDev service. Domain usage (e.g., `.cloud`) must never imply:

- hosted-only
- SaaS lock-in
- managed service dependency

## Extensibility & Control

Users may:

- shell into the container
- attach MCPs
- extend execution capabilities
- wire external systems (e.g., n8n)

OmniDev must not obscure or restrict this control. Power-user access is a feature, not a liability.

## Documentation Principles

This project follows strict documentation guidelines. Key rules:

| Rule                           | Rationale                                              |
| ------------------------------ | ------------------------------------------------------ |
| No first-person pronouns       | Avoid "I", "we", "our" in all documentation            |
| Claude Code is a dependency    | Not a partnership; users need their own Claude account |
| Curious tone, not promotional  | Documentation explains; marketing sells                |
| Answer five questions          | What, why, who, how, and non-goals                     |
| Acknowledge opinionated design | State limitations clearly                              |

### Required Disclosure

Public-facing documentation must include the Claude Code dependency disclosure. See `docs/CLAUDE.md` for the required text and branding guidelines.

### Acceptable Phrasing

- "Single developer bot orchestration runtime"
- "One bot, many workspaces"
- "Workspace-scoped behavior"
- "Orchestration layer / automation runtime"
- "Bring your own AI"
- "Orchestrates Claude Code for automated code analysis"

### Avoid

- "Multi-bot system"
- "Agent framework"
- "AI platform"
- "Hosted AI service"
- "Claude replacement"
- "Powered by Claude" or "Built on Claude" (implies partnership)
- Any phrasing suggesting resale or access provision

## Nested CLAUDE.md Files

More detailed guidance in subdirectories:

| File                       | Purpose                           |
| -------------------------- | --------------------------------- |
| `docs/CLAUDE.md`           | Documentation writing standards   |
| `src/CLAUDE.md`            | Source code overview and patterns |
| `src/lib/CLAUDE.md`        | Library modules detail            |
| `src/components/CLAUDE.md` | UI component patterns             |
| `src/app/api/CLAUDE.md`    | API route patterns                |
| `src/app/docs/CLAUDE.md`   | Documentation rendering system    |

## Contributor Expectations

Contributions should:

- Preserve single-bot assumptions
- Avoid adding opinionated workflow coupling
- Keep Claude Code as a dependency, not a fork
- Maintain deploy-anywhere compatibility

Any contribution that:

- introduces bot multiplicity
- hardcodes workflows
- assumes hosted execution

...must be treated as architecturally invalid unless explicitly approved.

## Design North Star

When in doubt, prefer:

- **control** over convenience
- **composability** over magic
- **transparency** over abstraction
- **infrastructure patterns** over product gimmicks

## Common Tasks

### Adding a New API Route

1. Create `src/app/api/[route]/route.ts`
2. Add Zod schema in `src/lib/api/route-validation.ts`
3. Use `withAuth()` for authentication
4. Return `NextResponse.json()` with consistent error format

### Adding a New Library Module

1. Create directory under `src/lib/`
2. Add `types.ts` for type definitions
3. Add `index.ts` barrel export
4. Use `'use server'` if server-only

### Adding a New Dashboard Component

1. Create component in `src/components/dashboard/`
2. Add `'use client'` directive
3. Use HeroUI components as base
4. Export via `src/components/dashboard/index.ts`
