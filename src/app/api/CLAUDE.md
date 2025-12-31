# Omnidev — API Routes

> Omnidev is a single developer bot orchestration runtime. See root `CLAUDE.md` for project identity and architectural constraints.

Next.js App Router API routes using route handlers.

## Route Inventory

### Core Operations

| Endpoint         | Method   | Purpose                                | Auth Required |
| ---------------- | -------- | -------------------------------------- | ------------- |
| `/api/ask`       | POST     | Ask Claude Code a question (read-only) | Yes           |
| `/api/edit`      | POST     | Ask Claude Code to make changes        | Yes           |
| `/api/search`    | GET      | Search workspaces                      | Yes           |
| `/api/claude-md` | GET/POST | Manage CLAUDE.md files in workspaces   | Yes           |

### Job Queue

| Endpoint            | Method | Purpose               | Auth Required |
| ------------------- | ------ | --------------------- | ------------- |
| `/api/jobs/[jobId]` | GET    | Get job status/result | Yes           |
| `/api/queue/status` | GET    | Get queue status      | Yes           |

### Authentication

| Endpoint                      | Method  | Purpose                   | Auth Required |
| ----------------------------- | ------- | ------------------------- | ------------- |
| `/api/auth/[...nextauth]`     | Various | NextAuth.js handlers      | No            |
| `/api/auth/check-credentials` | POST    | Validate credentials      | No            |
| `/api/auth/change-password`   | POST    | Change user password      | Yes           |
| `/api/auth/2fa/setup`         | POST    | Initialize 2FA setup      | Yes           |
| `/api/auth/2fa/verify`        | POST    | Verify 2FA token          | Yes           |
| `/api/auth/2fa/disable`       | POST    | Disable 2FA               | Yes           |
| `/api/auth/2fa/status`        | GET     | Get 2FA status            | Yes           |
| `/api/auth/2fa/validate`      | POST    | Validate 2FA during login | Partial       |

### Configuration

| Endpoint            | Method | Purpose               | Auth Required |
| ------------------- | ------ | --------------------- | ------------- |
| `/api/config`       | GET    | Get app configuration | Yes           |
| `/api/generate-key` | POST   | Generate new API key  | Yes           |
| `/api/health`       | GET    | Health check          | No            |

### Workspaces

| Endpoint                              | Method | Purpose                       | Auth Required |
| ------------------------------------- | ------ | ----------------------------- | ------------- |
| `/api/workspaces/update`              | POST   | Update workspace settings     | Yes           |
| `/api/workspaces/refresh-permissions` | POST   | Refresh workspace permissions | Yes           |

### GitLab Integration

| Endpoint      | Method | Purpose             | Auth Required |
| ------------- | ------ | ------------------- | ------------- |
| `/api/gitlab` | GET    | GitLab project info | Yes           |

## Route Handler Structure

### Basic Pattern

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';

export async function POST(request: NextRequest) {
  // 1. Authentication
  const authResult = await withAuth(request);
  if (!authResult.success) {
    return authResult.response!;
  }

  // 2. Parse request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  // 3. Validate with Zod
  const validation = validateParams(body, 'MY_API');
  if (!validation.success) {
    return validation.error!;
  }

  // 4. Business logic
  try {
    const result = await performOperation(validation.data!);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error(`[MY API] Operation failed:`, error);
    return NextResponse.json(
      {
        error: 'Operation failed',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
```

### Dynamic Route Pattern

For routes with parameters like `/api/jobs/[jobId]`:

```typescript
// src/app/api/jobs/[jobId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';

interface RouteContext {
  params: Promise<{ jobId: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const authResult = await withAuth(request);
  if (!authResult.success) {
    return authResult.response!;
  }

  // Await params in Next.js 15
  const { jobId } = await context.params;

  const job = await getJob(jobId);
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true, job });
}
```

## Authentication

### Using withAuth Middleware

```typescript
import { withAuth } from '@/lib/auth/middleware';

export async function POST(request: NextRequest) {
  const authResult = await withAuth(request);

  if (!authResult.success) {
    // Returns appropriate error response:
    // - 401: Invalid/missing credentials
    // - 403: IP not whitelisted
    // - 429: Rate limit exceeded
    return authResult.response!;
  }

  // Access authenticated user info
  const { userId, clientName } = authResult.auth!;
  console.log(`[API] Request from ${clientName} (${userId})`);

  // Proceed with request handling
}
```

### Authentication Methods

| Method           | Header/Cookie      | Description                |
| ---------------- | ------------------ | -------------------------- |
| NextAuth Session | Cookie             | Automatic for web UI users |
| API Key          | `X-API-Key: <key>` | For external API clients   |

## Request Validation

### Zod Schema Definition

```typescript
// src/lib/api/route-validation.ts
import { z } from 'zod';

const AskRouteParamsSchema = z.object({
  workspaceId: z.string().min(1, 'Workspace ID is required'),
  question: z.string().min(1, 'Question is required'),
  context: z.string().nullable().optional(),
  sourceBranch: z.string().min(1).optional(),
});
```

### Using Validation Helpers

```typescript
import { validateAndParseAskRouteParams } from '@/lib/api/route-validation';

export async function POST(request: NextRequest) {
  // ... auth check ...

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const result = validateAndParseAskRouteParams(body, 'ASK API');
  if (!result.success) {
    // Returns NextResponse with 400 status and Zod error details
    return result.error!;
  }

  // TypeScript knows the shape of data
  const { workspaceId, question, context, sourceBranch } = result.data!;
}
```

## Job Queue Integration

### Always-Queued Pattern

All `/api/ask` and `/api/edit` requests are queued for background processing:

```typescript
import { executeOrQueue, type ClaudeCodeJobPayload } from '@/lib/queue';

export async function POST(request: NextRequest) {
  // ... auth and validation ...

  const payload: ClaudeCodeJobPayload = {
    workspaceId: workspace.id,
    workspacePath: workspace.path,
    question,
    repoUrl: workspace.repoUrl,
    context,
    sourceBranch,
  };

  // Always queue the job (forceQueue: true) - returns immediately
  const execution = await executeOrQueue('claude-code', payload, { forceQueue: true });

  // forceQueue guarantees immediate: false
  return NextResponse.json({
    success: true,
    queued: true,
    jobId: execution.jobId,
    message: 'Poll /api/jobs/:jobId for results',
  });
}
```

### Polling for Job Results

Clients poll `/api/jobs/[jobId]` for results:

```typescript
// Client-side polling
async function pollJob(jobId: string): Promise<JobResult> {
  while (true) {
    const response = await fetch(`/api/jobs/${jobId}`);
    const data = await response.json();

    if (data.job.status === 'completed') {
      return data.job.result;
    }
    if (data.job.status === 'failed') {
      throw new Error(data.job.error);
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}
```

## Response Formats

### Success Response

```typescript
return NextResponse.json({
  success: true,
  data: result,
  // Optional metadata
  timing: { total: 1234 },
  workspace: { id: workspace.id },
});
```

### Error Response

```typescript
// Client error (400-499)
return NextResponse.json(
  {
    error: 'Descriptive message',
    details: 'Additional context', // Optional
  },
  { status: 400 }
);

// Server error (500)
return NextResponse.json(
  {
    error: 'Internal server error',
    details: error instanceof Error ? error.message : String(error),
  },
  { status: 500 }
);
```

### Queued Job Response

```typescript
return NextResponse.json({
  success: true,
  queued: true,
  jobId: execution.jobId,
  message: 'Poll /api/jobs/:jobId for results',
});
```

## Logging Convention

Use bracketed prefixes with timestamps:

```typescript
const startTime = Date.now();
console.log(`[ASK API] Request started at ${new Date().toISOString()}`);

// ... processing ...

console.log(`[ASK API] Authentication successful for user: ${authResult.auth!.clientName}`);
console.log(`[ASK API] Request payload:`, { workspaceId, questionLength: question.length });

// On completion
const totalTime = Date.now() - startTime;
console.log(`[ASK API] Request completed in ${totalTime}ms`);

// On error
console.error(`[ASK API] Failed to process request:`, error);
```

## Adding New API Routes

1. Create route file: `src/app/api/[route-name]/route.ts`
2. Add Zod schema in `src/lib/api/route-validation.ts` (if needed)
3. Implement handler following the standard pattern
4. Use `withAuth()` for authentication
5. Return consistent error/success responses
6. Add logging with `[ROUTE NAME]` prefix
7. Update this CLAUDE.md with route documentation

### Route Template

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log(`[MY_ROUTE] Request started at ${new Date().toISOString()}`);

  try {
    // Authentication
    const authResult = await withAuth(request);
    if (!authResult.success) {
      return authResult.response!;
    }

    // Parse body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    // Validate (add schema if needed)
    // const validation = validateMyParams(body, 'MY_ROUTE');
    // if (!validation.success) return validation.error!;

    // Business logic
    const result = await doSomething();

    const totalTime = Date.now() - startTime;
    console.log(`[MY_ROUTE] Completed in ${totalTime}ms`);

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error(`[MY_ROUTE] Failed:`, error);
    return NextResponse.json(
      {
        error: 'Operation failed',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
```
