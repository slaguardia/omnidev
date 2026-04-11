# Docker layout

Compose files live here. **Entrypoints** live next to each package: `src/web/docker-entrypoint.sh`, `src/worker/docker-entrypoint.sh` (production), `src/web/docker-entrypoint-dev.sh` (dev), with shared logic in **`src/shared/docker/docker-entrypoint-common.sh`**. **Production:** **`src/web/Dockerfile`** (Next.js) and **`src/worker/Dockerfile`** (job worker). **Dev:** **`src/web/Dockerfile.dev`** for both `app` and `worker` services (bind-mounted monorepo).

The **build context is always the repository root**; paths like `COPY src/web/...` and `COPY docker/...` are expressed from that context.

- **Run from repo root**, e.g. `docker compose -f docker/docker-compose.yml up`, or use **`pnpm docker:*`** scripts in the root `package.json`.
- **Compose project name** is pinned to `workflow` in `docker-compose.yml` so volume/network names stay stable.
- Worker image details: [src/worker/DOCKER.md](../src/worker/DOCKER.md).
- Full usage: [docs/DOCKER.md](../docs/DOCKER.md).
