## Overview

This document describes the sandboxing architecture implemented to isolate Claude Code from sensitive system executables while allowing the main application to retain full access to these tools.

## Problem Statement

Claude Code needs to run in a secure environment where it cannot:

- Execute git commands directly (ALL git operations must go through the app)
- Perform git operations that could compromise repository integrity
- Access git configuration or bypass the app's git workflow

However, Claude Code SHOULD be able to:

- Use standard tools like `rm`, `curl`, `wget` for file operations and downloads
- Perform file system operations within its workspace
- Execute build tools, package managers, and other development utilities

Meanwhile, the Next.js application must:

- Execute ALL git operations for repository management
- Maintain exclusive control over version control
- Manage workspaces and orchestrate Claude Code execution

## Solution Architecture

### Multi-Layer Security Approach

**Docker Container**

| Next.js App                              | Claude Code (Git Sandboxed)                 |
| ---------------------------------------- | ------------------------------------------- |
| **Uses:** `/opt/internal/bin/git` ✓      | **Blocked:** git (wrapper) ✗                |
| **Standard tools:** rm ✓, curl ✓, wget ✓ | **Accessible:** rm ✓, curl ✓, wget ✓, npm ✓ |

### Key Components

#### 1. Executable Isolation (Dockerfile)

**Location**: `/Dockerfile` (lines 20-31)

During Docker build:

1. Install git normally via apt (along with other tools)
2. Move ONLY git binary to `/opt/internal/bin/git`
3. Create blocking wrapper script at `/usr/bin/git`
4. Leave rm, curl, wget, and other tools in their standard locations

**SANDBOX SETUP**: Isolate git from Claude Code - only block git access since Claude Code needs rm, curl, wget for operations:

```dockerfile
RUN mkdir -p /opt/internal/bin \
    && mv /usr/bin/git /opt/internal/bin/git \
    && chmod 755 /opt/internal/bin/git
```

Create blocking wrapper script for git only:

```dockerfile
RUN echo '#!/bin/bash\necho "[BLOCKED] git access denied"\nexit 1' > /usr/bin/git \
    && chmod 755 /usr/bin/git
```

**Result**:

- Claude Code finds `/usr/bin/git` but it's a blocking script
- Claude Code can use `rm`, `curl`, `wget` normally
- Application uses `/opt/internal/bin/git` for all git operations

#### 2. Claude Code Wrapper Script

**Location**: `/claude-code-wrapper.sh`

A bash script that:

- Validates workspace path
- Restricts PATH to safe directories only
- Removes git-related environment variables
- Executes Claude Code with restricted permissions
- Changes to workspace directory before execution

**Usage**:

```bash
/usr/local/bin/claude-code-wrapper /app/workspaces/my-project [args...]
```

**Security Features**:

- `PATH` restricted to `/usr/local/bin:/bin:/usr/bin` (no `/opt/internal/bin`)
- `GIT_CONFIG_*` variables nullified
- Working directory enforced
- Optional resource limits (ulimit)

#### 3. Sandboxed Git Configuration

**Location**: `/src/lib/git/sandbox.ts`

TypeScript module that:

- Configures `simple-git` to use `/opt/internal/bin/git`
- Provides `createSandboxedGit()` function
- Exports paths to internal executables
- Validates git binary accessibility

**Key Functions**:

```typescript
// Create git instance with internal binary
const git = createSandboxedGit('/app/workspaces/repo');

// Get path to internal executable
const gitPath = getInternalExecutable('git');

// Check if sandbox is enabled
const isSandbox = isSandboxEnabled();
```

#### 4. Application Integration

**Location**: `/src/lib/git/core.ts`

All git operations in the application use the sandboxed git instance:

```typescript
import { createSandboxedGit } from '@/lib/git/sandbox';

function createGitInstance(workingDirectory?: string): SimpleGit {
  return createSandboxedGit(workingDirectory || process.cwd());
}
```

#### 5. Claude Code Execution

**Location**: `/src/lib/claudeCode/orchestrator.ts`

Uses the sandbox wrapper with defaults defined in code:

```typescript
const wrapperPath = process.env.CLAUDE_CODE_WRAPPER || '/usr/local/bin/claude-code-wrapper';
const command = `${wrapperPath} ${workspacePath} --verbose -p "..."`;
```

## Workflow Example

### When Claude Code Executes

1. **User initiates Claude Code request** → API endpoint
2. **Application calls** `askClaudeCode(question, options)`
3. **Spawns process** using wrapper:

   ```bash
   /usr/local/bin/claude-code-wrapper /app/workspaces/repo -p "question"
   ```

4. **Wrapper script**:
   - Validates workspace path
   - Sets restricted PATH
   - Changes to workspace directory
   - Executes `claude-code` with args
5. **Claude Code attempts** to run `git` command
6. **PATH lookup finds** `/usr/bin/git` (blocking wrapper)
7. **Wrapper returns** error: `[BLOCKED] git access denied`
8. **Claude Code cannot** perform git operations ✓

### When Application Uses Git

1. **Application code** needs to clone repo
2. **Calls** `cloneRepository(url, path)`
3. **Function uses** `createGitInstance(path)`
4. **Creates** sandboxed git instance:

   ```typescript
   return simpleGit({ binary: '/opt/internal/bin/git' });
   ```

5. **simple-git library** calls `/opt/internal/bin/git` directly
6. **Real git binary** executes successfully ✓

## Security Benefits

### ✅ What Claude Code CANNOT Do

- Execute git commands (completely blocked)
- Perform any version control operations
- Access git configuration or history
- Bypass the app's git workflow
- Modify PATH to access internal git binary
- Break git isolation via environment manipulation

### ✅ What Claude Code CAN Do

- Delete, move, and manage files with `rm`, `mv`, etc.
- Download dependencies with `curl`, `wget`
- Run build tools (npm, pip, cargo, etc.)
- Execute tests and development scripts
- Perform all file operations within workspace
- Use all standard Unix utilities (except git)

### ✅ What Application CAN Do

- Full exclusive control over git operations
- Clone, commit, push, pull repositories
- Manage branches and merge requests
- Control all version control workflows
- Orchestrate Claude Code execution safely
- Monitor and audit all changes

### ✅ Defense in Depth

1. **Git binary isolation** - Real git moved to `/opt/internal/bin/`
2. **Blocking wrapper** - `/usr/bin/git` returns error
3. **PATH restriction** - `/opt/internal/bin` excluded from Claude's PATH
4. **Environment sanitization** - All git-related env vars removed/nullified
5. **Working directory enforcement** - Claude restricted to workspace
6. **Non-root user** - Limited system access (nextjs:nodejs)
7. **Application-only git config** - `simple-git` configured with internal binary path

## Testing the Sandbox

### Automated CI/CD Testing

The sandbox security is automatically verified in every CI/CD pipeline run:

**GitLab CI Pipeline Stage**: `docker-test`
**Job**: `docker-sandbox-verify`

This job:

1. Builds the Docker image
2. Starts a container with sandbox enabled
3. Runs the comprehensive verification script
4. Performs individual security checks:
   - Git command blocking
   - Internal git binary accessibility
   - Standard tools (curl, wget) accessibility
5. Reports pass/fail status
6. Cleans up test container

**Configuration**: `.gitlab-ci.yml` lines 127-188

**When it runs**:

- Every push to `master` or `main` branch
- Every merge request
- After successful build stage

**View Results**:

- GitLab → CI/CD → Pipelines → Select pipeline
- Look for `docker-test` stage
- Click `docker-sandbox-verify` job

### Manual Verification

#### Verify Git Blocking

SSH into container and test as nextjs user (Claude Code's context):

```bash
docker exec -it workflow-app bash
git --version
```

Expected: `[BLOCKED] git access denied - use app API instead`

#### Verify Application Git Access

Check application logs during repository clone:

```bash
docker logs workflow-app | grep CLAUDE
```

Should show: `Using API key from runtime configuration`

Should NOT show git blocking errors

#### Verify Internal Executables

```bash
docker exec -it workflow-app bash
/opt/internal/bin/git --version
```

Expected: `git version 2.x.x`

#### Run Verification Script

Run comprehensive automated tests:

```bash
docker exec workflow-app /app/scripts/verify-sandbox.sh
```

- Exit code 0 = all tests passed
- Exit code 1 = some tests failed

## Troubleshooting

### Issue: Application cannot run git

**Symptom**: Application logs show git errors

**Check**:

1. Verify `INTERNAL_GIT_PATH` is set correctly
2. Check file permissions: `ls -l /opt/internal/bin/git`
3. Verify simple-git configuration in sandbox.ts
4. Test git binary: `/opt/internal/bin/git --version`

### Issue: Claude Code still accessing git

**Symptom**: Claude Code successfully runs git commands

**Check**:

1. Verify git is blocked: `docker exec workflow-app git --version`
2. Check wrapper script execution: `which claude-code-wrapper`
3. Verify PATH in Claude Code context
4. Check wrapper script logs

### Issue: Wrapper script not found

**Symptom**: Error: `/usr/local/bin/claude-code-wrapper: No such file`

**Check**:

1. Verify Dockerfile copies script correctly
2. Rebuild Docker image: `docker-compose build --no-cache`
3. Check file exists: `docker exec workflow-app ls -l /usr/local/bin/claude-code-wrapper`

## Future Enhancements

### Potential Improvements

1. **Additional security measures**

   - Monitor and log git access attempts
   - Alert on suspicious Claude Code behavior
   - Rate limiting on file operations
   - Workspace size limits

2. **Resource limits** (already in wrapper, can be enabled)

   - CPU time limits (ulimit -t)
   - Memory limits (ulimit -v)
   - File descriptor limits (ulimit -n)
   - Network bandwidth limits

3. **Audit logging**

   - Log all blocked git attempts with context
   - Track Claude Code file modifications
   - Monitor resource usage patterns
   - Generate security reports

4. **Fine-grained controls**

   - Per-workspace permission profiles
   - Configurable tool access (selective blocking)
   - Time-limited execution windows
   - Workspace isolation levels

5. **Additional command isolation** (if needed)
   - ssh, scp, rsync (network operations)
   - docker, kubectl (container access)
   - systemctl (system services)

## References

- [Docker Security Best Practices](https://docs.docker.com/engine/security/)
- [Linux PATH Security](https://www.baeldung.com/linux/path-variable)
- [Node.js child_process Security](https://nodejs.org/api/child_process.html)
- [simple-git Documentation](https://github.com/steveukx/git-js)

## Maintenance

### Regular Tasks

1. **Update blocking wrappers** when adding new executables
2. **Review Claude Code logs** for attempted blocked commands
3. **Test sandbox** after Claude Code version updates
4. **Audit internal executables** for security vulnerabilities

### Version History

| Version | Date       | Changes                        |
| ------- | ---------- | ------------------------------ |
| 1.0.0   | 2025-11-25 | Initial sandbox implementation |

---

**Last Updated**: 2025-11-25
**Maintained By**: Development Team
