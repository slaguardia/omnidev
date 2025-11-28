# Sandbox Quick Reference Guide

## TL;DR

**Git is blocked for Claude Code, everything else is accessible.**

- ❌ Claude Code **CANNOT** run `git` commands
- ✅ Claude Code **CAN** use `rm`, `curl`, `wget`, `npm`, and all other tools
- ✅ Your app has **FULL** access to git via `/opt/internal/bin/git`

## How It Works

### For Claude Code

In Claude Code's context:

```bash
git --version
```

Output: `[BLOCKED] git access denied`

```bash
curl --version
```

Output: `curl 7.x.x` (works normally)

```bash
rm file.txt
```

Works normally

### For Your Application

In your Next.js app:

```typescript
import { createSandboxedGit } from '@/lib/git/sandbox';

const git = createSandboxedGit('/app/workspaces/repo');
await git.clone('https://...', '/app/workspaces/repo');
```

Works perfectly - uses `/opt/internal/bin/git`

## File Locations

| What                  | Where                                | Who Can Access           |
| --------------------- | ------------------------------------ | ------------------------ |
| Real git binary       | `/opt/internal/bin/git`              | App only                 |
| Git wrapper (blocker) | `/usr/bin/git`                       | Everyone (returns error) |
| Claude Code wrapper   | `/usr/local/bin/claude-code-wrapper` | App (to run Claude)      |
| Standard tools        | `/usr/bin/*`, `/bin/*`               | Everyone                 |

## Environment Variables

| Variable              | Value                                | Description            |
| --------------------- | ------------------------------------ | ---------------------- |
| `SANDBOX_ENABLED`     | `true`                               | Enable sandbox mode    |
| `INTERNAL_GIT_PATH`   | `/opt/internal/bin/git`              | Where real git is      |
| `CLAUDE_CODE_WRAPPER` | `/usr/local/bin/claude-code-wrapper` | Path to wrapper script |

## Running Claude Code (Sandboxed)

### From Your App

The execution module automatically uses the wrapper when `SANDBOX_ENABLED=true`:

```typescript
const result = await askClaudeCode('Analyze this code', {
  workingDirectory: '/app/workspaces/my-repo',
  workspaceId: '123',
});
```

### Manual Testing (Inside Container)

Sandboxed execution:

```bash
/usr/local/bin/claude-code-wrapper /app/workspaces/repo -p "hello"
```

**What happens:**

1. Changes to `/app/workspaces/repo`
2. Removes `/opt/internal/bin` from PATH
3. Nullifies all git env vars
4. Runs: `claude-code -p "hello"`
5. Claude Code sees git as blocked

## Verification

### Automated (CI/CD)

The sandbox is automatically verified in the GitLab CI/CD pipeline:

- **Stage**: `docker-test`
- **Job**: `docker-sandbox-verify`
- **When**: On every push to master/main and merge requests
- **Tests**:
  - ✓ Git blocking verification
  - ✓ Internal git accessibility
  - ✓ Standard tools accessibility (curl, wget)
  - ✓ Full verification script execution

View results in your GitLab pipeline → `docker-test` stage → `docker-sandbox-verify` job

### Quick Test (Inside Container)

Test git blocking:

```bash
docker exec workflow-app git --version
```

Expected: `[BLOCKED] git access denied`

Test internal git:

```bash
docker exec workflow-app /opt/internal/bin/git --version
```

Expected: `git version 2.x.x`

Test standard tools (should work):

```bash
docker exec workflow-app curl --version
```

Expected: `curl 7.x.x`

### Full Verification

Run comprehensive sandbox tests:

```bash
docker exec workflow-app /app/scripts/verify-sandbox.sh
```

## Common Scenarios

### Scenario 1: Claude Code Needs to Download Dependencies

Claude Code can do this:

```bash
curl -O https://example.com/file.zip
wget https://cdn.example.com/library.tar.gz
npm install
pip install -r requirements.txt
```

✅ All work normally

### Scenario 2: Claude Code Tries to Commit Changes

Claude Code tries:

```bash
git add .
git commit -m "changes"
```

❌ Blocked - returns error message

### Scenario 3: Your App Manages Git Workflow

Your app does:

```typescript
const git = createSandboxedGit(workspacePath);
await git.add('.');
await git.commit('Changes from Claude Code analysis');
await git.push();
```

✅ Works perfectly - app has full git access

## Troubleshooting

### Problem: "git not found" in app

**Solution**: Check that `simple-git` is using the internal binary:

```typescript
import { verifyGitBinary } from '@/lib/git/sandbox';
const isOk = await verifyGitBinary();
console.log('Git accessible:', isOk);
```

### Problem: Claude Code still runs git

**Solution**: Verify sandbox is enabled:

```bash
docker exec workflow-app env | grep SANDBOX_ENABLED
```

Should output: `SANDBOX_ENABLED=true`

### Problem: Claude Code can't download files

**Solution**: This is NOT expected. Verify curl/wget are not blocked:

```bash
docker exec workflow-app curl --version
```

Should work normally, NOT be blocked

## Architecture Summary

```
┌────────────────────────────────────────────┐
│           Docker Container                 │
│                                            │
│  /usr/bin/git ────────┐                    │
│  (blocking script)    │                    │
│                       ▼                    │
│                 [BLOCKED]                  │
│                       ▲                    │
│                       │                    │
│                 Claude Code                │
│                 (tries git)                │
│                                            │
│  /opt/internal/bin/git ────┐               │
│  (real binary)             │               │
│                            ▼               │
│                       Your App             │
│                    (uses git ✓)            │
│                                            │
└────────────────────────────────────────────┘
```

## Security Checklist

- [ ] `SANDBOX_ENABLED=true` in docker-compose.yml
- [ ] `/usr/bin/git` is a blocking script
- [ ] `/opt/internal/bin/git` exists and works
- [ ] Wrapper script at `/usr/local/bin/claude-code-wrapper`
- [ ] Application uses `createSandboxedGit()` for all git ops
- [ ] Claude Code execution uses wrapper when sandboxed
- [ ] Verification script passes all tests

## Quick Commands

Build with sandbox:

```bash
docker-compose build
```

Run with sandbox enabled:

```bash
docker-compose up -d
```

Verify sandbox:

```bash
docker exec workflow-app /app/scripts/verify-sandbox.sh
```

Check git blocking:

```bash
docker exec workflow-app git --version
```

Check internal git:

```bash
docker exec workflow-app /opt/internal/bin/git --version
```

View logs:

```bash
docker logs workflow-app | grep CLAUDE
```

Shell into container:

```bash
docker exec -it workflow-app bash
```

## Key Files

- **Dockerfile** - Lines 20-31: Git isolation setup
- **docker-compose.yml** - Lines 20-25: Sandbox environment vars
- **claude-code-wrapper.sh** - Sandboxed execution wrapper
- **src/lib/git/sandbox.ts** - Sandboxed git configuration
- **src/lib/git/core.ts** - Uses sandboxed git
- **src/lib/claudeCode/execution.ts** - Uses wrapper when sandboxed
- **scripts/verify-sandbox.sh** - Verification tests
- **[Sandbox Architecture](/docs/sandbox-architecture)** - Full documentation

## Need Help?

1. Read full docs: [Sandbox Architecture](/docs/sandbox-architecture)
2. Run verification: `docker exec workflow-app /app/scripts/verify-sandbox.sh`
3. Check logs: `docker logs workflow-app | grep -i "sandbox\|git\|claude"`
4. Test manually: `docker exec -it workflow-app bash`

---

**Last Updated**: 2025-11-25
