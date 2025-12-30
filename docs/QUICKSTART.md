# Quick Start Guide

Get up and running with CodeSpider in minutes.

## Prerequisites

- Node.js 18+
- pnpm package manager
- Docker (for production deployment)

## Installation

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Configure Environment

```bash
cp env.example .env
```

Edit `.env` with your credentials. See [Environment Setup](/docs/environment) for detailed configuration options.

### 3. Start Development Server

```bash
pnpm dev
```

The application will be available at `http://localhost:3000`.

### 4. Build for Production

```bash
pnpm build
```

### 5. Run Tests

```bash
pnpm test
```

## Docker Deployment

For production deployment with Docker:

```bash
docker compose up --build
```

See [Docker Setup](/docs/docker) for detailed Docker configuration.

## Git Provider Support

The application supports both GitLab and GitHub repositories:

- **GitLab**: Creates Merge Requests after Claude Code edits
- **GitHub**: Creates Pull Requests after Claude Code edits

The provider is auto-detected from the repository URL. See [Credentials Management](/docs/credentials) for token setup.

## Next Steps

- [Environment Setup](/docs/environment) - Configure environment variables
- [Docker Setup](/docs/docker) - Deploy with Docker
- [API Operations](/docs/api-operations) - Use the API
- [Credentials Management](/docs/credentials) - Manage tokens and keys
- [MR/PR Automation](/docs/merge-request-automation) - Automated merge/pull request creation
