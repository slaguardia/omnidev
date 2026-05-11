# Worker image

Production image definition: **`Dockerfile`** in this directory (build from repository root).

- **`src/web/Dockerfile`** — Next.js standalone (`node server.js`).
- **`src/worker/Dockerfile`** (this package) — job worker (`node worker.cjs`), Cursor SDK, `create-task`, Ralph CLI, sandbox scripts.
- **`docker-entrypoint.sh`** here — production entrypoint; shared behavior in **`src/shared/docker/docker-entrypoint-common.sh`** (same as web).

Docker Compose production maps **`app`** → web Dockerfile and **`worker`** → worker Dockerfile (`docker/docker-compose.prod.yml`).

Railway: use **`railway.json`** for the web service and **`railway.worker.json`** for the worker service (set “Config as code” path per service), or set **Dockerfile path** in the service settings to `src/worker/Dockerfile`.
