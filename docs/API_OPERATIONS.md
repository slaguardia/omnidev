# API Operations

This document covers all API routes, request/response schemas, the job queue system, and git actions that occur after execution.

## API Routes

### POST `/api/ask`

Query Claude Code about a workspace/repository (read-only, no file modifications).

**Request Payload:**

| Field          | Type   | Required | Description                      |
| -------------- | ------ | -------- | -------------------------------- |
| `workspaceId`  | string | Yes      | The workspace ID to query        |
| `question`     | string | Yes      | The question to ask Claude Code  |
| `context`      | string | No       | Additional context for the query |
| `sourceBranch` | string | Yes      | The source branch to work from   |

**Example Request:**

```bash
curl -X POST http://localhost:3000/api/ask \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key-here" \
  -d '{"workspaceId": "workspace-123", "question": "How does the authentication system work?", "sourceBranch": "main"}'
```

**Response (Immediate Execution):**

When no other job is processing, the request executes immediately:

```json
{
  "success": true,
  "response": "The authentication system uses...",
  "queued": false,
  "method": "claude-code",
  "workspace": {
    "id": "workspace-123",
    "path": "/path/to/workspace",
    "repoUrl": "https://github.com/org/repo",
    "targetBranch": "main"
  },
  "timing": {
    "total": 5432,
    "claudeExecution": 4521
  }
}
```

**Response (Queued):**

When another job is already processing, the request is queued:

```json
{
  "success": true,
  "queued": true,
  "jobId": "2025-11-30T03-12-22Z-a1b2c3d4",
  "message": "Job queued - poll /api/jobs/:jobId for results",
  "workspace": {
    "id": "workspace-123",
    "path": "/path/to/workspace",
    "repoUrl": "https://github.com/org/repo",
    "targetBranch": "main"
  }
}
```

---

### POST `/api/edit`

Execute Claude Code edits with optional merge request creation.

**Request Payload:**

| Field           | Type    | Required | Description                                         |
| --------------- | ------- | -------- | --------------------------------------------------- |
| `workspaceId`   | string  | Yes      | The workspace ID to edit                            |
| `question`      | string  | Yes      | The edit instructions for Claude Code               |
| `context`       | string  | No       | Additional context for the edit                     |
| `sourceBranch`  | string  | Yes      | The source branch to work from                      |
| `createMR`      | boolean | Yes      | Whether to create a merge request                   |
| `taskId`        | string  | No       | Task identifier for branch naming                   |
| `taskName`      | string  | No       | Task name for commit messages                       |
| `newBranchName` | string  | No       | Custom branch name (auto-generated if not provided) |

**Example Request:**

```bash
curl -X POST http://localhost:3000/api/edit \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key-here" \
  -d '{"workspaceId": "workspace-123", "question": "Add input validation to the login form", "sourceBranch": "main", "createMR": true}'
```

**Response (Immediate Execution):**

```json
{
  "success": true,
  "response": "I've added Zod validation to the login form...",
  "queued": false,
  "method": "claude-code",
  "workspace": {
    "id": "workspace-123",
    "path": "/path/to/workspace",
    "repoUrl": "https://github.com/org/repo",
    "targetBranch": "main"
  },
  "timing": {
    "total": 12543,
    "claudeExecution": 10234
  }
}
```

**Response (Queued):**

```json
{
  "success": true,
  "queued": true,
  "jobId": "2025-11-30T03-15-44Z-b2c3d4e5",
  "message": "Job queued - poll /api/jobs/:jobId for results",
  "workspace": {
    "id": "workspace-123",
    "path": "/path/to/workspace",
    "repoUrl": "https://github.com/org/repo",
    "targetBranch": "main"
  }
}
```

---

### GET `/api/jobs/:jobId`

Poll for the status and result of a queued job.

**Request:**

```bash
curl http://localhost:3000/api/jobs/2025-11-30T03-12-22Z-a1b2c3d4 \
  -H "x-api-key: your-api-key-here"
```

**Response Schema:**

| Field         | Type   | Description                                                           |
| ------------- | ------ | --------------------------------------------------------------------- |
| `id`          | string | The job ID                                                            |
| `type`        | string | Job type: `claude-code`, `git-push`, `git-mr`, or `workspace-cleanup` |
| `status`      | string | Current status: `pending`, `processing`, `completed`, or `failed`     |
| `createdAt`   | string | ISO-8601 timestamp when job was created                               |
| `startedAt`   | string | ISO-8601 timestamp when processing started (if applicable)            |
| `completedAt` | string | ISO-8601 timestamp when job completed (if applicable)                 |
| `result`      | object | The job result (only present when status is `completed`)              |
| `error`       | string | Error message (only present when status is `failed`)                  |

**Example Response (Processing):**

```json
{
  "id": "2025-11-30T03-12-22Z-a1b2c3d4",
  "type": "claude-code",
  "status": "processing",
  "createdAt": "2025-11-30T03:12:22.000Z",
  "startedAt": "2025-11-30T03:12:24.000Z"
}
```

**Example Response (Completed):**

```json
{
  "id": "2025-11-30T03-12-22Z-a1b2c3d4",
  "type": "claude-code",
  "status": "completed",
  "createdAt": "2025-11-30T03:12:22.000Z",
  "startedAt": "2025-11-30T03:12:24.000Z",
  "completedAt": "2025-11-30T03:14:30.000Z",
  "result": {
    "output": "I've completed the requested changes...",
    "executionTimeMs": 126000
  }
}
```

**Example Response (Failed):**

```json
{
  "id": "2025-11-30T03-12-22Z-a1b2c3d4",
  "type": "claude-code",
  "status": "failed",
  "createdAt": "2025-11-30T03:12:22.000Z",
  "startedAt": "2025-11-30T03:12:24.000Z",
  "completedAt": "2025-11-30T03:12:30.000Z",
  "error": "Claude Code execution failed: timeout exceeded"
}
```

---

## Request Queue System

### Execute-or-Queue Behavior

The API uses an execute-or-queue pattern to ensure sequential processing:

| Scenario                    | Behavior                                                           |
| --------------------------- | ------------------------------------------------------------------ |
| No job currently processing | Request executes immediately, returns `queued: false` with result  |
| Another job is processing   | Request is queued, returns `queued: true` with `jobId` for polling |

This design prevents git conflicts by ensuring only one Claude Code execution runs at a time.

### Job States

| State        | Description                                          |
| ------------ | ---------------------------------------------------- |
| `pending`    | Job is waiting in the queue                          |
| `processing` | Job is currently being executed                      |
| `completed`  | Job finished successfully, result is available       |
| `failed`     | Job encountered an error, error message is available |

### Job Lifecycle

1. **Request received** - API validates input and authentication
2. **Queue check** - System checks if another job is processing
3. **Execute or queue** - Job either runs immediately or enters the pending queue
4. **Background processing** - Worker polls every 2 seconds for pending jobs
5. **Completion** - Job moves to `completed` or `failed` state with result/error
6. **Cleanup** - Jobs are retained for 7 days, then automatically deleted

---

## Git Actions After Execution

When a Claude Code job completes (for edit requests with `createMR: true`), the following git actions may occur:

### Execution Flow

| Step | Action                 | Condition                              |
| ---- | ---------------------- | -------------------------------------- |
| 1    | Claude Code execution  | Always                                 |
| 2    | Check for file changes | Always                                 |
| 3    | Commit changes         | If changes detected                    |
| 4    | Push to remote branch  | If changes committed                   |
| 5    | Create merge request   | If `createMR: true` and changes pushed |

### Response Fields for Git Results

When git actions are performed, the job result includes:

| Field             | Type    | Description                                        |
| ----------------- | ------- | -------------------------------------------------- |
| `hasChanges`      | boolean | Whether Claude Code made any file changes          |
| `pushedBranch`    | string  | Name of the branch that was pushed (if applicable) |
| `mergeRequestUrl` | string  | URL of the created merge request (if applicable)   |

### Example Completed Job with Git Result

```json
{
  "id": "2025-11-30T03-12-22Z-a1b2c3d4",
  "type": "claude-code",
  "status": "completed",
  "result": {
    "output": "I've added the validation logic...",
    "executionTimeMs": 45000,
    "hasChanges": true,
    "pushedBranch": "feature/add-validation-abc123",
    "mergeRequestUrl": "https://gitlab.com/org/repo/-/merge_requests/42"
  }
}
```

---

## Client Implementation Guide

### Handling Immediate vs Queued Responses

Check the `queued` field to determine how to proceed:

```javascript
const response = await fetch('/api/ask', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': 'your-api-key',
  },
  body: JSON.stringify({
    workspaceId: 'workspace-123',
    question: 'Explain the authentication flow',
    sourceBranch: 'main',
  }),
});

const data = await response.json();

if (data.queued) {
  // Job was queued - need to poll for results
  const result = await pollForResult(data.jobId);
  console.log('Result:', result);
} else {
  // Job completed immediately
  console.log('Response:', data.response);
}
```

### Polling for Results

**JavaScript Example:**

```javascript
async function pollForResult(jobId, maxAttempts = 60, intervalMs = 2000) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await fetch(`/api/jobs/${jobId}`, {
      headers: { 'x-api-key': 'your-api-key' },
    });
    const job = await response.json();

    if (job.status === 'completed') {
      return job.result;
    }

    if (job.status === 'failed') {
      throw new Error(job.error || 'Job failed');
    }

    // Still pending or processing - wait and retry
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error('Polling timeout - job did not complete in time');
}
```

**Python Example:**

```python
import requests
import time

def poll_for_result(job_id, max_attempts=60, interval_sec=2):
    headers = {'x-api-key': 'your-api-key'}

    for attempt in range(max_attempts):
        response = requests.get(
            f'http://localhost:3000/api/jobs/{job_id}',
            headers=headers
        )
        job = response.json()

        if job['status'] == 'completed':
            return job['result']

        if job['status'] == 'failed':
            raise Exception(job.get('error', 'Job failed'))

        time.sleep(interval_sec)

    raise Exception('Polling timeout - job did not complete in time')
```

### Complete End-to-End Example

```javascript
async function executeEdit(workspaceId, question, createMR = true) {
  // Step 1: Submit the edit request
  const submitResponse = await fetch('/api/edit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': 'your-api-key',
    },
    body: JSON.stringify({
      workspaceId,
      question,
      sourceBranch: 'main',
      createMR,
    }),
  });

  const submitData = await submitResponse.json();

  if (!submitData.success) {
    throw new Error(submitData.error || 'Request failed');
  }

  // Step 2: Get the result (immediate or via polling)
  let result;
  if (submitData.queued) {
    console.log(`Job queued with ID: ${submitData.jobId}`);
    result = await pollForResult(submitData.jobId);
  } else {
    result = {
      output: submitData.response,
      timing: submitData.timing,
    };
  }

  // Step 3: Handle git results if present
  if (result.hasChanges) {
    console.log(`Changes pushed to branch: ${result.pushedBranch}`);

    if (result.mergeRequestUrl) {
      console.log(`Merge request created: ${result.mergeRequestUrl}`);
    }
  } else {
    console.log('No file changes were made');
  }

  return result;
}
```

---

## Error Responses

| Status | Error                        | Description                                |
| ------ | ---------------------------- | ------------------------------------------ |
| 400    | Missing required fields      | `workspaceId` or `question` not provided   |
| 404    | Workspace not found          | The specified workspace does not exist     |
| 404    | Job not found                | The specified job ID does not exist        |
| 500    | Claude Code execution failed | Error during Claude Code execution         |
| 503    | Claude Code not available    | Claude Code is not installed or accessible |

All error responses follow this format:

```json
{
  "error": "Error description",
  "details": "Additional details about the error"
}
```
