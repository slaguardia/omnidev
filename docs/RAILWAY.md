# Railway Deployment

## Purpose

Deploy Omnidev on [Railway](https://railway.app) using **two Docker images** and two services: **`src/web/Dockerfile`** (Next.js / `node server.js`) and **`src/worker/Dockerfile`** (`node worker.cjs`). They coordinate through **PostgreSQL** (`DATABASE_URL`) — not through HTTP.

- **Web service:** `railway.json` → `dockerfilePath`: `src/web/Dockerfile`, `startCommand`: `sh src/web/scripts/railway-web.sh`.
- **Worker service:** `railway.worker.json` → `dockerfilePath`: `src/worker/Dockerfile`, `startCommand`: `sh src/worker/scripts/railway-worker.sh`. In Railway → **worker service** → **Settings** → **Config as code**, set the file to **`railway.worker.json`** (Railway only auto-loads `railway.json` at the repo root for services that do not override it).

## Claude Code Dependency

Omnidev installs and orchestrates the publicly available Claude Code package. Users must have their own Claude account and active subscription. Claude Code is a product of Anthropic PBC and is not affiliated with this project.

## Prerequisites

- A Railway account and the [Railway CLI](https://docs.railway.com/guides/cli) installed (`railway --version`).
- Git and this repository checked out.
- **PostgreSQL** for the split web + worker model (add the Railway Postgres plugin and reference `DATABASE_URL` on **both** services). SQLite on a shared disk is not available across two containers.

## One-time CLI setup

```bash
# Log in (opens browser)
railway login

# Link this repo to a Railway project (creates/selects project)
railway link

# Optional: open the project dashboard
railway open
```

Linking stores local metadata under `.railway/` (gitignored). Commit **`railway.json`**; do not commit secrets.

## Two config files (web vs worker)

Railway only **auto-loads** `railway.json` at the **repository root** per service unless you set **Service → Settings → Config as code → Path** to another file.

| File                      | Service                        | Dockerfile              | Start command                             |
| ------------------------- | ------------------------------ | ----------------------- | ----------------------------------------- |
| **`railway.json`**        | Web (default auto-link)        | `src/web/Dockerfile`    | `sh src/web/scripts/railway-web.sh`       |
| **`railway.worker.json`** | Worker (set path in dashboard) | `src/worker/Dockerfile` | `sh src/worker/scripts/railway-worker.sh` |

**Health checks:** Configure **`/api/health`** on **web** only; the worker has no HTTP server. The health endpoint includes a `worker` object with the last heartbeat and job counts — use this to verify the worker is alive.

## What `railway.json` does (web service)

| Setting           | Value                                                        |
| ----------------- | ------------------------------------------------------------ |
| **Builder**       | `DOCKERFILE` — builds from `src/web/Dockerfile`.             |
| **Start command** | `sh src/web/scripts/railway-web.sh` — migrate, then Next.js. |

## What `railway.worker.json` does (worker service)

| Setting           | Value                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------- |
| **Builder**       | `DOCKERFILE` — builds from `src/worker/Dockerfile`.                                    |
| **Start command** | `sh src/worker/scripts/railway-worker.sh` — wait for Postgres, then `node worker.cjs`. |

## Start scripts

| Script                                 | Role                                                                                                                                                                                               |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/web/scripts/railway-web.sh`       | Migrate, then Next.js standalone **only**.                                                                                                                                                         |
| `src/worker/scripts/railway-worker.sh` | Wait for DB (`src/worker/scripts/wait-for-postgres.mjs`), then **`exec node worker.cjs`** in the **foreground**. Migrations are owned by **web**; the worker does not run `prisma migrate deploy`. |
| `scripts/deploy.sh`                    | Deploy both services with pre-deploy checks. See [Deploying changes](#deploying-changes-day-to-day).                                                                                               |

## Required environment variables

Set on **each** service (or use [shared variables](https://docs.railway.com/guides/variables#shared-variables) in the project). The startup scripts validate required vars and exit with a clear error if any are missing.

| Variable               | Web | Worker | Notes                                                                                         |
| ---------------------- | --- | ------ | --------------------------------------------------------------------------------------------- |
| `DATABASE_URL`         | Yes | Yes    | **Same** Postgres connection string on **both** services.                                     |
| `NEXTAUTH_SECRET`      | Yes | Yes    | `openssl rand -base64 32`. **Must be the same value on both services** (used for token encryption). |
| `NEXTAUTH_URL`         | Yes | No     | Public `https://…` URL of the **web** service (no trailing slash).                            |
| `INITIAL_SIGNUP_TOKEN` | Yes | No     | Recommended: `openssl rand -hex 32` for first-user signup.                                    |

**Recommended:** Use Railway [shared variables](https://docs.railway.com/guides/variables#shared-variables) for `DATABASE_URL` and `NEXTAUTH_SECRET` so both services stay in sync automatically.

### `DATABASE_URL` on both services (Postgres plugin)

Railway does **not** inject `DATABASE_URL` into app services automatically. After adding a **PostgreSQL** database to the project:

1. Note the **database service name** on the project canvas (e.g. `Postgres` — you can rename it).
2. On **both** the **web** and **worker** service → **Variables** → **New variable**:
   - **Name:** `DATABASE_URL`
   - **Value:** use the **Variable Reference** control (or Raw editor) so the value resolves from the database service, for example:
     - `${{ Postgres.DATABASE_URL }}`
   - Replace `Postgres` with the **exact** canvas name of your Postgres service (spaces and casing matter).

Alternatively: **Project** → **Shared Variables** → define once → attach to both services ([reference syntax](https://docs.railway.com/guides/variables#reference-variables)).

Optional: `GITLAB_TOKEN`, `GITHUB_TOKEN`, `API_RATE_LIMIT`, `ALLOWED_IPS` — see [Environment Setup](./ENVIRONMENT.md) and [Secure Deployment](./SECURE_DEPLOYMENT.md).

Railway injects **`PORT`** on the web service; do not set it manually. The worker does not listen on HTTP.

## Persistent volumes

Without volumes, the container filesystem is **ephemeral**. **`railway.json` cannot declare volumes**; create them in the dashboard, CLI, or API.

**Railway allows one volume per service.** Two services means **two independent volumes** — the same mount path on web and worker is **not** shared data.

| Path                       | Service                                | Purpose                                                                                                                                                                                                                                                                                         |
| -------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`/app/data`**            | **Web**                                | Optional when **`DATABASE_URL`** is set: workflow metadata and discovery registry live in Postgres (`ralph_meta`); the legacy **`/api/ask`** / **`/api/edit`** file queue is off unless **`OMNIDEV_LEGACY_FILE_QUEUE=1`**. Omit this volume if the app can use ephemeral disk only (see below). |
| **`/home/nextjs/.claude`** | **Web** (if chat uses Claude Code CLI) | Claude Code auth — **separate** volume from the worker; duplicate login or copy/bootstrap.                                                                                                                                                                                                      |
| **`/home/nextjs/.claude`** | **Worker**                             | Claude Code auth for job runs (Ralph / coding-agent).                                                                                                                                                                                                                                           |

See `src/shared/docker/docker-entrypoint-common.sh` (sourced from `src/web/docker-entrypoint.sh` / `src/worker/docker-entrypoint.sh`; `HOME=/home/nextjs`) for layout parity with Docker Compose.

### Ephemeral web (no `/app/data` volume)

When **`DATABASE_URL`** is set, durable app metadata uses Postgres; the legacy file job queue defaults **off** (same rules as **`OMNIDEV_LEGACY_FILE_QUEUE`** — unset means disabled with Postgres). You can run **web** without mounting **`/app/data`**.

Entrypoint tuning (set on the **web** service if needed):

| Variable                                 | Effect                                                                                                                                    |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **`OMNIDEV_SKIP_DATA_VOLUME_SYMLINK=1`** | Do not replace **`/app/workspaces`** with a symlink to **`/app/data/workspaces`** — use the image’s ephemeral **`/app/workspaces`** only. |
| **`OMNIDEV_SKIP_LEGACY_QUEUE_DIRS=1`**   | Skip creating **`data/queue`** / **`data/jobs`** under **`/app/data`** (legacy queue is unused when disabled in app code).                |

**Dashboard:** Railway → **Service** → **Volumes** → **Add volume** → mount path as above.

**CLI (worker volume example):** from a directory [linked](https://docs.railway.com/cli#linking) to the **worker** service:

```bash
sh src/worker/scripts/railway-volume-worker.sh
```

Or explicitly:

```bash
railway volume add --mount-path /home/nextjs/.claude --service <worker-service-name>
```

See [`railway volume`](https://docs.railway.com/cli/volume).

Run **one replica** for the **web** service unless architecture explicitly supports multiple web instances. **Worker** replicas may be **scaled horizontally** when using Postgres for jobs.

## Two-service deploy (checklist)

1. Create or use a **Railway project** with **PostgreSQL** (database plugin).
2. **Web service:** connect this GitHub repo; root **`railway.json`** applies; set **`DATABASE_URL`** (reference to Postgres), **`NEXTAUTH_*`**, etc.; add volume **`/app/data`** if needed; optional **`/home/nextjs/.claude`** for chat.
3. **Worker service:** **duplicate** the service or add a second service with the **same repo** (same root `railway.json`). Name it with **`worker`** in the name (e.g. **`omnidev-worker`**) or set **`OMNIDEV_RUN_WORKER=1`**. Set **`DATABASE_URL`** the same way as web. Add volume **`/home/nextjs/.claude`** for agent auth.
4. Deploy **web** first (runs migrations), then deploy **worker**.

### Deploying both services on every push

If **both** services are connected to the **same branch** of the same repository, a **single git push** triggers **two** deployments (one per service). You do not need a special “deploy all” button for that.

From the **CLI**, `railway up` deploys the **currently linked** service. To target another service, use **`railway link`** and choose the service, or use the **`--service`** flag if your CLI version supports it ([deploying with the CLI](https://docs.railway.com/cli/deploying)).

## Deploying changes (day-to-day)

The deploy script runs pre-deploy checks (typecheck + tests), then deploys both services:

```bash
pnpm deploy
```

Options:

| Command                              | Effect                            |
| ------------------------------------ | --------------------------------- |
| `pnpm deploy`                        | Checks + deploy web + worker      |
| `pnpm deploy:web`                    | Deploy web only (no checks)       |
| `pnpm deploy:worker`                 | Deploy worker only (no checks)    |
| `sh scripts/deploy.sh --skip-checks` | Deploy both, skip typecheck/tests |
| `sh scripts/deploy.sh --web-only`    | Checks + web only                 |
| `pnpm pre-deploy`                    | Run checks without deploying      |

Service names default to `web` and `worker`. Override with `RAILWAY_WEB_SERVICE` / `RAILWAY_WORKER_SERVICE` environment variables if the Railway services are named differently.

## Deploy from the CLI (manual)

```bash
# Deploy one service directly
railway up --service web --detach
railway up --service worker --detach
```

With GitHub integration enabled, pushing to the connected branch also triggers builds for each connected service.

## After deploy

1. Copy the **public HTTPS URL** from Railway → **Settings → Networking / Domains** (web service).
2. Set `NEXTAUTH_URL` to that URL and redeploy if it changed.
3. Open the URL, complete signup (with `INITIAL_SIGNUP_TOKEN` if required), enable **2FA**.
4. Confirm the **worker** service logs show the poll loop and that **jobs** transition from pending to running (tasks moved to coding / Ralph stages).

## Troubleshooting

| Issue                                      | What to check                                                                                                                                                              |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build timeout                              | Retry; first Docker build is large. Increase patience or Railway plan limits.                                                                                              |
| Health check fails                         | Logs → confirm `node server.js` listens on `PORT`. `railway.json` timeout is 300s.                                                                                         |
| Worker idle / jobs stuck                   | Worker service not running or wrong start command; `DATABASE_URL` missing on worker; migrations never ran (check web deploy).                                              |
| Jobs run twice                             | Unlikely with Postgres; if using legacy single SQLite file on one box, do not run two writers.                                                                             |
| 403 from IP rules                          | `ALLOWED_IPS` too strict or wrong; unset temporarily.                                                                                                                      |
| Permission errors on `/app/data`           | Volume ownership vs `nextjs` user; see Railway volume docs.                                                                                                                |
| Sign-in shows “first account” after deploy | Ephemeral disk or multiple web replicas without shared `/app/data`. Add a volume for `/app/data`, scale web to one instance, recreate the first user if the file was lost. |

## PostgreSQL

See [PostgreSQL and Prisma](./POSTGRES.md). Web-owned **`pnpm exec prisma migrate deploy`** runs inside `railway-web.sh`.

## Related documentation

| Document                                                   | Topic                                       |
| ---------------------------------------------------------- | ------------------------------------------- |
| [DOCKER.md](./DOCKER.md)                                   | Local Docker and Compose                    |
| [ENVIRONMENT.md](./ENVIRONMENT.md)                         | Environment variables                       |
| [POSTGRES.md](./POSTGRES.md)                               | Prisma, migrations, local Postgres          |
| [SECURE_DEPLOYMENT.md](./SECURE_DEPLOYMENT.md)             | TLS, secrets, checklist                     |
| `.tasks/FEAT-20260406_railway_worker_service/FINALIZED.md` | Architecture decisions for web/worker split |
