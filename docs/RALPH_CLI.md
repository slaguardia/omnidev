# Ralph CLI

Command-line access to Ralph tasks, workspaces, jobs, and related APIs. Source lives in **`packages/omnidev-cli/`** in this monorepo; run it via **`pnpm ralph`** from the repo root (or install globally — see below).

## Prerequisites

- Omnidev is running and reachable (local: `pnpm dev`, default `http://localhost:3000`).
- An API key the server accepts, or a scoped stage token (see [Agent / worker execution](#agent--worker-execution-scoped-token)).

## Standalone install (global)

Install the published package globally to manage tasks against any Omnidev instance without cloning the full repo.

```bash
npm i -g omnidev
```

The `omnidev` binary is the same commands as `pnpm ralph` in development.

### Global configuration

Create `~/.config/omnidev/.env` with the server URL and API key:

```env
OMNIDEV_URL=https://your-omnidev-instance.example.com
OMNIDEV_API_KEY=your-api-key-here
```

Alternatively, pass credentials per-command:

```bash
omnidev --url https://your-instance.example.com --api-key your-key tasks list
```

Or set the `OMNIDEV_ENV_FILE` environment variable to point to a specific `.env` file:

```bash
export OMNIDEV_ENV_FILE=/path/to/my/.env
omnidev tasks list
```

### Env file discovery

When `--url` / `--api-key` are not provided, the CLI loads environment from the first matching source:

1. **`OMNIDEV_ENV_FILE`** — explicit file path
2. **Repo-root walk-up** — walks up from cwd to a `package.json` whose name is **`omnidev`** or **`omnidev-app`**, then loads `.env` / `.env.local` there
3. **XDG config** — `$XDG_CONFIG_HOME/omnidev/.env` (default `~/.config/omnidev/.env`)
4. **Current directory** — `.env` / `.env.local` in cwd

Shell-exported variables override `.env` except where `.env.local` overrides `.env` for duplicate keys in the repo-root case.

## Local development

1. Copy `.env.example` to `.env` if needed and set at least `NEXTAUTH_*` for the app.
2. Add CLI variables to **`.env`** or **`.env.local`** in the **Omnidev repository root**:

```env
OMNIDEV_URL=http://localhost:3000
OMNIDEV_API_KEY=your-api-key-from-the-dashboard
```

3. Generate **`OMNIDEV_API_KEY`** in the dashboard (Settings), or use keys that match **`VALID_API_KEYS`** / **`ADMIN_API_KEY`** if configured on the server.

```bash
pnpm ralph tasks list
pnpm ralph tasks show RLP-42
pnpm ralph tasks show RLP-42 --json
pnpm ralph run-stage RLP-42 executing
pnpm ralph job <jobId>
```

Override for a one-off command:

```bash
OMNIDEV_URL=https://staging.example.com OMNIDEV_API_KEY=… pnpm ralph tasks list
```

## Remote / production

- Set **`OMNIDEV_URL`** to the **HTTPS** origin of the deployed app (no trailing slash).
- Set **`OMNIDEV_API_KEY`** to a key issued for that instance (dashboard or server env).
- If the API is on the public internet, configure **`ALLOWED_IPS`** and proxy forwarded headers as in [ENVIRONMENT.md](./ENVIRONMENT.md).
- Prefer host-injected secrets (Kubernetes, Docker, etc.) over copying `.env` to remote machines.

## Agent / worker execution (scoped token)

When the worker runs an agent with CLI access enabled, it injects:

- **`OMNIDEV_CLI_TOKEN`** — short-lived scoped token (`X-CLI-Token` header)
- **`OMNIDEV_URL`**
- **`OMNIDEV_TASK_ID`** — current task; use task ref **`.`** in the CLI for this task

Prefer this for automation over a long-lived **`OMNIDEV_API_KEY`** in agent prompts. See `src/lib/auth/permission-check.ts` and `CliPermission` in `src/lib/types/index.ts`.

## Commands

Task management, lifecycle, jobs, deps, and resources follow the same structure as `omnidev --help` / `pnpm ralph --help`. Common examples:

| Area         | Examples                                                                         |
| ------------ | -------------------------------------------------------------------------------- |
| Tasks        | `tasks list`, `tasks show <ref>`, `tasks create`, `tasks update`, `tasks delete` |
| Lifecycle    | `transition`, `run-stage`, `stage-answer`, `complete`, `cancel-loop`             |
| Jobs         | `job <jobId>`                                                                    |
| Dependencies | `deps show`, `deps add`, `deps remove`, `deps graph`                             |
| Resources    | `workspaces`, `projects`, `playbooks`                                            |

### Task references

`<ref>` resolves in order: full task id → `RLP-N` → **`.`** with **`OMNIDEV_TASK_ID`**.

### Global flags

| Flag              | Description                                |
| ----------------- | ------------------------------------------ |
| `--url <url>`     | Override `OMNIDEV_URL` for this invocation |
| `--api-key <key>` | Override `OMNIDEV_API_KEY`                 |
| `--json`          | Machine-readable JSON where supported      |

## Environment variables

| Variable            | Description                                  |
| ------------------- | -------------------------------------------- |
| `OMNIDEV_URL`       | Server URL (default `http://localhost:3000`) |
| `OMNIDEV_API_KEY`   | API key for interactive use                  |
| `OMNIDEV_CLI_TOKEN` | Scoped stage token (worker / agent)          |
| `OMNIDEV_TASK_ID`   | Default task for `.` ref                     |
| `OMNIDEV_ENV_FILE`  | Explicit path to a `.env` file to load       |

## Versioning and compatibility

The CLI targets the **`/api/ralph/*`** HTTP contract. Server and CLI versions are **independent**; CLI semver reflects breaking changes to flags, env behavior, and the API client — not server releases. Upgrade either side if you see unexpected 404s or response shape errors.

## Troubleshooting

| Issue                           | What to check                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------ |
| `OMNIDEV_API_KEY … is required` | Key missing from env / discovery path; run from inside the clone or set `OMNIDEV_ENV_FILE` |
| `401` / `Invalid API key`       | Key mismatch; regenerate in dashboard or align server `VALID_API_KEYS` / `ADMIN_API_KEY`   |
| `403` / IP                      | `ALLOWED_IPS` and proxy `X-Forwarded-For` / `X-Real-IP`                                    |
| Connection refused              | Server not running; wrong **`OMNIDEV_URL`** or port                                        |

## See also

- [API_AUTHENTICATION.md](./API_AUTHENTICATION.md) — API key and session auth
- [ENVIRONMENT.md](./ENVIRONMENT.md) — server environment variables
