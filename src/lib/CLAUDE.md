# Omnidev — Library Modules

> Omnidev is a single developer bot orchestration runtime. See root `CLAUDE.md` for project identity and architectural constraints.

Core business logic organized by domain. Each module has an `index.ts` barrel export.

## Module Overview

| Module        | Purpose                          | Server-Only |
| ------------- | -------------------------------- | ----------- |
| `types/`      | Core type definitions            | No          |
| `claudeCode/` | Claude Code CLI integration      | Yes         |
| `git/`        | Git operations via simple-git    | Yes         |
| `gitlab/`     | GitLab API via @gitbeaker/rest   | Yes         |
| `github/`     | GitHub API via @octokit/rest     | Yes         |
| `queue/`      | File-based job queue             | Yes         |
| `workspace/`  | Workspace management actions     | Yes         |
| `managers/`   | Resource managers                | Yes         |
| `auth/`       | Authentication middleware        | Yes         |
| `config/`     | App configuration                | Mixed       |
| `api/`        | API utilities and Zod validation | Yes         |
| `dashboard/`  | Dashboard helpers                | Yes         |
| `docs/`       | Documentation utilities          | Yes         |
| `common/`     | Shared utilities and types       | No          |

## Core Patterns

### Barrel Exports

Each module exposes its public API via `index.ts`:

```typescript
// lib/git/index.ts
export type { GitCloneOptions, GitBranchInfo } from '@/lib/git/types';
export { GitOperations } from '@/lib/git/index';
export { getCurrentBranch, switchBranch } from '@/lib/git/branches';
```

### Result Type Pattern

All fallible operations return `Result<T, E>`:

```typescript
// Defined in lib/types/index.ts
type Result<T, E = Error> = { success: true; data: T } | { success: false; error: E };

type AsyncResult<T, E = Error> = Promise<Result<T, E>>;

// Usage pattern
export async function loadWorkspace(id: WorkspaceId): AsyncResult<Workspace> {
  try {
    const workspace = await fetchWorkspace(id);
    return { success: true, data: workspace };
  } catch (error) {
    return { success: false, error: new Error(`Failed to load: ${error}`) };
  }
}

// Consuming
const result = await loadWorkspace(id);
if (!result.success) {
  console.error(result.error.message);
  return;
}
const workspace = result.data; // TypeScript knows this is Workspace
```

### Server-Only Code

Modules that must run server-side use the `'use server'` directive:

```typescript
'use server';

import { writeFile } from 'node:fs/promises';

export async function saveData(data: string): AsyncResult<void> {
  // This can only run on the server
  await writeFile('/path/to/file', data);
  return { success: true, data: undefined };
}
```

## Module Details

### `types/` - Type Definitions

Central type definitions used throughout the application.

**Key Types:**

```typescript
// Branded types for type safety
type WorkspaceId = string & { readonly brand: unique symbol };
type GitUrl = string & { readonly brand: unique symbol };
type FilePath = string & { readonly brand: unique symbol };
type CommitHash = string & { readonly brand: unique symbol };

// Domain types
interface Workspace {
  id: WorkspaceId;
  path: FilePath;
  repoUrl: GitUrl;
  targetBranch: string;
  createdAt: Date;
  lastAccessed: Date;
  metadata?: WorkspaceMetadata;
}

// Configuration types
interface AppConfig {
  gitlab;
  claude;
  workspace;
  security;
  logging;
}
interface ClientSafeAppConfig {
  /* sensitive data removed */
}

// Error types
class WorkspaceError extends Error {
  code: WorkspaceErrorCode;
  workspaceId?: WorkspaceId;
}
```

### `claudeCode/` - Claude Code Integration

Orchestrates Claude Code CLI execution in a sandboxed environment.

**Key Files:**
| File | Purpose |
|------|---------|
| `orchestrator.ts` | Main `askClaudeCode()` function |
| `git-workflow.ts` | Branch creation for edit operations |
| `post-execution.ts` | Handle commits/MRs after execution |
| `availability.ts` | Check if CLI is installed |
| `version.ts` | Get CLI version |
| `types.ts` | Options and result types |

**Usage:**

```typescript
import { askClaudeCode, checkClaudeCodeAvailability } from '@/lib/claudeCode';

// Check availability
const available = await checkClaudeCodeAvailability();
if (!available.success || !available.data) {
  throw new Error('Claude Code not available');
}

// Execute
const result = await askClaudeCode({
  question: 'Explain this function',
  workingDirectory: '/app/workspaces/my-repo',
  workspaceId: 'ws_123' as WorkspaceId,
});

if (result.success) {
  console.log(result.data.output);
  console.log(`JSON logs: ${result.data.jsonLogs?.length}`);
}
```

### `git/` - Git Operations

Wraps simple-git library with typed operations.

**Key Files:**
| File | Purpose |
|------|---------|
| `branches.ts` | Branch CRUD operations |
| `commits.ts` | Commit operations |
| `remotes.ts` | Pull/push operations |
| `prepare.ts` | Workspace preparation for edit operations |
| `ref-sync.ts` | Remote ref verification and sync helpers |
| `workspace.ts` | Clean/reset workspace |
| `config.ts` | Git config management |
| `sandbox.ts` | Sandboxed git binary path |
| `core.ts` | Core simple-git instance creation |
| `provider-detection.ts` | GitHub/GitLab URL detection |

**Usage:**

```typescript
import { getCurrentBranch, switchBranch, hasUncommittedChanges } from '@/lib/git';

const branch = await getCurrentBranch(workspacePath);
const hasChanges = await hasUncommittedChanges(workspacePath);

if (!hasChanges) {
  await switchBranch(workspacePath, 'feature-branch');
}
```

**Workspace Preparation:**

```typescript
import { prepareWorkspaceForEdit } from '@/lib/git';

// Ensures clean, synced state before edit operations
const result = await prepareWorkspaceForEdit(workspacePath, 'main');
if (result.success) {
  console.log(`Prepared on branch: ${result.data.targetBranch}`);
  console.log(`Deleted ${result.data.deletedBranches.length} stale branches`);
}
```

**Remote Ref Sync (Internal):**

The `ref-sync.ts` module provides helpers to detect and fix stale local refs:

```typescript
import { ensureFreshRemoteRef, verifySyncState } from '@/lib/git';

// Ensures local origin/branch ref matches actual remote state
const syncResult = await ensureFreshRemoteRef(git, branchName, '[LOG PREFIX]');
if (syncResult.wasStale) {
  console.log('Local ref was stale and has been updated');
}

// Verifies HEAD matches origin/branch after sync
const isInSync = await verifySyncState(git, branchName, '[LOG PREFIX]');
```

### `gitlab/` - GitLab API

GitLab API integration using @gitbeaker/rest.

**Key Exports:**

```typescript
// API operations
export { getProject, getProjectBranches, getProjectMergeRequests } from './api';
export { createMergeRequest } from './merge-requests';

// Configuration
export { loadGitLabConfig, getGitLabConfig } from './config';

// Utilities
export { extractProjectIdFromUrl, formatMergeRequestDescription } from './utils';
```

**Usage:**

```typescript
import { createMergeRequest, getProject } from '@/lib/gitlab';

const project = await getProject(projectId);
const mr = await createMergeRequest({
  projectId,
  title: 'Feature: Add new component',
  description: 'AI-generated changes',
  sourceBranch: 'claude/feature-123',
  targetBranch: 'main',
});
```

### `github/` - GitHub API

GitHub API integration using @octokit/rest.

**Key Files:**
| File | Purpose |
|------|---------|
| `types.ts` | GitHub-specific type definitions |
| `api.ts` | URL parsing, repository operations |
| `pull-requests.ts` | Pull request creation |
| `index.ts` | Barrel exports |

**Key Exports:**

```typescript
// API operations
export { extractOwnerRepoFromUrl, getRepository, getRepositoryBranches } from './api';
export { createPullRequest, formatPullRequestDescription } from './pull-requests';

// Types
export type { CreatePullRequestParams, GitHubPullRequest } from './types';
```

**Usage:**

```typescript
import { createPullRequest, extractOwnerRepoFromUrl } from '@/lib/github';

const ownerRepo = extractOwnerRepoFromUrl('https://github.com/owner/repo');
if (ownerRepo) {
  const pr = await createPullRequest({
    owner: ownerRepo.owner,
    repo: ownerRepo.repo,
    title: 'Feature: Add new component',
    body: 'AI-generated changes',
    head: 'claude/feature-123',
    base: 'main',
  });
}
```

### `queue/` - Job Queue

File-based job queue with execute-or-queue semantics.

**Key Concepts:**

- Jobs stored as JSON files in `data/jobs/`
- If no job running: execute immediately, return result
- If job running: queue for background processing, return job ID
- Poll `/api/jobs/:jobId` for queued job results

**Key Types:**

```typescript
type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';
type JobType = 'claude-code' | 'git-push' | 'git-mr' | 'workspace-cleanup';

interface Job<T, R> {
  id: JobId;
  type: JobType;
  status: JobStatus;
  payload: T;
  result?: R;
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}
```

**Usage:**

```typescript
import { executeOrQueue, getJob } from '@/lib/queue';

// Execute or queue a job
const execution = await executeOrQueue('claude-code', {
  workspaceId,
  workspacePath,
  question,
  repoUrl,
});

if (execution.immediate) {
  // Job ran immediately
  return execution.result;
} else {
  // Job was queued - poll for results
  return { jobId: execution.jobId, message: 'Poll /api/jobs/:jobId' };
}

// Later: check job status
const job = await getJob(jobId);
if (job?.status === 'completed') {
  return job.result;
}
```

### `managers/` - Resource Managers

High-level resource management.

**workspace-manager.ts:**

```typescript
// Workspace CRUD with persistent JSON storage
export {
  initializeWorkspaceManager,
  saveWorkspace,
  loadWorkspace,
  getAllWorkspaces,
  deleteWorkspace,
  workspaceExists,
} from './workspace-manager';
```

**repository-manager.ts:**

```typescript
// Git repository operations
export {
  cloneRepository,
  initializeBranchForEdits,
  // ...
} from './repository-manager';
```

### `auth/` - Authentication

Authentication middleware and utilities.

**middleware.ts:**

```typescript
import { withAuth } from '@/lib/auth/middleware';

// In API route
export async function POST(request: NextRequest) {
  const authResult = await withAuth(request);
  if (!authResult.success) {
    return authResult.response!; // 401, 403, or 429
  }

  const { userId, clientName } = authResult.auth!;
  // Proceed with authenticated request
}
```

**Supports:**

- NextAuth session (web UI)
- API key (`X-API-Key` header)
- IP whitelisting
- Rate limiting

### `api/` - API Utilities

Zod validation schemas and utilities.

**route-validation.ts:**

```typescript
import { validateAndParseAskRouteParams } from '@/lib/api/route-validation';

// In API route
const result = validateAndParseAskRouteParams(body, 'ASK API');
if (!result.success) {
  return result.error!; // NextResponse with 400 status
}
const { workspaceId, question, context } = result.data!;
```

### `config/` - Configuration

Application configuration management.

**Key Files:**
| File | Purpose |
|------|---------|
| `server-actions.ts` | Server-side config loading |
| `client-settings.ts` | Client-safe config subset |
| `settings.ts` | Config initialization |
| `types.ts` | Config type definitions |

**Usage:**

```typescript
// Server-side
import { getClientSafeConfig } from '@/lib/config/server-actions';
const config = await getClientSafeConfig();

// Client-side (via hook)
import { useEnvironmentConfig } from '@/hooks';
const { config, loading } = useEnvironmentConfig();
```

## Adding a New Module

1. Create directory under `lib/`
2. Add `types.ts` for type definitions
3. Add implementation files
4. Add `index.ts` barrel export
5. Use `'use server'` if server-only
6. Return `Result<T, E>` for fallible operations
7. Add to this CLAUDE.md

```typescript
// lib/mymodule/types.ts
export interface MyOptions {
  /* ... */
}
export interface MyResult {
  /* ... */
}

// lib/mymodule/implementation.ts
('use server');
import type { AsyncResult } from '@/lib/types/index';
import type { MyOptions, MyResult } from './types';

export async function myFunction(options: MyOptions): AsyncResult<MyResult> {
  // Implementation
}

// lib/mymodule/index.ts
export type { MyOptions, MyResult } from './types';
export { myFunction } from './implementation';
```
