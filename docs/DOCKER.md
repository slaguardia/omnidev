# Docker Setup Guide

This guide will help you dockerize and run the Workflow Manager application using Docker.

## Prerequisites

- Docker Desktop installed on your system
- Git configured with proper line endings (see Line Endings section below)

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
   ```bash
   # Build the image
   docker build -t workflow-app .
   
   # Run the container
   docker run -p 3000:3000 --name workflow-app workflow-app
   ```

3. **Access the application:**
   Open http://localhost:3000 in your browser

### Development Setup

1. **Use the development service in docker-compose.yml:**
   ```bash
   # Uncomment the workflow-dev service in docker-compose.yml first
   docker-compose -f docker-compose.yml up workflow-dev --build
   ```

2. **Or run development container manually:**
   ```bash
   # Build development image
   docker build -f Dockerfile.dev -t workflow-app-dev .
   
   # Run with volume mounting for hot reloading
   docker run -p 3000:3000 -v "$(pwd)":/app -v /app/node_modules --name workflow-dev workflow-app-dev
   ```

## Environment Variables

The application supports configuration through environment variables. You can:

1. **Use the Settings UI** (recommended) - All configuration can be done through the web interface
2. **Set environment variables** - Either in docker-compose.yml or via .env file

### Common Environment Variables

```bash
# GitLab Configuration
GITLAB_URL=https://gitlab.com
GITLAB_TOKEN=your_gitlab_token_here

# Claude Configuration  
CLAUDE_API_KEY=your_claude_api_key_here
CLAUDE_CODE_PATH=claude-code

# Advanced Configuration
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

```bash
# Start the application
docker-compose up -d

# Stop the application
docker-compose down

# View logs
docker-compose logs -f workflow-app

# Restart the application
docker-compose restart workflow-app

# Update and rebuild
docker-compose up --build -d
```

### Development Commands

```bash
# Access the container shell
docker-compose exec workflow-app sh

# Run tests inside container
docker-compose exec workflow-app pnpm test

# Check application health
docker-compose exec workflow-app wget -qO- http://localhost:3000/api/config/validate
```

### Cleanup

```bash
# Remove containers and networks
docker-compose down

# Remove containers, networks, and volumes
docker-compose down -v

# Remove all related images
docker rmi workflow-app workflow-app-dev

# Clean up dangling images
docker image prune
```

## Production Deployment

### Docker Swarm

```bash
# Initialize swarm (if not already done)
docker swarm init

# Deploy stack
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
          value: "production"
```

## Troubleshooting

### Common Issues

1. **Port already in use:**
   ```bash
   # Change the port mapping in docker-compose.yml
   ports:
     - "3001:3000"  # Use port 3001 instead
   ```

2. **Permission issues with workspaces:**
   ```bash
   # Fix volume permissions
   docker-compose exec workflow-app chown -R nextjs:nodejs /app/workspaces
   ```

3. **Build failures:**
   ```bash
   # Clean build with no cache
   docker-compose build --no-cache
   ```

4. **Memory issues:**
   ```bash
   # Increase Docker memory limit in Docker Desktop settings
   # Or add memory limits to docker-compose.yml
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

## Line Endings

**Important for Windows users:** Docker containers expect Unix-style line endings (LF) but Windows may create files with Windows-style line endings (CRLF). This can cause issues, especially with shell scripts.

### Common Issues

- `docker-entrypoint.sh` failing with `/bin/sh: bad interpreter`
- Container startup failures due to script execution errors
- Unexpected behavior in shell scripts

### Solutions

1. **Configure Git globally (recommended):**
   ```bash
   git config --global core.autocrlf false
   git config --global core.eol lf
   ```

2. **Fix existing files:**
   ```bash
   # On Windows with Git Bash
   dos2unix docker-entrypoint.sh
   dos2unix Dockerfile
   
   # Or using sed
   sed -i 's/\r$//' docker-entrypoint.sh
   ```

3. **VS Code/Cursor settings:**
   - Set "Files: Eol" to `\n` (LF)
   - Check the bottom-right corner of the editor and click "CRLF" to change to "LF"

4. **Add .gitattributes file:**
   ```gitattributes
   # Ensure Docker files always use LF
   Dockerfile text eol=lf
   docker-entrypoint.sh text eol=lf
   *.sh text eol=lf
   ```

### Verification

Check line endings in your files:
```bash
# Show line endings
file docker-entrypoint.sh
# Should show: ASCII text, with no \r characters

# Or use od command
od -c docker-entrypoint.sh | head
# Should not show \r characters
```