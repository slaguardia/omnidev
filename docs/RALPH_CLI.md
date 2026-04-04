# Ralph CLI (`pnpm ralph`)

Command-line access to Ralph tasks, workspaces, jobs, and related APIs. Implemented in `src/cli/` and invoked via the `ralph` script in `package.json`.

## Prerequisites

- Omnidev is running and reachable (local: `pnpm dev`, default `http://localhost:3000`).
- An API key the server accepts, or a scoped stage token (see below).

## Local development

1. Copy `env.example` to `.env` if needed and set at least `NEXTAUTH_*` for the app.
2. Add CLI variables to **`.env`** or **`.env.local`** in the **Omnidev repository root** (same files Next.js uses — both are gitignored):

```env
OMNIDEV_URL=http://localhost:3000
OMNIDEV_API_KEY=your-api-key-from-the-dashboard
```

3. Generate **`OMNIDEV_API_KEY`** in the dashboard (Settings), or use a key that matches **`VALID_API_KEYS`** / **`ADMIN_API_KEY`** if those are configured on the server.

The CLI loads these files automatically (no need to `export` in every shell). It finds the repo root by walking up from the current directory until it finds a `package.json` with `"name": "omnidev"`, then reads `.env` / `.env.local` from that directory. So you can run `pnpm ralph` from a subdirectory of the clone and still pick up the root `.env`.

### Examples

```bash
pnpm ralph tasks list
pnpm ralph tasks show RLP-42
pnpm ralph tasks show RLP-42 --json
pnpm ralph run-stage RLP-42 executing
pnpm ralph job <jobId>
```

Override the URL or key for a one-off command:

```bash
OMNIDEV_URL=https://staging.example.com OMNIDEV_API_KEY=… pnpm ralph tasks list
```

Shell-exported variables take precedence over values from `.env` files (except `.env.local` overriding `.env` for duplicate keys).

## Remote / production

- Set **`OMNIDEV_URL`** to the **HTTPS** origin of the deployed app (no trailing slash).
- Set **`OMNIDEV_API_KEY`** to a key issued for that instance (dashboard or server env).
- If the API is exposed on the public internet, use **`ALLOWED_IPS`** (and correct proxy forwarded headers) as documented in [ENVIRONMENT.md](./ENVIRONMENT.md) so clients cannot spoof IP allowlisting.
- Prefer secrets injected by the host (Kubernetes secrets, Docker secrets, etc.) rather than copying `.env` to remote machines.

## Agent / worker execution (scoped token)

When the worker runs an agent with CLI access enabled, it injects:

- **`OMNIDEV_CLI_TOKEN`** — short-lived scoped token (`X-CLI-Token` header)
- **`OMNIDEV_URL`**
- **`OMNIDEV_TASK_ID`** — current task; use task ref **`.`** in the CLI to mean this task

Prefer this path for automation over a long-lived **`OMNIDEV_API_KEY`** in agent prompts. Permissions are enforced per stage; see `src/lib/auth/permission-check.ts` and `src/lib/types/index.ts` (`CliPermission`).

## Troubleshooting

| Issue                           | What to check                                                                                       |
| ------------------------------- | --------------------------------------------------------------------------------------------------- |
| `OMNIDEV_API_KEY … is required` | Key missing from `.env` / env; or CLI not finding repo root (run from inside the clone).            |
| `401` / `Invalid API key`       | Key mismatch with server; regenerate in dashboard or align with `VALID_API_KEYS` / `ADMIN_API_KEY`. |
| `403` / IP                      | `ALLOWED_IPS` on server; proxy must set `X-Forwarded-For` / `X-Real-IP` correctly.                  |
| Connection refused              | Server not running; wrong **`OMNIDEV_URL`** or port.                                                |

## See also

- [API_AUTHENTICATION.md](./API_AUTHENTICATION.md) — API key and session auth
- [ENVIRONMENT.md](./ENVIRONMENT.md) — server environment variables
