# PostgreSQL and Prisma

## Purpose

Omnidev is moving **durable application state** (Ralph tasks, jobs, workspaces index, chat, users, API keys) from **SQLite + JSON files** under `data/` to **PostgreSQL** via **Prisma**, so the API and worker can share one database without sharing a disk volume.

**Git clones stay on disk** (worker volume); **metadata and control-plane state** belong in Postgres.

## Schema and client

| Path                   | Role                                                      |
| ---------------------- | --------------------------------------------------------- |
| `prisma/schema.prisma` | Models and indexes (source of truth)                      |
| `prisma/migrations/`   | Versioned SQL (use `prisma migrate deploy` in production) |
| `src/lib/db/prisma.ts` | Singleton `PrismaClient` for Next.js + worker             |

Application routes still use **SQLite** (`ralph.db`, etc.) until those modules are switched to `prisma`; the Prisma schema and migrations are ready for that work.

## Railway: Postgres + `DATABASE_URL`

1. **Add PostgreSQL** — Railway dashboard → project → **New** → **Database** → **PostgreSQL**.
2. **Reference the URL on the app service** — Omnidev service → **Variables** → **Add variable reference** → select the Postgres plugin’s **`DATABASE_URL`** (or paste the connection string from the database service).
3. **Deploy / migrate** — The web service runs `railway-web.sh` (migrate + `node server.js`); the worker runs `railway-worker.sh` (no migrate). Deploy **web** first so migrations apply. Use `pnpm deploy` to deploy both services. The Docker **entrypoint** still runs first (secrets, workspace symlink). For other hosts, run `pnpm exec prisma migrate deploy` manually or in CI before traffic.
4. **TLS** — Managed URLs usually include `sslmode=require`. Prisma uses `DATABASE_URL` as-is. For local Postgres without TLS, you can use `?sslmode=disable` in the URL for testing only.

## Local development

```bash
docker run --name omnidev-pg -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=omnidev -p 5432:5432 -d postgres:16
export DATABASE_URL=postgresql://postgres:dev@localhost:5432/omnidev
pnpm exec prisma migrate deploy   # or: pnpm db:migrate (dev iteration)
pnpm exec tsx scripts/pg-smoke.ts
```

## Scripts (package.json)

| Script             | Purpose                                                           |
| ------------------ | ----------------------------------------------------------------- |
| `pnpm db:generate` | `prisma generate` (also runs on `postinstall`)                    |
| `pnpm db:migrate`  | `prisma migrate dev` — create/apply migrations in development     |
| `pnpm db:deploy`   | `prisma migrate deploy` — apply committed migrations (production) |
| `pnpm db:push`     | `prisma db push` — prototype schema without migrations (dev only) |
| `pnpm db:studio`   | Prisma Studio                                                     |

## Prisma version

The repo pins **Prisma 5.x** (`prisma` / `@prisma/client` ~5.22) so the datasource URL stays in `schema.prisma`. Prisma 7+ changed configuration; see [Prisma upgrade docs](https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions) before jumping major versions.

## Related

| Document                           | Topic                 |
| ---------------------------------- | --------------------- |
| [RAILWAY.md](./RAILWAY.md)         | Volumes, CLI, deploy  |
| [ENVIRONMENT.md](./ENVIRONMENT.md) | Environment variables |
