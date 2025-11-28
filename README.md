# GitLab Claude Manager

A powerful TypeScript Node.js application that manages GitLab repositories with AI-powered code analysis through Claude Code integration. This tool provides intelligent caching, temporary workspace management, and natural language interactions with codebases.

## 🚀 Features

- **Repository Management**: Clone and manage GitLab repositories in temporary workspaces
- **AI-Powered Analysis**: Integrate with Claude Code for intelligent code review and suggestions

- **Natural Language Queries**: Ask questions about your codebase in plain English
- **Workspace Isolation**: Secure temporary workspace management
- **TypeScript First**: Full type safety with comprehensive type definitions
- **CLI Interface**: Intuitive command-line interface for all operations

## 📁 Project Structure

```
gitlab-claude-manager/
├── package.json              # Project configuration and dependencies
├── tsconfig.json             # TypeScript configuration
├── jest.config.js            # Jest testing configuration
├── .gitignore               # Git ignore patterns
├── README.md                # This file
├── src/                     # Source code
│   ├── index.ts            # Main CLI entry point
│   ├── types/              # Type definitions
│   │   └── index.ts        # Core type definitions
│   ├── managers/           # Core business logic
│   │   ├── RepositoryManager.ts  # Repository operations
│   │   ├── WorkspaceManager.ts   # Workspace handling

│   ├── utils/              # Utility functions
│   │   ├── gitOperations.ts     # Git utilities
│   │   ├── fileSystem.ts        # File system utilities
│   │   └── security.ts          # Security validation
│   ├── api/                # External API integrations
│   │   ├── gitlabClient.ts      # GitLab API client
│   │   └── claudeClient.ts      # Claude Code integration
│   └── config/             # Configuration management
│       └── settings.ts          # Environment configuration
├── dist/                   # Compiled JavaScript output
├── tests/                  # Test files
│   ├── unit/              # Unit tests
│   └── integration/       # Integration tests
├── examples/              # Usage examples
└── docs/                  # Documentation
```

## 🛠️ Installation

### Prerequisites

- Node.js 18.0.0 or higher
- pnpm (or npm/yarn as alternatives)
- Git
- Claude Code CLI (optional, for AI features)
- Docker (optional, for containerized deployment)

### Quick Start

1. **Clone the repository:**

   ```bash
   git clone <repository-url>
   cd gitlab-claude-manager
   ```

2. **Install dependencies:**

   ```bash
   pnpm install
   ```

3. **Start the application:**

   ```bash
   pnpm dev
   ```

4. **Configure through UI:**
   - Open your browser to `http://localhost:3000`
   - Navigate to the Dashboard
   - Go to Settings tab
   - Enter your GitLab Token and Claude API Key
   - Save configuration

That's it! No environment variables required to get started.

## ⚙️ Configuration

### UI-Based Configuration (Recommended)

All configuration is managed through the web interface:

1. **Required Settings:**

   - **GitLab Token**: Your GitLab personal access token
   - **Claude API Key**: Your Claude/Anthropic API key

2. **Optional Settings:**
   - **GitLab URL**: Default is `https://gitlab.com`
   - **Claude Code Path**: Default is `claude-code`
   - **Workspace Limits**: Configurable size and concurrency limits
   - **Logging Level**: Choose from debug, info, warn, error

### Environment Variables (Optional)

If you prefer environment variables, copy the example file and configure:

```bash
cp docs/.env.example .env
# Edit .env with your values
```

**Required variables:**

```env
# NextAuth Configuration
NEXTAUTH_SECRET=your-nextauth-secret-here  # Generate with: openssl rand -base64 32
NEXTAUTH_URL=http://localhost:3000
```

**Optional variables** (can also be configured via UI):

```env
# API Authentication
VALID_API_KEYS=client-key-1,client-key-2
ADMIN_API_KEY=admin-secret-key-here
API_RATE_LIMIT=100
ALLOWED_IPS=192.168.1.100,10.0.0.50  # or * for all

# Service Integration
GITLAB_TOKEN=your_gitlab_token_here
ANTHROPIC_API_KEY=your_claude_api_key_here

# Advanced Configuration
GITLAB_URL=https://gitlab.com
MAX_WORKSPACE_SIZE_MB=500
MAX_CONCURRENT_WORKSPACES=3
LOG_LEVEL=info
```

📚 **For complete documentation, see [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md)**

## 🐳 Docker Deployment

The application is fully dockerized with optimized builds for both development and production.

### Quick Start with Docker

1. **Production deployment:**

   ```bash
   # Build and run with Docker Compose
   docker-compose up --build -d

   # Access the application at http://localhost:3000
   ```

2. **Development with Docker:**
   ```bash
   # Uncomment the workflow-dev service in docker-compose.yml
   docker-compose up workflow-dev --build
   ```

### Manual Docker Commands

```bash
# Build the production image
docker build -t workflow-app .

# Run the container
docker run -p 3000:3000 \
  -v workflow_workspaces:/app/workspaces \
  --name workflow-app \
  workflow-app

# Run with environment variables
docker run -p 3000:3000 \
  -e GITLAB_TOKEN=your_token \
  -e CLAUDE_API_KEY=your_key \
  -v workflow_workspaces:/app/workspaces \
  workflow-app
```

### Docker Features

- ✅ **Ubuntu-based** - Full Claude Code compatibility
- ✅ **Multi-stage build** - Optimized image size
- ✅ **Security** - Runs as non-root user
- ✅ **Persistence** - Workspace data preserved
- ✅ **Health checks** - Built-in monitoring
- ✅ **Development mode** - Hot reloading support

### Testing Docker Installation

After building your Docker image, run these tests:

#### 1. Verify Core Dependencies

```bash
# Test Node.js installation
docker run --rm workflow-app node --version

# Test npm/pnpm
docker run --rm workflow-app npm --version
docker run --rm workflow-app pnpm --version

# Test Python (for native modules)
docker run --rm workflow-app python3 --version

# Test Git
docker run --rm workflow-app git --version
```

#### 2. Test Claude Code Installation

```bash
# Verify Claude Code is installed
docker run --rm workflow-app claude-code --version

# Test Claude Code help
docker run --rm workflow-app claude-code --help
```

#### 3. Test Application Health

```bash
# Start the container in background
docker-compose up -d

# Test application is responding
curl http://localhost:3000

# Test health endpoint
curl http://localhost:3000/api/config/validate

# Test settings API
curl http://localhost:3000/api/config/status
```

#### 4. Test Workspace Operations

```bash
# Access container shell
docker-compose exec workflow-app sh

# Inside container, test workspace directory
ls -la /app/workspaces

# Test file permissions
touch /app/workspaces/test-file
ls -la /app/workspaces/test-file
rm /app/workspaces/test-file
```

#### 5. Test with Sample Environment

```bash
# Create test environment file
cat > .env.test << EOF
GITLAB_URL=https://gitlab.com
CLAUDE_CODE_PATH=claude-code
LOG_LEVEL=debug
MAX_WORKSPACE_SIZE_MB=100
EOF

# Run with test environment
docker run --rm -p 3000:3000 \
  --env-file .env.test \
  workflow-app
```

#### 6. Test Volume Persistence

```bash
# Start container
docker-compose up -d

# Create test data
docker-compose exec workflow-app sh -c "echo 'test data' > /app/workspaces/persistence-test.txt"

# Stop and restart container
docker-compose down
docker-compose up -d

# Verify data persists
docker-compose exec workflow-app cat /app/workspaces/persistence-test.txt

# Should output: test data
```

#### 7. Performance Testing

```bash
# Monitor resource usage
docker stats workflow-app

# Test memory limits (if configured)
docker-compose exec workflow-app sh -c "cat /sys/fs/cgroup/memory/memory.limit_in_bytes"

# Test build performance
time docker build -t workflow-app-test .
```

### Docker Troubleshooting

#### Common Issues & Solutions

1. **Claude Code installation fails:**

   ```bash
   # Check Ubuntu version
   docker run --rm workflow-app cat /etc/os-release

   # Manually test Claude Code installation
   docker run --rm -it workflow-app bash
   npm install -g @anthropic-ai/claude-code@latest
   ```

2. **Permission issues:**

   ```bash
   # Check user context
   docker-compose exec workflow-app whoami
   docker-compose exec workflow-app id

   # Fix workspace permissions
   docker-compose exec workflow-app chown -R nextjs:nodejs /app/workspaces
   ```

3. **Port conflicts:**

   ```bash
   # Check what's using port 3000
   lsof -i :3000

   # Use different port
   docker run -p 3001:3000 workflow-app
   ```

4. **Build failures:**

   ```bash
   # Clean build with no cache
   docker build --no-cache -t workflow-app .

   # Check build logs
   docker build -t workflow-app . 2>&1 | tee build.log
   ```

### Docker Logs & Monitoring

```bash
# View application logs
docker-compose logs -f workflow-app

# View last 100 lines
docker-compose logs --tail=100 workflow-app

# Monitor container health
docker inspect --format='{{.State.Health.Status}}' workflow-app

# Check container resources
docker-compose exec workflow-app sh -c "free -h && df -h"
```

For detailed Docker documentation, see [DOCKER.md](docs/DOCKER.md).

## 🎯 Usage

### Development Mode

```bash
# Start in development mode
pnpm dev

# Or run specific commands
pnpm dev -- clone https://gitlab.com/user/repo.git
pnpm dev -- analyze workspace-id
pnpm dev -- list
```

### Production Mode

```bash
# Build and run
pnpm build
pnpm start

# Or use the CLI directly
node dist/index.js clone https://gitlab.com/user/repo.git
node dist/index.js analyze workspace-id
```

### CLI Commands

#### Clone Repository

```bash
# Clone a repository
pnpm dev -- clone https://gitlab.com/user/repo.git

# Clone specific branch
pnpm dev -- clone https://gitlab.com/user/repo.git --branch feature-branch

# Shallow clone
pnpm dev -- clone https://gitlab.com/user/repo.git --depth 1
```

#### Analyze Workspace

```bash
# Analyze entire workspace
pnpm dev -- analyze workspace-id

# Analyze specific directory
pnpm dev -- analyze workspace-id --directory src/

# Analyze with language hint
pnpm dev -- analyze workspace-id --language TypeScript
```

#### List Workspaces

```bash
# List active workspaces
pnpm dev -- list

# List all workspaces
pnpm dev -- list --all
```

#### Workspace Cleanup

```bash
# Clean up workspaces
pnpm dev -- cleanup

# Clean specific workspace
pnpm dev -- cleanup workspace-id

# Force cleanup
pnpm dev -- cleanup --all --force
```

#### Natural Language Queries

```bash
# Ask questions about your codebase
pnpm dev -- ask workspace-id "What are the main components in this project?"
pnpm dev -- ask workspace-id "How can I improve the performance of this code?"
pnpm dev -- ask workspace-id "Are there any security vulnerabilities?"
```

## 🏗️ Architecture

### Core Components

1. **RepositoryManager**: Handles GitLab repository operations
2. **WorkspaceManager**: Manages temporary workspace lifecycle

3. **ClaudeClient**: Integrates with Claude Code CLI and API
4. **GitLabClient**: Interfaces with GitLab API

### Type System

The project uses a comprehensive TypeScript type system with:

- **Branded Types**: For better type safety (WorkspaceId, GitUrl, etc.)
- **Result Types**: For error handling without exceptions
- **Utility Types**: For common patterns and transformations
- **Discriminated Unions**: For different response types

### Claude Code Integration

The system integrates with Claude Code CLI for:

- Intelligent code analysis
- Natural language queries
- Code suggestions and improvements
- Automated git workflows
- Context-aware responses

## 🧪 Testing

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage

# Run specific test file
pnpm test -- --testNamePattern="RepositoryManager"
```

## 🔒 Security

- **Sandbox Isolation**: Each workspace runs in isolation
- **URL Validation**: Strict validation of GitLab URLs
- **Size Limits**: Configurable workspace size limits
- **Access Control**: Token-based GitLab access
- **Path Traversal Protection**: Secure file system operations

## 📈 Performance

- **Workspace Isolation**: Secure temporary workspace management
- **Lazy Loading**: Load components only when needed
- **Streaming Operations**: Handle large repositories efficiently
- **Concurrent Processing**: Parallel workspace operations
- **Memory Management**: Automatic cleanup of expired workspaces

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Development Guidelines

- Follow TypeScript strict mode
- Write comprehensive tests
- Use conventional commits
- Update documentation
- Ensure type safety

## 📚 API Documentation

### Core Types

```typescript
// Workspace management
interface Workspace {
  id: WorkspaceId;
  path: FilePath;
  repoUrl: GitUrl;
  branch: string;
  createdAt: Date;
  lastAccessed: Date;
}

// Git operations
interface GitInitResult {
  mergeRequestRequired: boolean;
  sourceBranch: string;
  targetBranch: string;
}

// Claude Code integration
interface ClaudeCodeResponse {
  analysis: string;
  suggestions: string[];
  modifiedFiles?: FilePath[];
  confidence: number;
}
```

### Error Handling

The project uses a Result type for consistent error handling:

```typescript
type Result<T, E = Error> = { success: true; data: T } | { success: false; error: E };
```

## 🔄 Roadmap

- [ ] **Phase 1**: Core repository management
- [ ] **Phase 2**: Claude Code integration
- [ ] **Phase 3**: Advanced git workflow automation
- [ ] **Phase 4**: Web interface
- [ ] **Phase 5**: Multi-provider support (GitHub, Bitbucket)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Claude Code](https://claude.ai) for AI-powered code analysis
- [GitLab](https://gitlab.com) for repository hosting
- [TypeScript](https://typescriptlang.org) for type safety
- [Commander.js](https://github.com/tj/commander.js) for CLI interface
- [Simple Git](https://github.com/steveukx/git-js) for Git operations

## 📞 Support

- Create an issue for bug reports
- Start a discussion for feature requests
- Check the documentation for common questions
- Review the examples for usage patterns

---

**Note**: This project is currently in development. Core functionality is being implemented progressively. The CLI interface is ready, and the TypeScript foundation is established. Implementation of repository management, caching, and Claude Code integration is in progress.
