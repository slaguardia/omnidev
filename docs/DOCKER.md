## Files Overview

| File                                 | Purpose                                           |
| ------------------------------------ | ------------------------------------------------- |
| `src/web/Dockerfile`                 | Production Next.js / API image (`node server.js`) |
| `src/worker/Dockerfile`              | Production job worker (`node worker.cjs`)         |
| `src/web/Dockerfile.dev`             | Development image (bind-mount; app + worker dev)  |
| `docker/docker-compose.yml`          | Base configuration (volumes, init service)        |
| `docker/docker-compose.override.yml` | Development overrides (auto-loaded)               |
| `docker/docker-compose.prod.yml`     | Production overrides                              |
| `docker/docker-compose.showcase.yml` | Showcase mode (read-only, no auth)                |
| `.dockerignore`                      | Excludes unnecessary files from Docker context    |
| `.env.example`                       | Environment variable template                     |

### Faster builds (Railway / CI)

`src/web/Dockerfile` uses **BuildKit cache mounts** (`# syntax=docker/dockerfile:1.4`): shared **pnpm store** between the `deps` and `prod-deps` stages, **Next.js** cache under `src/web/.next`, **apt** package caches, and **npm** global cache for `pnpm`. The **first** build on a cold builder still does full compile and install; **repeated** builds benefit most when the platform reuses cache layers and cache mounts. Ensure the builder uses **BuildKit** (default on current Docker and most hosted builders).

## Quick Start

### Development

```bash
docker compose -f docker/docker-compose.yml up
```

This auto-loads `docker/docker-compose.override.yml` which uses `src/web/Dockerfile.dev` with hot reload.

### Production

```bash
docker compose -f docker/docker-compose.yml -f docker/docker-compose.prod.yml up -d --build
```

### Showcase Mode

```bash
docker compose -f docker/docker-compose.yml -f docker/docker-compose.showcase.yml up --build
```

Showcase mode is read-only with no authentication - for public demos.

### Initialize Volumes (first time only)

```bash
docker compose -f docker/docker-compose.yml --profile init run --rm init-perms
```

### Access the Application

Open http://localhost:3000 in your browser

## Coolify Deployment (Docker Compose)

If you deploy this repo via **Coolify → Docker Compose**, Coolify runs the same Docker Compose commands you would run locally — but it routes traffic through its proxy (Traefik/Caddy) instead of exposing host ports.

### Coolify Commands (Build + Start)

Set these in Coolify if it asks for custom commands (or use them when deploying manually on the server):

**Build command**

```bash
docker compose -f ./docker/docker-compose.yml -f ./docker/docker-compose.prod.yml build app
```

**Start command**

```bash
docker compose -f ./docker/docker-compose.yml -f ./docker/docker-compose.prod.yml up -d app
```

Notes:

- The `app` service depends on `init-perms`, so Compose will run the init container automatically.
- When using Coolify's proxy, you generally should **not** publish `ports:` to the host (Coolify docs warn it can reduce features like rolling updates).

### Coolify Domain “:PORT” (very important)

This app listens on **port 3000 inside the container**. If Coolify/proxy guesses the wrong upstream port (common default is `80`), you’ll get **502 Bad Gateway** even though the container is healthy.

In Coolify’s **Domains** field you can bind the domain to the container port, e.g.:

- `https://omnidev.example.com:3000`

This tells Coolify’s proxy: “route this domain to **port 3000 inside the container**”.

For a visual explanation, see `docs/COOLIFY_PORTS_FLOW.md`.

### Required Coolify Environment Variables

- **`NEXTAUTH_SECRET`**: must be set (Coolify env var)
- **`NEXTAUTH_URL`**: must be your public URL (no `:3000`)

Example:

```bash
NEXTAUTH_URL=https://omnidev.example.com
```

### Health checks (Coolify / proxy)

- `GET /api/health` always returns `200` (used for container health checks / routing).
- `GET /api/config/validate` returns a JSON status object and also returns `200` even when config is incomplete (used by the UI).

### Development Setup

**Start development with hot reload:**

```bash
docker compose -f docker/docker-compose.yml up
```

This runs `pnpm dev` inside the container with your repo bind-mounted for fast iteration.
The app is available at `http://localhost:3000`.

If you see `Bind for 0.0.0.0:3000 failed: port is already allocated`, stop any existing containers:

```bash
docker compose -f docker/docker-compose.yml down
docker compose -f docker/docker-compose.yml up
```

## Running Detached

To run in the background (logs in Docker Desktop instead of terminal):

### Development

```bash
docker compose -f docker/docker-compose.yml up -d
```

### Production

```bash
docker compose -f docker/docker-compose.yml -f docker/docker-compose.prod.yml up -d --build
```

### Viewing Logs

```bash
docker compose -f docker/docker-compose.yml logs -f app
```

Or open the container in **Docker Desktop** and view the **Logs** tab.

### Stopping

```bash
docker compose -f docker/docker-compose.yml down
```

## Environment Variables

The application supports configuration through environment variables. You can:

1. **Use the Settings UI** (recommended) - All configuration can be done through the web interface
2. **Set environment variables** - Either in `docker/docker-compose.yml` or via .env file

### Common Environment Variables

**GitLab Configuration:**

```bash
GITLAB_URL=https://gitlab.com
GITLAB_TOKEN=your_gitlab_token_here
```

**Cursor SDK Configuration:**

```bash
# Required — the agent fails to start without this. Generate at
# https://cursor.com/dashboard → Integrations.
CURSOR_API_KEY=cursor_sk_…
```

## Cursor SDK Authentication

The Cursor SDK uses an **API key** — no interactive login, no credential
volume. Set `CURSOR_API_KEY` on the container's environment and the agent
authenticates on every run.

### Generating a key

1. Go to <https://cursor.com/dashboard> → **Integrations** (or **Team
   Settings → Service Accounts** for shared deployments — recommended).
2. Copy the `cursor_sk_…` value.
3. Set it on the container, either by adding it to your `.env` file
   (Docker Compose picks it up automatically) or by passing
   `-e CURSOR_API_KEY=...` to `docker run`.

### Verifying the key reaches the worker

```bash
docker compose -f docker/docker-compose.yml exec worker env | grep CURSOR_API_KEY
```

If the value is missing or wrong, every agent run terminates immediately
with an unrecoverable `error` event containing `"CURSOR_API_KEY is not set"`.

### Rotation

1. Generate a fresh key in the Cursor dashboard.
2. Update `CURSOR_API_KEY` in your `.env` (or platform's secret store).
3. `docker compose -f docker/docker-compose.yml up -d` to apply (variables
   take effect on container restart).
4. Revoke the old key in the dashboard.

See [docs/CURSOR.md](./CURSOR.md) for the full operational reference.

### Advanced Configuration

```bash
MAX_WORKSPACE_SIZE_MB=500
TEMP_DIR_PREFIX=omnidev-
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
docker compose -f docker/docker-compose.yml up -d
```

Stop the application:

```bash
docker compose -f docker/docker-compose.yml down
```

View logs:

```bash
docker compose -f docker/docker-compose.yml logs -f app
```

Restart the application:

```bash
docker compose -f docker/docker-compose.yml restart app
```

Update and rebuild:

```bash
docker compose -f docker/docker-compose.yml up --build -d
```

### Development Commands

Access the container shell:

```bash
docker compose -f docker/docker-compose.yml exec app bash
```

Run tests inside container:

```bash
docker compose -f docker/docker-compose.yml exec app pnpm test
```

Check application health:

```bash
docker compose -f docker/docker-compose.yml exec app wget -qO- http://localhost:3000/api/config/validate
```

### Cleanup

Remove containers and networks:

```bash
docker compose -f docker/docker-compose.yml down
```

Remove containers, networks, and volumes:

```bash
docker compose -f docker/docker-compose.yml down -v
```

Remove images produced by the compose project (optional):

```bash
docker compose -f docker/docker-compose.yml down --rmi local
```

Clean up dangling images:

```bash
docker image prune
```

## Production Deployment

### Plain Docker Compose (single host)

If you're deploying to a single VM (no Swarm), and you have a reverse proxy (Traefik/Caddy/nginx) handling TLS:

```bash
docker compose -f docker/docker-compose.yml -f docker/docker-compose.prod.yml up -d --build
```

Notes:

- When deploying behind a reverse proxy, the app should **not publish** `3000` to the host. The `docker/docker-compose.prod.yml` is set up that way by default; your reverse proxy should publish `80/443` and route internally to the Compose service **`app` on port 3000** (e.g. `http://app:3000` on the Docker network).
- Set `NEXTAUTH_URL` to your public URL (e.g. `https://omnidev.example.com`) in your `.env` file.

### Docker Swarm

Initialize swarm (if not already done):

```bash
docker swarm init
```

Deploy stack:

```bash
docker stack deploy -c docker/docker-compose.yml -c docker/docker-compose.prod.yml workflow
```

Notes:

- If you are deploying behind **Traefik/Caddy**, the app should **not publish** `3000` to the host. Your reverse proxy should publish `80/443` and route internally to the app on port 3000.
- Set `NEXTAUTH_URL` to your public URL (e.g. `https://omnidev.example.com`) in your `.env` file.

### Kubernetes

You can use the Docker images with Kubernetes. Example deployment:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: omnidev-app
spec:
  replicas: 3
  selector:
    matchLabels:
      app: omnidev-app
  template:
    metadata:
      labels:
        app: omnidev-app
    spec:
      containers:
        - name: omnidev-app
          image: omnidev:latest
          ports:
            - containerPort: 3000
          env:
            - name: NODE_ENV
              value: 'production'
```

## Troubleshooting

### Common Issues

1. **Port already in use:**

   If you are running the app **directly** (no reverse proxy), change the port mapping in `docker/docker-compose.yml`:

   ```yaml
   ports:
     - '3001:3000'
   ```

   If you are running behind a **reverse proxy (Traefik/Caddy/nginx)**, the recommended fix is to **not publish** the app port at all:

   - Remove `ports:` from the app service
   - Keep the app reachable only on an internal Docker network
   - Have the reverse proxy publish `80/443` and route to the **`app`** service at `app:3000` on the Docker network

2. **Permission issues with workspaces:**

   Fix volume permissions:

   ```bash
   docker compose -f docker/docker-compose.yml exec app chown -R nextjs:nodejs /app/workspaces
   ```

3. **Build failures:**

   Clean build with no cache:

   ```bash
   docker compose -f docker/docker-compose.yml build --no-cache
   ```

### Local testing with ngrok

If you want to test webhooks (e.g. n8n callbacks) or access the app from outside your network:

1. Start the app locally:

   ```bash
   docker compose -f docker/docker-compose.yml up -d
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

   Increase Docker memory limit in Docker Desktop settings, or add memory limits to `docker/docker-compose.yml`:

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
docker compose -f docker/docker-compose.yml ps
docker inspect --format='{{.State.Health.Status}}' "$(docker compose -f docker/docker-compose.yml ps -q app)"
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
- Docker stats: `docker stats "$(docker compose -f docker/docker-compose.yml ps -q app)"`
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
     reverse_proxy app:3000 {
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
