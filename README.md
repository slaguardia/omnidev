# Workflow Manager

A powerful TypeScript Next.js application that manages GitLab repositories with AI-powered code analysis through Claude Code integration. This tool provides intelligent workspace management, web-based configuration, and natural language interactions with codebases.

## 🚀 Features

- **Repository Management**: Clone and manage GitLab repositories in temporary workspaces
- **AI-Powered Analysis**: Integrate with Claude Code for intelligent code review and suggestions
- **Web Interface**: Modern Next.js dashboard for easy configuration and management
- **Natural Language Queries**: Ask questions about your codebase in plain English
- **Workspace Isolation**: Secure temporary workspace management
- **TypeScript First**: Full type safety with comprehensive type definitions
- **Docker Ready**: Fully containerized with optimized builds

## 📁 Project Structure

```
workflow/
├── package.json              # Project configuration and dependencies
├── tsconfig.json             # TypeScript configuration
├── next.config.js            # Next.js configuration
├── tailwind.config.ts        # Tailwind CSS configuration
├── docker-compose.yml        # Docker orchestration
├── Dockerfile               # Production Docker build
├── .gitignore               # Git ignore patterns
├── README.md                # This file
├── src/                     # Source code
│   ├── app/                 # Next.js app directory
│   │   ├── api/            # API routes
│   │   ├── dashboard/      # Dashboard pages
│   │   ├── docs/           # Documentation pages
│   │   └── globals.css     # Global styles
│   ├── components/         # React components
│   │   ├── dashboard/      # Dashboard-specific components
│   │   ├── NavBar.tsx      # Navigation component
│   │   └── ThemeSwitch.tsx # Theme toggle
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Core business logic
│   │   ├── auth/           # Authentication
│   │   ├── claudeCode/     # Claude Code integration
│   │   ├── config/         # Configuration management
│   │   ├── git/            # Git operations
│   │   ├── gitlab/         # GitLab API client
│   │   ├── managers/       # Workspace and repository managers
│   │   └── workspace/      # Workspace utilities
│   └── middleware.ts       # Next.js middleware
├── docs/                   # Documentation
│   ├── API_AUTHENTICATION.md
│   ├── CREDENTIALS.md
│   ├── DOCKER.md
│   └── MERGE_REQUEST_AUTOMATION.md
└── workspaces/            # Temporary workspace directory
```

## 🛠️ Installation

### Prerequisites

- Node.js 18.0.0 or higher
- pnpm (recommended package manager)
- Git
- Docker Desktop (for containerized deployment)
- Claude Code CLI (optional, for AI features)

### Quick Start

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd workflow
   ```

2. **Install dependencies:**
   ```bash
   pnpm install
   ```

3. **Start the development server:**
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

If you prefer environment variables, create a `.env` file:

```env
# Optional - All settings can be configured through the UI
GITLAB_URL=https://gitlab.com
GITLAB_TOKEN=your_gitlab_token_here
CLAUDE_API_KEY=your_claude_api_key_here
CLAUDE_CODE_PATH=claude-code
MAX_WORKSPACE_SIZE_MB=500
TEMP_DIR_PREFIX=gitlab-claude-
LOG_LEVEL=info
ALLOWED_GITLAB_HOSTS=gitlab.com
MAX_CONCURRENT_WORKSPACES=3
```

Environment variables will appear as defaults in the Settings UI and can be overridden there.

## 🐳 Docker Deployment

The application is fully dockerized with optimized builds for both development and production.

### Prerequisites

- Docker Desktop installed on your system
- Git configured with proper line endings (important for Windows users)

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

### Line Endings Important Note

**Windows users**: Docker containers expect Unix-style line endings (LF). Configure Git properly to avoid issues:

```bash
git config --global core.autocrlf false
git config --global core.eol lf
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

For detailed Docker documentation and troubleshooting, see [DOCKER.md](docs/DOCKER.md).

## 🎯 Usage

### Web Interface

The primary interface is the web dashboard accessible at `http://localhost:3000`:

1. **Dashboard**: Overview of workspaces and operations
2. **Settings**: Configure GitLab and Claude integration
3. **Workspaces**: Manage active workspace sessions
4. **Operations**: Monitor running tasks and history

### Development Mode

```bash
# Start in development mode
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start
```

### API Endpoints

The application provides REST API endpoints for programmatic access:

- `GET /api/config/status` - Check configuration status
- `POST /api/ask` - Submit natural language queries
- `GET /api/auth/session` - Get current session info

## 🏗️ Architecture

### Core Components

1. **WorkspaceManager**: Manages temporary workspace lifecycle
2. **RepositoryManager**: Handles GitLab repository operations
3. **ClaudeClient**: Integrates with Claude Code CLI and API
4. **GitLabClient**: Interfaces with GitLab API
5. **AuthSystem**: Handles authentication and session management

### Technology Stack

- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS
- **Backend**: Next.js API routes, Node.js
- **Database**: File-based configuration storage
- **Container**: Docker with Ubuntu base image
- **Authentication**: NextAuth.js integration

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

## 🔒 Security

- **Sandbox Isolation**: Each workspace runs in isolation
- **URL Validation**: Strict validation of GitLab URLs
- **Size Limits**: Configurable workspace size limits
- **Access Control**: Token-based GitLab access
- **Path Traversal Protection**: Secure file system operations
- **Authentication**: Secure session management

## 📈 Performance

- **Workspace Isolation**: Secure temporary workspace management
- **React Server Components**: Optimized rendering
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
- Use pnpm for package management

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
type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };
```

## 🔄 Roadmap

- [x] **Phase 1**: Core repository management
- [x] **Phase 2**: Web interface and dashboard
- [x] **Phase 3**: Docker containerization
- [ ] **Phase 4**: Advanced Claude Code integration
- [ ] **Phase 5**: Enhanced git workflow automation
- [ ] **Phase 6**: Multi-provider support (GitHub, Bitbucket)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Claude Code](https://claude.ai) for AI-powered code analysis
- [GitLab](https://gitlab.com) for repository hosting
- [Next.js](https://nextjs.org) for the React framework
- [TypeScript](https://typescriptlang.org) for type safety
- [Tailwind CSS](https://tailwindcss.com) for styling
- [Docker](https://docker.com) for containerization

## 📞 Support

- Create an issue for bug reports
- Start a discussion for feature requests
- Check the [documentation](docs/) for detailed guides
- Review the dashboard UI for configuration help

---

**Note**: This application provides a modern web interface for managing GitLab repositories with AI assistance. The core functionality is implemented and ready for use. Advanced features and integrations are continuously being added.
