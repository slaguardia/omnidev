# Omnidev

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub](https://img.shields.io/github/stars/slaguardia/omnidev?style=social)](https://github.com/slaguardia/omnidev)

A single developer bot orchestration runtime that spans many workspaces, adapts to user-defined workflows, runs anywhere, and uses the [Cursor SDK](https://cursor.com/docs/sdk/typescript) for agent intelligence.

## What is Omnidev?

Omnidev is a **developer automation platform** and **workflow orchestration runtime**. It provides a web UI for managing Git workspaces and runs a streaming agent (via the Cursor SDK) for AI-powered code analysis and editing — all execution stays on your hardware; only model inference round-trips to Cursor's cloud.

| Attribute       | Description                                                    |
| --------------- | -------------------------------------------------------------- |
| Category        | Developer automation platform / workflow orchestration runtime |
| Bot Model       | One bot identity spanning many workspaces                      |
| Execution Scope | Workspace-scoped behavior, not bot-scoped                      |
| AI Integration  | Bring your own Cursor plan via the Cursor SDK                  |
| Deployment      | Cloud, VPS, or local — runs anywhere                           |

### What Omnidev is NOT

- Not a SaaS AI product
- Not a multi-bot system
- Not an AI model provider
- Not a Cursor replacement

## Cursor SDK Dependency

Omnidev depends on the [`@cursor/sdk`](https://www.npmjs.com/package/@cursor/sdk) package and a valid Cursor API key. Users bring their own Cursor plan; Cursor models (`composer-2` and others) run remotely while tool execution (file edits, git ops, shell) happens locally in the worker. See [docs/CURSOR.md](docs/CURSOR.md) for auth + operational details.

### Responsibility Boundaries

| Omnidev Handles                | Cursor SDK Handles                 |
| ------------------------------ | ---------------------------------- |
| Workflow orchestration         | Model inference + tool dispatch    |
| Event handling (GitHub/GitLab) | Decision making within a run       |
| Workspace scoping              | Conversation + tool-call streaming |
| Permission boundaries          |                                    |
| Git lifecycle (clone/push/PR)  |                                    |
| Integration lifecycle          |                                    |

Local execution of git ops, push, and file edits means your credentials and source filesystem never leave your worker.

## Features

- **Repository Management** — Clone and manage GitHub/GitLab repositories in isolated workspaces
- **Streaming Agent** — Cursor SDK runs the agent loop with real-time tool-call events surfaced in the dashboard
- **Natural Language Queries** — Ask questions about codebases in plain English
- **Workspace Isolation** — Secure per-job temp workspaces with concurrency-safe scheduling
- **Branch Automation** — Automatic branch creation for edits with PR/MR support
- **Deploy Anywhere** — One-line VPS install (see [docs/INSTALL.md](docs/INSTALL.md)), Railway, Docker, or local

## Quick Start

### Prerequisites

- Node.js 18.0.0 or higher
- pnpm
- Git
- A Cursor API key (generate at <https://cursor.com/dashboard> — see [docs/CURSOR.md](docs/CURSOR.md))
- Docker (optional, for containerized deployment)

For a fully managed VPS install, skip the local setup and use the [one-line installer](docs/INSTALL.md).

### Installation

1. Clone the repository:

```bash
git clone https://github.com/slaguardia/omnidev.git
cd omnidev
```

2. Install dependencies:

```bash
pnpm install
```

3. Start the application:

```bash
pnpm dev
```

4. Open `http://localhost:3000` and configure through the Settings tab.

## Configuration

### UI-Based Configuration (Recommended)

All configuration is managed through the web interface in the Settings tab:

**Required:**

- GitLab token and/or GitHub token for repository access (as needed for your remotes)
- `CURSOR_API_KEY` set in the environment (see [docs/CURSOR.md](docs/CURSOR.md))

**Optional:**

- GitLab URL (default: `https://gitlab.com`)
- Workspace limits and logging level

### Environment Variables

For environment-based configuration, copy the example file:

```bash
cp .env.example .env
```

Required variables:

```env
NEXTAUTH_SECRET=your-nextauth-secret-here
NEXTAUTH_URL=http://localhost:3000
CURSOR_API_KEY=cursor_sk_...
```

Optional variables (also configurable via UI):

```env
GITLAB_TOKEN=your_gitlab_token_here
GITHUB_TOKEN=your_github_token_here
```

See [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) for complete documentation. For TLS, reverse-proxy trust, IP allowlisting, and a production checklist, see [docs/SECURE_DEPLOYMENT.md](docs/SECURE_DEPLOYMENT.md).

### Ralph CLI

Manage tasks from the terminal (`pnpm ralph tasks list`, `pnpm ralph tasks show RLP-42`, …). Set **`OMNIDEV_URL`** and **`OMNIDEV_API_KEY`** in `.env` or `.env.local` at the repo root; the CLI loads them automatically and finds the repo when run from a subdirectory. For remote instances, HTTPS, agent tokens, and troubleshooting, see **[docs/RALPH_CLI.md](docs/RALPH_CLI.md)**.

## Docker Deployment

Omnidev is designed to run anywhere — cloud infrastructure, VPS, or local environments.

Docker Compose files live under **`docker/`**. Running `docker compose -f docker/docker-compose.yml up` from the repo root automatically loads `docker/docker-compose.override.yml` (dev) when no other files are specified.

### Development (Default)

```bash
# First time, or after changing dependencies / src/web/Dockerfile.dev:
docker compose -f docker/docker-compose.yml up --build --remove-orphans

# Subsequent runs (reuses cached image, fast startup):
docker compose -f docker/docker-compose.yml up
```

Source code is bind-mounted into the container. Next.js Turbopack watches for file changes automatically — no restart needed for code edits.

- **Client components** (`'use client'`): True hot module replacement — browser updates instantly.
- **Server files** (API routes, `src/shared/src/lib/`, server components): Recompiled on the next request. Save the file, hit the endpoint or reload the page, and the change is picked up.

`docker compose watch` is not needed. It exists for setups where source is copied into the image; the dev bind mount makes it redundant.

**When to restart vs rebuild:**

| Change                           | Action                                                             |
| -------------------------------- | ------------------------------------------------------------------ |
| Edit `.ts`, `.tsx`, `.css` files | Nothing — auto-reload on next request                              |
| Edit `next.config.*` or `.env`   | Restart: `docker compose -f docker/docker-compose.yml restart app` |
| Add/remove dependencies          | Rebuild: `docker compose -f docker/docker-compose.yml up --build`  |
| Change `src/web/Dockerfile.dev`  | Rebuild: `docker compose -f docker/docker-compose.yml up --build`  |

### Production

```bash
docker compose -f docker/docker-compose.yml -f docker/docker-compose.prod.yml up -d --build
```

Includes authentication, dashboard, health checks, and all features. **Compose** builds **`src/web/Dockerfile`** for the app and **`src/worker/Dockerfile`** for the worker service.

### Showcase (Read-Only Demo)

```bash
docker compose -f docker/docker-compose.yml -f docker/docker-compose.showcase.yml up --build
```

Read-only demo mode with no auth and no dashboard. For publishing a public-facing demo.

### Docker Features

- Ubuntu-based images with native build deps for `@cursor/sdk` + `better-sqlite3`
- Multi-stage build for optimized production image
- Runs as non-root user for security
- Workspace data persistence via volumes
- Built-in health checks (production/showcase)

See [docs/DOCKER.md](docs/DOCKER.md) for detailed Docker documentation. For **Railway** (CLI + `railway.json`), see [docs/RAILWAY.md](docs/RAILWAY.md).

## Architecture

### Core Components

| Component          | Purpose                                                     |
| ------------------ | ----------------------------------------------------------- |
| Workspace Manager  | CRUD for git workspaces                                     |
| Repository Manager | Git clone/branch operations                                 |
| AgentRunner        | Streaming agent execution (`CursorSdkAgent` is the default) |
| Worker             | In-process N-slot scheduler that runs concurrent agent jobs |
| Job Queue          | Database-backed job claim (Postgres or SQLite) + heartbeat  |
| GitHub/GitLab API  | PR/MR creation, repository operations                       |

### Type System

The project uses branded types for type safety:

```typescript
type WorkspaceId = string & { readonly brand: unique symbol };
type GitUrl = string & { readonly brand: unique symbol };
type FilePath = string & { readonly brand: unique symbol };
```

Operations that can fail return `Result<T, E>`:

```typescript
type Result<T, E = Error> = { success: true; data: T } | { success: false; error: E };
```

## Extensibility

Users may:

- Shell into the container
- Attach MCPs
- Extend execution capabilities
- Wire external systems (e.g., n8n)

Omnidev does not obscure or restrict this control. Power-user access is a feature.

## Testing

```bash
pnpm test           # Run all tests
pnpm test:watch     # Watch mode
pnpm test:coverage  # With coverage report
```

## Security

- Per-job workspace isolation (clones live in scoped temp dirs, cleaned in `finally`)
- Local-only execution of git ops + tool calls (credentials never leave the worker)
- URL validation for repository cloning
- Configurable workspace size limits
- Token-based access control
- Path traversal protection

## Contributing

This repository is currently **read-only**. Issues and pull requests are not open at this time.

The project is in active development. Contribution guidelines will be published when the project is ready to accept external contributions.

### Architectural Constraints (For Future Contributors)

When contributions open, they must:

- Preserve single-bot assumptions
- Avoid adding opinionated workflow coupling
- Keep the agent (`@cursor/sdk` today) a swappable `AgentRunner` dependency — never fork it
- Maintain deploy-anywhere compatibility

Any contribution that introduces bot multiplicity, hardcodes workflows, or assumes hosted execution will be treated as architecturally invalid unless explicitly approved.

### Development Guidelines (For Future Contributors)

- Follow TypeScript strict mode
- Write comprehensive tests
- Use conventional commits
- Update documentation
- Return `Result<T, E>` for fallible operations

## Design Philosophy

When in doubt, prefer:

- **Control** over convenience
- **Composability** over magic
- **Transparency** over abstraction
- **Infrastructure patterns** over product gimmicks

**Guiding rule:** Omnidev adapts to developer workflows, not the other way around.

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Cursor SDK](https://cursor.com/docs/sdk/typescript) — agent backend (bring your own Cursor plan)
- [GitLab](https://gitlab.com) / [GitHub](https://github.com) — Repository hosting
- [Next.js](https://nextjs.org) — Application framework
- [HeroUI](https://heroui.com) — UI components
- [simple-git](https://github.com/steveukx/git-js) — Git operations

---

Omnidev is an orchestration layer. The Cursor SDK provides the intelligence. Users bring their own Cursor plan.
