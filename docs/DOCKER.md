## Files Overview

| File                          | Purpose                                        |
| ----------------------------- | ---------------------------------------------- |
| `Dockerfile`                  | Production multi-stage build                   |
| `Dockerfile.dev`              | Development build with hot reload              |
| `docker-compose.yml`          | Base configuration (volumes, init service)     |
| `docker-compose.override.yml` | Development overrides (auto-loaded)            |
| `docker-compose.prod.yml`     | Production overrides                           |
| `docker-compose.showcase.yml` | Showcase mode (read-only, no auth)             |
| `.dockerignore`               | Excludes unnecessary files from Docker context |
| `.env.example`                | Environment variable template                  |

## Quick Start

### Development

```bash
docker compose up
```

This auto-loads `docker-compose.override.yml` which uses `Dockerfile.dev` with hot reload.

### Production

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

### Showcase Mode

```bash
docker compose -f docker-compose.yml -f docker-compose.showcase.yml up --build
```

Showcase mode is read-only with no authentication - for public demos.

### Initialize Volumes (first time only)

```bash
docker compose --profile init run --rm init-perms
```

### Access the Application

Open http://localhost:3000 in your browser

## Coolify Deployment (Docker Compose)

If you deploy this repo via **Coolify → Docker Compose**, Coolify runs the same Docker Compose commands you would run locally — but it routes traffic through its proxy (Traefik/Caddy) instead of exposing host ports.

### Coolify Commands (Build + Start)

Set these in Coolify if it asks for custom commands (or use them when deploying manually on the server):

**Build command**

```bash
docker compose -f ./docker-compose.yml -f ./docker-compose.prod.yml build app
```

**Start command**

```bash
docker compose -f ./docker-compose.yml -f ./docker-compose.prod.yml up -d app
```

Notes:

- The `app` service depends on `init-perms`, so Compose will run the init container automatically.
- When using Coolify's proxy, you generally should **not** publish `ports:` to the host (Coolify docs warn it can reduce features like rolling updates).

### Coolify Domain “:PORT” (very important)

This app listens on **port 3000 inside the container**. If Coolify/proxy guesses the wrong upstream port (common default is `80`), you’ll get **502 Bad Gateway** even though the container is healthy.

In Coolify’s **Domains** field you can bind the domain to the container port, e.g.:

- `https://codespider.playdate.events:3000`

This tells Coolify’s proxy: “route this domain to **port 3000 inside the container**”.

For a visual explanation, see `docs/COOLIFY_PORTS_FLOW.md`.

### Required Coolify Environment Variables

- **`NEXTAUTH_SECRET`**: must be set (Coolify env var)
- **`NEXTAUTH_URL`**: must be your public URL (no `:3000`)

Example:

```bash
NEXTAUTH_URL=https://codespider.playdate.events
```

### Health checks (Coolify / proxy)

- `GET /api/health` always returns `200` (used for container health checks / routing).
- `GET /api/config/validate` returns a JSON status object and also returns `200` even when config is incomplete (used by the UI).

### Development Setup

**Start development with hot reload:**

```bash
docker compose up
```

This runs `pnpm dev` inside the container with your repo bind-mounted for fast iteration.
The app is available at `http://localhost:3000`.

If you see `Bind for 0.0.0.0:3000 failed: port is already allocated`, stop any existing containers:

```bash
docker compose down
docker compose up
```

## Running Detached

To run in the background (logs in Docker Desktop instead of terminal):

### Development

```bash
docker compose up -d
```

### Production

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

### Viewing Logs

```bash
docker compose logs -f app
```

Or open the container in **Docker Desktop** and view the **Logs** tab.

### Stopping

```bash
docker compose down
```

## Environment Variables

The application supports configuration through environment variables. You can:

1. **Use the Settings UI** (recommended) - All configuration can be done through the web interface
2. **Set environment variables** - Either in docker-compose.yml or via .env file

### Common Environment Variables

**GitLab Configuration:**

```bash
GITLAB_URL=https://gitlab.com
GITLAB_TOKEN=your_gitlab_token_here
```

**Claude Configuration:**

```bash
ANTHROPIC_API_KEY=your_claude_api_key_here
# Optional override for the sandbox wrapper path used to run Claude Code non-interactively
CLAUDE_CODE_WRAPPER=/usr/local/bin/claude-code-wrapper
```

## Claude Code Authentication

This app runs Claude Code via the `claude` CLI inside the container.

- **Platform account (API key login)**: If you have an Anthropic **platform** account, set `ANTHROPIC_API_KEY` (recommended for headless/automation).
- **Claude subscription (manual login)**: If you only have a Claude **subscription** plan (not a platform account), you typically **cannot** use an API key and must log in interactively once.

If you are using a subscription/manual login, set:

```bash
CLAUDE_CODE_AUTH_MODE=cli
```

This forces the app to **not pass** `ANTHROPIC_API_KEY` into the `claude` subprocess even if it is set in the container environment.

### One-time manual login inside Docker

1. Exec into the running container:

   ```bash
   docker compose exec app bash
   ```

2. Run an **interactive** Claude CLI session and follow the prompts (it will typically print a URL + code):

   ```bash
   claude --help
   # Start interactive mode (this is the most version-stable way to complete auth + trust):
   claude
   ```

3. Exit and restart the app container:

   ```bash
   exit
   docker compose restart app
   ```

### Persisting the login across rebuilds/restarts

Claude Code stores its auth + settings under `~/.claude` inside the container.
`docker-compose.yml` mounts a named volume so your login persists:

- `/home/nextjs/.claude` (the app runs as the `nextjs` user)
- `/root/.claude` (if you exec into the container as root and run `claude`, it may write here)

**Important:** Claude also writes a `~/.claude.json` file in the user's home directory.
The container startup scripts migrate this file into `~/.claude/.claude.json` and symlink it back,
so it persists in the same named volume across restarts.

#### MCP server authentication (OAuth not supported)

This project currently supports **only token/API-key based MCP auth** (for example, setting an `Authorization: Bearer <token>` header on the MCP server entry).

**OAuth-based MCP servers are not supported yet** (i.e. flows that require a browser login + redirect/callback to exchange codes for tokens). If you need an MCP integration, prefer providers that support **static tokens** (or manually issued API keys).

If you want a single consistent location, log in as `nextjs` (recommended):

```bash
docker compose exec --user nextjs app bash
cd /app/workspaces
claude
```

#### Trusted directory (important)

When Claude prompts you to "trust" a directory, do it from the directory you want Claude to operate in.
For this app, that's typically **`/app/workspaces`** (or a specific repo under it).

**Important nuance:** this app typically runs Claude Code in **non-interactive** mode using `-p/--print` (and `--output-format stream-json`).
Per the Claude CLI help, **the workspace trust dialog is skipped in `-p` mode**, which is why "headless" commands can appear to work even if you haven't completed the interactive trust/setup flow yet.

If you want to "do it the right way" once and have it persist, run an **interactive** Claude session (no `-p`) from `/app/workspaces` and complete the trust prompt once:

```bash
docker compose exec --user nextjs app bash
cd /app/workspaces
# run any claude command once to trigger the trust prompt if needed
claude
```

To "log out" / reset Claude CLI credentials, remove the volume (this deletes the stored login):

```bash
docker compose down
docker volume rm workflow_workflow_claude_config
```

### Advanced Configuration

```bash
MAX_WORKSPACE_SIZE_MB=500
TEMP_DIR_PREFIX=gitlab-claude-
LOG_LEVEL=info
ALLOWED_GITLAB_HOSTS=gitlab.com
MAX_CONCURRENT_WORKSPACES=3
```

## Data Persistence

The Docker setup includes a named volume `workflow_workspaces` to persist:

- Cloned repositories
- Workspace data
- Configuration files

## Useful Docker Commands

### Managing the Application

Start the application:

```bash
docker compose up -d
```

Stop the application:

```bash
docker compose down
```

View logs:

```bash
docker compose logs -f workflow-app
```

Restart the application:

```bash
docker compose restart workflow-app
```

Update and rebuild:

```bash
docker compose up --build -d
```

### Development Commands

Access the container shell:

```bash
docker compose exec app bash
```

Run tests inside container:

```bash
docker compose exec app pnpm test
```

Check application health:

```bash
docker compose exec app wget -qO- http://localhost:3000/api/config/validate
```

### Cleanup

Remove containers and networks:

```bash
docker compose down
```

Remove containers, networks, and volumes:

```bash
docker compose down -v
```

Remove all related images:

```bash
docker rmi workflow-app workflow-app-dev
```

Clean up dangling images:

```bash
docker image prune
```

## Production Deployment

### Plain Docker Compose (single host)

If you're deploying to a single VM (no Swarm), and you have a reverse proxy (Traefik/Caddy/nginx) handling TLS:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Notes:

- When deploying behind a reverse proxy, the app should **not publish** `3000` to the host. The `docker-compose.prod.yml` is set up that way by default; your reverse proxy should publish `80/443` and route internally to `workflow-app:3000`.
- Set `NEXTAUTH_URL` to your public URL (e.g. `https://workflow.example.com`) in your `.env` file.

### Docker Swarm

Initialize swarm (if not already done):

```bash
docker swarm init
```

Deploy stack:

```bash
docker stack deploy -c docker-compose.yml -c docker-compose.prod.yml workflow
```

Notes:

- If you are deploying behind **Traefik/Caddy**, the app should **not publish** `3000` to the host. Your reverse proxy should publish `80/443` and route internally to the app on port 3000.
- Set `NEXTAUTH_URL` to your public URL (e.g. `https://workflow.example.com`) in your `.env` file.

### Kubernetes

You can use the Docker images with Kubernetes. Example deployment:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: workflow-app
spec:
  replicas: 3
  selector:
    matchLabels:
      app: workflow-app
  template:
    metadata:
      labels:
        app: workflow-app
    spec:
      containers:
        - name: workflow-app
          image: workflow-app:latest
          ports:
            - containerPort: 3000
          env:
            - name: NODE_ENV
              value: 'production'
```

## Troubleshooting

### Common Issues

1. **Port already in use:**

   If you are running the app **directly** (no reverse proxy), change the port mapping in `docker-compose.yml`:

   ```yaml
   ports:
     - '3001:3000'
   ```

   If you are running behind a **reverse proxy (Traefik/Caddy/nginx)**, the recommended fix is to **not publish** the app port at all:

   - Remove `ports:` from the app service
   - Keep the app reachable only on an internal Docker network
   - Have the reverse proxy publish `80/443` and route to `workflow-app:3000`

2. **Permission issues with workspaces:**

   Fix volume permissions:

   ```bash
   docker compose exec app chown -R nextjs:nodejs /app/workspaces
   ```

3. **Build failures:**

   Clean build with no cache:

   ```bash
   docker compose build --no-cache
   ```

### Local testing with ngrok

If you want to test webhooks (e.g. n8n callbacks) or access the app from outside your network:

1. Start the app locally:

   ```bash
   docker compose up -d
   ```

2. Expose port 3000:

   ```bash
   ngrok http 3000
   ```

3. Use the printed URL (e.g. `https://xxxx.ngrok-free.app`) as your base URL:

   - `POST https://xxxx.ngrok-free.app/api/ask`
   - `POST https://xxxx.ngrok-free.app/api/edit`
   - `GET  https://xxxx.ngrok-free.app/api/jobs/:jobId`

   Notes:

   - If you are testing **NextAuth session login** through ngrok, you must set `NEXTAUTH_URL` to the ngrok URL.
   - If you are using **API key auth**, `NEXTAUTH_URL` is not required.

4. **Memory issues:**

   Increase Docker memory limit in Docker Desktop settings, or add memory limits to docker-compose.yml:

   ```yaml
   deploy:
     resources:
       limits:
         memory: 1G
   ```

### Health Checks

The container includes health checks that verify:

- Application is responding on port 3000
- API endpoints are accessible
- Configuration validation passes

Check health status:

```bash
docker compose ps
docker inspect --format='{{.State.Health.Status}}' workflow-app
```

## Performance Optimization

### Production Tips

1. **Multi-stage builds** - Already implemented to minimize image size
2. **Layer caching** - Dependencies are cached separately from source code
3. **Non-root user** - Runs as `nextjs` user for security
4. **Standalone output** - Uses Next.js standalone mode for optimal performance

### Monitoring

Add monitoring with tools like:

- Prometheus + Grafana
- Docker stats: `docker stats workflow-app`
- Health endpoint: `curl http://localhost:3000/api/config/validate`

## Security Considerations

1. **Secrets management** - Use Docker secrets or external secret management
2. **Network security** - Consider using custom networks
3. **Image scanning** - Regularly scan images for vulnerabilities
4. **Updates** - Keep base images and dependencies updated
5. **Reverse proxy (Traefik/Caddy) recommended**:

   - Terminate TLS at the reverse proxy and forward traffic to the app over a private network.
   - **Do not publish the app container port to the internet**; only the reverse proxy should connect to it.
   - If you enable API IP allowlisting (`ALLOWED_IPS`), configure the proxy to **overwrite/sanitize** `X-Forwarded-For` / `X-Real-IP` so clients cannot spoof their IP.
   - **Caddy example**:

     ```caddyfile
     reverse_proxy workflow-app:3000 {
       header_up X-Forwarded-For {remote_host}
       header_up X-Real-IP {remote_host}
     }
     ```

6. **Logging hygiene**:
   - Avoid running with overly verbose logging in production.
   - The API avoids logging raw prompts and filesystem paths by default, but you should still treat logs as sensitive (they can contain error details and operational metadata).

## Next Steps

1. Set up CI/CD pipeline for automated builds
2. Configure monitoring and logging
3. Set up backup strategy for persistent data
4. Consider using a reverse proxy (nginx, traefik) for production

---

## VM Setup (Ubuntu)

If you're setting up Docker on a fresh Ubuntu VM (20.04+), follow these steps.

### Prerequisites

- Ubuntu VM with sudo privileges
- Internet access

### Install Docker Engine

Update packages and install dependencies:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl gnupg lsb-release
```

Add Docker's official GPG key:

```bash
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
```

Set up the Docker repository:

```bash
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
```

Install Docker:

```bash
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
```

### Post-Install Configuration

Allow non-root Docker usage:

```bash
sudo usermod -aG docker $USER
```

Log out and back in, or run `newgrp docker` for the change to take effect.

Verify installation:

```bash
docker version
docker run hello-world
```
