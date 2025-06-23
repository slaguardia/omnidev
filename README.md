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
- npm or yarn
- Git
- Claude Code CLI (optional, for AI features)

### Setup

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd gitlab-claude-manager
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Build the project:**
   ```bash
   npm run build
   ```

## ⚙️ Configuration

Create a `.env` file in the project root:

```env
# GitLab Configuration
GITLAB_URL=https://gitlab.com
GITLAB_TOKEN=your_gitlab_token_here

# Claude Configuration
CLAUDE_API_KEY=your_claude_api_key_here
CLAUDE_CODE_PATH=/usr/local/bin/claude-code

# Application Settings
MAX_WORKSPACE_SIZE_MB=1000
# CACHE_EXPIRY_DAYS removed - no longer using caching
TEMP_DIR_PREFIX=gitlab-claude-
LOG_LEVEL=info

# Security Settings
ALLOWED_GITLAB_HOSTS=gitlab.com,your-internal-gitlab.com
MAX_CONCURRENT_WORKSPACES=5
```

## 🎯 Usage

### Development Mode

```bash
# Start in development mode
npm run dev

# Or run specific commands
npm run dev -- clone https://gitlab.com/user/repo.git
npm run dev -- analyze workspace-id
npm run dev -- list
```

### Production Mode

```bash
# Build and run
npm run build
npm start

# Or use the CLI directly
node dist/index.js clone https://gitlab.com/user/repo.git
node dist/index.js analyze workspace-id
```

### CLI Commands

#### Clone Repository
```bash
# Clone a repository
npm run dev -- clone https://gitlab.com/user/repo.git

# Clone specific branch
npm run dev -- clone https://gitlab.com/user/repo.git --branch feature-branch

# Shallow clone
npm run dev -- clone https://gitlab.com/user/repo.git --depth 1
```

#### Analyze Workspace
```bash
# Analyze entire workspace
npm run dev -- analyze workspace-id

# Analyze specific directory
npm run dev -- analyze workspace-id --directory src/

# Analyze with language hint
npm run dev -- analyze workspace-id --language TypeScript
```

#### List Workspaces
```bash
# List active workspaces
npm run dev -- list

# List all workspaces
npm run dev -- list --all
```

#### Workspace Cleanup
```bash
# Clean up workspaces
npm run dev -- cleanup

# Clean specific workspace
npm run dev -- cleanup workspace-id

# Force cleanup
npm run dev -- cleanup --all --force
```

#### Natural Language Queries
```bash
# Ask questions about your codebase
npm run dev -- ask workspace-id "What are the main components in this project?"
npm run dev -- ask workspace-id "How can I improve the performance of this code?"
npm run dev -- ask workspace-id "Are there any security vulnerabilities?"
```

## 🏗️ Architecture

### Core Components

1. **RepositoryManager**: Handles GitLab repository operations
2. **WorkspaceManager**: Manages temporary workspace lifecycle

4. **ClaudeClient**: Integrates with Claude Code CLI and API
5. **GitLabClient**: Interfaces with GitLab API

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
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- --testNamePattern="RepositoryManager"
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
type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };
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
