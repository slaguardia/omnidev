# Omnidev

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub](https://img.shields.io/github/stars/slaguardia/omnidev?style=social)](https://github.com/slaguardia/omnidev)

A single developer bot orchestration runtime that spans many workspaces, adapts to user-defined workflows, runs anywhere, and uses the user's own Claude Code subscription for intelligence and execution.

## What is Omnidev?

Omnidev is a **developer automation platform** and **workflow orchestration runtime**. It provides a web UI for managing Git workspaces and integrating with Claude Code CLI for AI-powered code analysis and editing.

| Attribute       | Description                                                    |
| --------------- | -------------------------------------------------------------- |
| Category        | Developer automation platform / workflow orchestration runtime |
| Bot Model       | One bot identity spanning many workspaces                      |
| Execution Scope | Workspace-scoped behavior, not bot-scoped                      |
| AI Integration  | Bring your own Claude Code subscription                        |
| Deployment      | Cloud, VPS, or local — runs anywhere                           |

### What Omnidev is NOT

- Not a SaaS AI product
- Not a multi-bot system
- Not an AI model provider
- Not a Claude Code replacement

## Claude Code Dependency

Omnidev installs and orchestrates the publicly available Claude Code package. Users must have their own Claude account and active subscription. Claude Code is a product of Anthropic PBC and is not affiliated with this project.

### Responsibility Boundaries

| Omnidev Handles                | Claude Code Handles    |
| ------------------------------ | ---------------------- |
| Workflow orchestration         | Code understanding     |
| Event handling (GitHub/GitLab) | Command execution      |
| Workspace scoping              | Research and reasoning |
| Permission boundaries          | Repo-level operations  |
| Integration lifecycle          |                        |

## Features

- **Repository Management** — Clone and manage GitHub/GitLab repositories in isolated workspaces
- **AI-Powered Analysis** — Integrate with Claude Code for intelligent code review and suggestions
- **Natural Language Queries** — Ask questions about codebases in plain English
- **Workspace Isolation** — Secure temporary workspace management
- **Branch Automation** — Automatic branch creation for edits with PR/MR support
- **Deploy Anywhere** — Cloud, VPS, or local Docker deployment

## Quick Start

### Prerequisites

- Node.js 18.0.0 or higher
- pnpm
- Git
- Claude Code CLI (users must have their own Claude subscription)
- Docker (optional, for containerized deployment)

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

- GitLab Token or GitHub Token
- Claude API Key (your own Anthropic API key)

**Optional:**

- GitLab URL (default: `https://gitlab.com`)
- Workspace limits and logging level

### Environment Variables

For environment-based configuration, copy the example file:

```bash
cp env.example .env
```

Required variables:

```env
NEXTAUTH_SECRET=your-nextauth-secret-here
NEXTAUTH_URL=http://localhost:3000
```

Optional variables (also configurable via UI):

```env
GITLAB_TOKEN=your_gitlab_token_here
GITHUB_TOKEN=your_github_token_here
```

See [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) for complete documentation.

### Ralph CLI

Manage tasks from the terminal (`pnpm ralph tasks list`, `pnpm ralph tasks show RLP-42`, …). Set **`OMNIDEV_URL`** and **`OMNIDEV_API_KEY`** in `.env` or `.env.local` at the repo root; the CLI loads them automatically and finds the repo when run from a subdirectory. For remote instances, HTTPS, agent tokens, and troubleshooting, see **[docs/RALPH_CLI.md](docs/RALPH_CLI.md)**.

## Docker Deployment

Omnidev is designed to run anywhere — cloud infrastructure, VPS, or local environments.

Docker Compose uses override files for different environments. Running `docker compose up` automatically loads `docker-compose.yml` (base) + `docker-compose.override.yml` (dev).

### Development (Default)

```bash
# First time, or after changing dependencies / Dockerfile.dev:
docker compose up --build --remove-orphans

# Subsequent runs (reuses cached image, fast startup):
docker compose up
```

Source code is bind-mounted into the container. Next.js Turbopack watches for file changes automatically — no restart needed for code edits.

- **Client components** (`'use client'`): True hot module replacement — browser updates instantly.
- **Server files** (API routes, `src/lib/`, server components): Recompiled on the next request. Save the file, hit the endpoint or reload the page, and the change is picked up.

`docker compose watch` is not needed. It exists for setups where source is copied into the image; the dev bind mount makes it redundant.

**When to restart vs rebuild:**

| Change                           | Action                                |
| -------------------------------- | ------------------------------------- |
| Edit `.ts`, `.tsx`, `.css` files | Nothing — auto-reload on next request |
| Edit `next.config.*` or `.env`   | Restart: `docker compose restart`     |
| Add/remove dependencies          | Rebuild: `docker compose up --build`  |
| Change `Dockerfile.dev`          | Rebuild: `docker compose up --build`  |

### Production

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Includes authentication, dashboard, health checks, and all features. Uses the production `Dockerfile` with multi-stage build.

### Showcase (Read-Only Demo)

```bash
docker compose -f docker-compose.yml -f docker-compose.showcase.yml up --build
```

Read-only demo mode with no auth and no dashboard. For publishing a public-facing demo.

### Docker Features

- Ubuntu-based for full Claude Code compatibility
- Multi-stage build for optimized production image
- Runs as non-root user for security
- Workspace data persistence via volumes
- Built-in health checks (production/showcase)

See [docs/DOCKER.md](docs/DOCKER.md) for detailed Docker documentation.

## Architecture

### Core Components

| Component                | Purpose                               |
| ------------------------ | ------------------------------------- |
| Workspace Manager        | CRUD for git workspaces               |
| Repository Manager       | Git clone/branch operations           |
| Claude Code Orchestrator | Execute Claude Code CLI               |
| Job Queue                | Async job execution                   |
| GitHub/GitLab API        | PR/MR creation, repository operations |

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

- Sandbox isolation for Claude Code execution
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
- Keep Claude Code as a dependency, not a fork
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

- [Claude Code](https://claude.ai/code) — AI execution backend (bring your own subscription)
- [GitLab](https://gitlab.com) / [GitHub](https://github.com) — Repository hosting
- [Next.js](https://nextjs.org) — Application framework
- [HeroUI](https://heroui.com) — UI components
- [simple-git](https://github.com/steveukx/git-js) — Git operations

---

Omnidev is an orchestration layer. Claude Code provides the intelligence. Users bring their own AI subscription.
