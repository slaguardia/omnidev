# Installing Omnidev on a VPS

A one-line install for fresh Ubuntu/Debian VPS instances. The installer
detects (or installs) Docker, downloads a self-contained Compose stack from
this repository, generates per-install secrets, and pulls pre-built images
from GitHub Container Registry.

## Quick start

```bash
curl -fsSL https://raw.githubusercontent.com/slaguardia/omnidev/master/install.sh | bash
```

The installer will prompt for a `CURSOR_API_KEY` interactively. Skip the
prompt by setting it ahead of time:

```bash
CURSOR_API_KEY=cursor_sk_... bash -c "$(curl -fsSL https://raw.githubusercontent.com/slaguardia/omnidev/master/install.sh)"
```

When the install finishes you'll see:

```
[omnidev] Omnidev is up.

  Dashboard   http://127.0.0.1:3000
  Signup token <one-time hex string>

  Next steps:
    1. Open the dashboard URL above (or set up a reverse proxy if exposing to the internet).
    2. Sign up the first user with the token above.
    3. (Optional) Set GITHUB_TOKEN in /opt/omnidev/.env to enable push.
```

## Requirements

| Requirement                 | Notes                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Ubuntu 22.04+ or Debian 12+ | Other distros are not gated at launch; PRs welcome.                                                          |
| 2 GB RAM minimum            | Recommended 4 GB for the default 3-slot worker concurrency.                                                  |
| `curl`, `bash`, `sudo`      | Present on every default Ubuntu/Debian install.                                                              |
| Outbound HTTPS              | To pull from `ghcr.io`, the Cursor API, and your git remote.                                                 |
| Cursor API key              | Generate at <https://cursor.com/dashboard> → Integrations. Use a Service Account key for shared deployments. |

The installer installs Docker + the compose plugin automatically if missing.

## What gets installed

- `/opt/omnidev/docker-compose.install.yml` — the Compose stack
- `/opt/omnidev/.env` — generated secrets, mode `0600`
- `/opt/omnidev/.signup-token` — first-user signup token, mode `0600`
- Docker volumes: `omnidev_workspaces`, `omnidev_data`, `omnidev_secrets`, `omnidev_postgres_data`
- Four containers: `omnidev-postgres`, `omnidev-app`, `omnidev-worker`, `omnidev-init-perms`

Override the install directory with `OMNIDEV_HOME=/some/other/path bash install.sh`.

## Customizing the install

All knobs are env vars on the install command:

| Env var                      | Default                                       | Purpose                                                       |
| ---------------------------- | --------------------------------------------- | ------------------------------------------------------------- |
| `CURSOR_API_KEY`             | _(prompted)_                                  | Required — auth for the Cursor SDK                            |
| `OMNIDEV_HOME`               | `/opt/omnidev`                                | Install directory                                             |
| `OMNIDEV_VERSION`            | `latest`                                      | Image tag (e.g. `1.2.3`, `1.2`, `1`)                          |
| `OMNIDEV_PORT`               | `3000`                                        | Host port the dashboard binds to                              |
| `OMNIDEV_BIND_ADDR`          | `127.0.0.1`                                   | Host bind address. Set to `0.0.0.0` to expose publicly.       |
| `OMNIDEV_WORKER_CONCURRENCY` | `3`                                           | Concurrent agent jobs per worker process                      |
| `NEXTAUTH_URL`               | `http://${OMNIDEV_BIND_ADDR}:${OMNIDEV_PORT}` | External dashboard URL (used by NextAuth callbacks)           |
| `GITHUB_TOKEN`               | _(empty)_                                     | Optional; enables push to GitHub remotes                      |
| `GITLAB_URL`                 | _(empty)_                                     | Optional; for self-hosted GitLab                              |
| `GITLAB_TOKEN`               | _(empty)_                                     | Optional; enables push to GitLab remotes                      |
| `OMNIDEV_FORCE`              | `0`                                           | Set to `1` to wipe `/opt/omnidev/.env` and regenerate secrets |

Example — pin a specific version and bind to all interfaces:

```bash
OMNIDEV_VERSION=1.0.0 OMNIDEV_BIND_ADDR=0.0.0.0 \
  CURSOR_API_KEY=cursor_sk_... bash install.sh
```

## Re-running the installer

Idempotent by default:

```bash
bash install.sh                 # pulls latest images, restarts stack, keeps .env
OMNIDEV_FORCE=1 bash install.sh # wipe .env and regenerate every secret
```

## Managing the stack post-install

```bash
cd /opt/omnidev

# View logs
docker compose -f docker-compose.install.yml --env-file .env logs -f

# Restart everything
docker compose -f docker-compose.install.yml --env-file .env restart

# Stop everything
docker compose -f docker-compose.install.yml --env-file .env down

# Upgrade to the latest images
docker compose -f docker-compose.install.yml --env-file .env pull
docker compose -f docker-compose.install.yml --env-file .env up -d
```

## Exposing the dashboard

The installer binds the dashboard to `127.0.0.1:3000` by default — only
reachable from the VPS itself. Three common ways to expose it:

1. **Reverse proxy (recommended)** — Caddy or Nginx terminating TLS on
   port 443, proxying to `127.0.0.1:3000`. Caddy is the simplest:

   ```caddy
   omnidev.example.com {
       reverse_proxy 127.0.0.1:3000
   }
   ```

2. **SSH tunnel** — `ssh -L 3000:127.0.0.1:3000 user@vps` from your laptop;
   no public exposure at all.

3. **Direct exposure** — re-run the installer with `OMNIDEV_BIND_ADDR=0.0.0.0`
   and open port 3000 in your firewall. **No TLS, no rate limiting at the
   web tier.** Treat as development-grade only.

## Uninstalling

```bash
cd /opt/omnidev
docker compose -f docker-compose.install.yml --env-file .env down -v   # -v removes volumes (DATA LOSS)
cd /
sudo rm -rf /opt/omnidev
```

The `-v` flag deletes the Postgres data, all task history, and the
agent_events timeline. Omit it to keep the volumes intact (e.g. to
reinstall later).

## Troubleshooting

**`Dashboard did not become healthy within 120s`** — the install ran to
completion but the web container hasn't responded on `/api/health`. The
installer prints the last 50 lines of container logs in this case. Common
causes:

- The pulled image is broken for your architecture (file an issue)
- Postgres failed to start — check `docker compose logs postgres`
- Wrong `DATABASE_URL` shape in `.env` (regenerate with `OMNIDEV_FORCE=1`)

**`CURSOR_API_KEY is required and the installer is running non-interactively`** —
piping the installer through `bash` makes stdin unavailable for the prompt.
Either run interactively (download then `bash install.sh`) or pre-set the
env var:

```bash
CURSOR_API_KEY=cursor_sk_... bash -c "$(curl -fsSL ...)"
```

**`Unsupported OS`** — the installer gates on Ubuntu/Debian. On other
distros, install Docker manually and run the equivalent commands:

```bash
mkdir -p /opt/omnidev && cd /opt/omnidev
curl -fsSL https://raw.githubusercontent.com/slaguardia/omnidev/master/docker/docker-compose.install.yml -o docker-compose.install.yml
# Hand-write .env with the variables documented above
docker compose -f docker-compose.install.yml --env-file .env up -d
```

## See also

- [docs/CURSOR.md](CURSOR.md) — Cursor SDK auth and operational notes
- [docs/ENVIRONMENT.md](ENVIRONMENT.md) — full environment variable reference
- [docs/DOCKER.md](DOCKER.md) — Compose architecture and dev-mode usage
