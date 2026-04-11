# Workspace Module

Focused, single-purpose modules for workspace management operations.

## 📁 Structure

```
src/lib/workspace/
├── storage.ts      # Persistent workspace storage operations
├── repository.ts   # Repository cloning and workspace management
├── git-config.ts   # Git configuration management
├── cleanup.ts      # Workspace cleanup operations
├── types.ts        # Workspace-specific types
└── index.ts        # Module exports
```

## 🔧 Core Modules

### `storage.ts`

Handles persistent workspace data storage and retrieval.

- `initializeWorkspaceStorage()` - Initialize storage system
- `saveWorkspace()`, `loadWorkspace()` - Workspace persistence
- `getAllWorkspaces()`, `deleteWorkspace()` - Workspace management

### `repository.ts`

Repository cloning and workspace lifecycle management.

- `cloneRepositoryAction()` - High-level repository cloning (recommended)
- `getWorkspaces()` - Get all workspaces with initialization
- `getWorkspace()`, `updateWorkspace()` - Workspace operations
- `cloneRepository()` - Low-level cloning function

### `git-config.ts`

Git configuration management for workspaces.

- `setWorkspaceGitConfig()` - Set git user/email/signing key
- `getWorkspaceGitConfig()` - Retrieve current git config
- `unsetWorkspaceGitConfig()` - Remove git configuration

### `cleanup.ts`

Workspace cleanup and maintenance operations.

- `cleanupWorkspace()` - Clean single workspace (recommended)
- `cleanupAllWorkspaces()` - Bulk cleanup operations
- `cleanupWorkspaceFiles()` - Low-level file cleanup
