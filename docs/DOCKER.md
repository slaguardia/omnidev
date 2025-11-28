# Docker Setup Guide

This guide will help you dockerize and run the Workflow Manager application using Docker.

## Files Overview

- `Dockerfile` - Production-optimized multi-stage build
- `Dockerfile.dev` - Development build with hot reloading
- `docker-compose.yml` - Orchestration for production and development
- `.dockerignore` - Excludes unnecessary files from Docker context

## Quick Start

### Production Build

1. **Build and run with Docker Compose:**

   ```bash
   docker-compose up --build -d
   ```

2. **Or build and run manually:**

   Build the image:

   ```bash
   docker build -t workflow-app .
   ```

   Run the container:

   ```bash
   docker run -p 3000:3000 --name workflow-app workflow-app
   ```

3. **Access the application:**
   Open http://localhost:3000 in your browser

### Development Setup

1. **Use the development service in docker-compose.yml:**

   First uncomment the workflow-dev service in docker-compose.yml, then:

   ```bash
   docker-compose -f docker-compose.yml up workflow-dev --build
   ```

2. **Or run development container manually:**

   Build development image:

   ```bash
   docker build -f Dockerfile.dev -t workflow-app-dev .
   ```

   Run with volume mounting for hot reloading:

   ```bash
   docker run -p 3000:3000 -v "$(pwd)":/app -v /app/node_modules --name workflow-dev workflow-app-dev
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
CLAUDE_API_KEY=your_claude_api_key_here
CLAUDE_CODE_PATH=claude-code
```

**Advanced Configuration:**

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
docker-compose up -d
```

Stop the application:

```bash
docker-compose down
```

View logs:

```bash
docker-compose logs -f workflow-app
```

Restart the application:

```bash
docker-compose restart workflow-app
```

Update and rebuild:

```bash
docker-compose up --build -d
```

### Development Commands

Access the container shell:

```bash
docker-compose exec workflow-app sh
```

Run tests inside container:

```bash
docker-compose exec workflow-app pnpm test
```

Check application health:

```bash
docker-compose exec workflow-app wget -qO- http://localhost:3000/api/config/validate
```

### Cleanup

Remove containers and networks:

```bash
docker-compose down
```

Remove containers, networks, and volumes:

```bash
docker-compose down -v
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

### Docker Swarm

Initialize swarm (if not already done):

```bash
docker swarm init
```

Deploy stack:

```bash
docker stack deploy -c docker-compose.yml workflow
```

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

   Change the port mapping in docker-compose.yml:

   ```yaml
   ports:
     - '3001:3000'
   ```

2. **Permission issues with workspaces:**

   Fix volume permissions:

   ```bash
   docker-compose exec workflow-app chown -R nextjs:nodejs /app/workspaces
   ```

3. **Build failures:**

   Clean build with no cache:

   ```bash
   docker-compose build --no-cache
   ```

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
docker-compose ps
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

## Next Steps

1. Set up CI/CD pipeline for automated builds
2. Configure monitoring and logging
3. Set up backup strategy for persistent data
4. Consider using a reverse proxy (nginx, traefik) for production

# VM Setup

✅ Prerequisites
Ubuntu VM (20.04, 22.04, etc.) running inside VirtualBox

You’re logged in with a user that has sudo privileges

Internet access on the VM

🔧 Step-by-Step: Install Docker Engine

1. Update packages
   bash
   Copy
   Edit
   sudo apt update && sudo apt upgrade -y
2. Install dependencies
   bash
   Copy
   Edit
   sudo apt install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release
3. Add Docker’s official GPG key
   bash
   Copy
   Edit
   sudo mkdir -p /etc/apt/keyrings

curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
 sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg 4. Set up the stable Docker repo
bash
Copy
Edit
echo \
 "deb [arch=$(dpkg --print-architecture) \
 signed-by=/etc/apt/keyrings/docker.gpg] \
 https://download.docker.com/linux/ubuntu \
 $(lsb_release -cs) stable" | \
 sudo tee /etc/apt/sources.list.d/docker.list > /dev/null 5. Update apt and install Docker
bash
Copy
Edit
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io 6. Post-install: Allow non-root usage (optional)
bash
Copy
Edit
sudo usermod -aG docker $USER
Then log out and log back in (or run newgrp docker) for changes to take effect.

7. Verify Docker is running
   bash
   Copy
   Edit
   docker version
   docker run hello-world
   🧠 Notes:
   If docker run hello-world works, Docker is ready.

If you're using a cloud-init VM or a minimal base image, you may need to manually install sudo or other dependencies.

Consider installing Docker Compose if needed:

bash
Copy
Edit
sudo apt install docker-compose-plugin

1. Add your user to the docker group:
   bash
   Copy
   Edit
   sudo usermod -aG docker $USER
2. Apply the group change:
   You must log out and log back in for the group change to take effect.
   Or, just run:

bash
Copy
Edit
newgrp docker
