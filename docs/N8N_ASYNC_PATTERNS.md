# n8n Async Patterns (Option A vs Option B)

This document describes two production-ready patterns for integrating n8n with Workflow’s queued API (`/api/ask`, `/api/edit`) when requests may run for a long time and return either **immediately** or **queued**.

For API details (payloads, `queued`, `jobId`, `/api/jobs/:jobId`), see `docs/API_OPERATIONS.md`.

---

## Background: Execute-or-Queue in Workflow

When you call `POST /api/ask` or `POST /api/edit`, Workflow returns one of two shapes:

- **Immediate**: `{ queued: false, response: string, ... }`
- **Queued**: `{ queued: true, jobId: string, ... }`

Queued jobs are retrieved by polling:

- `GET /api/jobs/:jobId` → returns `{ status: pending|processing|completed|failed, result?, error? }`

**Key point:** your integration must always branch on `queued`.

---

## Option A — Single workflow (submit + poll in one run)

### When to use

- Low volume
- You’re OK with a workflow execution waiting (sometimes many minutes)
- You want the simplest setup

### Node-level shape (recommended)

1. **Trigger** (ClickUp/Linear webhook or manual)
2. **Build Prompt** (Set node)
3. **HTTP Request: Submit**
   - `POST /api/ask` or `POST /api/edit`
4. **IF: queued?**
   - If `queued === false`: go to **Process Result**
   - If `queued === true`: enter **Poll Loop**
5. **Poll Loop**
   - **Wait** (2–10s, tune per volume)
   - **HTTP Request: Get Job**
     - `GET /api/jobs/{{ $json.jobId }}`
   - **IF: status**
     - `completed`: go to **Process Result**
     - `failed`: go to **Handle Failure**
     - else: loop back to **Wait**
6. **Process Result**
7. **Update Task**

### Guardrails

- **Max attempts / max runtime**: fail safely after N polls.
- **Backoff**: increase wait interval after the first ~10 polls.
- **Concurrency**: limit parallel runs; large Claude jobs should be serialized anyway.

---

## Option B — Two workflows (submit → poller/processor)

This is the preferred design for **large Claude requests** and higher volume.

### Overview

You split responsibilities:

1. **Submitter workflow**: sends request and stores tracking state (returns quickly)
2. **Poller/Processor workflow**: runs on a schedule and processes completions

### What you need to store

Store a tracking record per submitted job. Minimum schema:

- **jobId**: string
- **taskRef**: your external task identifier (ClickUp task ID / Linear issue ID)
- **mode**: `'mcp' | 'manual'` (see “Use cases” below)
- **endpoint**: `ask|edit`
- **workspaceId**
- **submittedAt**: ISO timestamp
- **status**: `queued|processing|completed|failed`
- **lastPolledAt**: ISO timestamp
- **attempts**: number

Storage options:

- n8n **Data Store**
- Redis/Postgres (recommended at scale)
- ClickUp custom field (simple, but more brittle)

### Submitter workflow (Workflow 1)

1. **Trigger**
2. **Build Prompt**
3. **HTTP Request: Submit** (`POST /api/ask` or `POST /api/edit`)
4. **IF queued?**
   - If immediate:
     - Treat it like a completed job (write a record with a synthetic “completed” status) OR directly update the task.
   - If queued:
     - **Write tracking record** with `jobId` + metadata
     - **Update task** (optional): “Queued. Tracking jobId …”
     - **Exit**

### Poller/Processor workflow (Workflow 2)

Trigger:

- **Schedule** every 10–60s (tune)

Steps:

1. **Read tracking records** where status in (`queued`, `processing`)
2. **For each record** (limit concurrency):
   - **HTTP Request: Get Job**
     - `GET /api/jobs/:jobId`
   - **Update tracking record**:
     - If `pending/processing`: update timestamps/attempts and continue
     - If `failed`: mark failed + propagate error to task
     - If `completed`: mark completed + call **Result Processor**
3. **Result Processor** (see below)
4. **Update external task** (ClickUp/Linear/etc.)

### Guardrails

- **Idempotency**: record-level “processedAt” so you don’t post duplicates.
- **Retry policy**: transient 500s from `/api/jobs/:jobId` should retry.
- **Staleness**: if a job is stuck `processing` for too long, mark “timed out” on your side and alert.
- **Retention**: Workflow deletes finished jobs after ~7 days; poller should process within that window.

---

## Option B (Alternative) — Webhook-driven completion (no polling)

Polling is simple, but it’s not the only option. For large requests, a **completion webhook** is often more efficient:

- n8n creates an **Incoming Webhook** trigger URL
- You submit the job with a `callback` object
- Workflow POSTs to your webhook when the job **completes** or **fails**

### Why webhook can be better

- No periodic polling traffic
- Faster reaction time (near real-time completion)
- Fewer long-running n8n executions

### Why you still want a fallback

Webhooks can fail due to networking, restarts, n8n downtime, TLS issues, etc. Recommended:

- Keep a lightweight poller that only checks **stale** jobs (e.g., not updated in 10–30 min)
- Make your webhook handler idempotent (process each `jobId` once)

### Callback payload

When `callback.secret` is provided, Workflow includes:

- `x-workflow-signature: sha256=<hex>` (HMAC-SHA256 of the JSON body)

The JSON body:

```json
{
  "jobId": "…",
  "type": "claude-code",
  "status": "completed|failed",
  "timestamp": "…",
  "result": {
    /* present when completed */
  }
}
```

### How to submit with callback

```json
{
  "workspaceId": "your-workspace-id",
  "question": "…",
  "callback": {
    "url": "https://n8n.example.com/webhook/your-hook",
    "secret": "shared-secret"
  }
}
```

### Signature verification (Node.js example)

Use this if you set `callback.secret`:

```js
import crypto from 'node:crypto';

function timingSafeEqual(a, b) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export function verifyWorkflowSignature({ secret, rawBody, signatureHeader }) {
  if (!signatureHeader?.startsWith('sha256=')) return false;
  const provided = signatureHeader;
  const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const expected = `sha256=${digest}`;
  return timingSafeEqual(provided, expected);
}
```

---

## Modular design for your two use cases

### Use case 1 — Linear MCP auto-update (“may not require a return”)

Goal: Claude updates the Linear issue using MCP tools, so your automation doesn’t need to parse the model output to update the task.

Recommended approach:

- Still use **Option B**, but set `mode = "mcp"`.
- Submitter stores `jobId` and optionally comments “Running…”.
- Poller confirms completion and then:
  - **If the task already looks updated** (e.g., status/label changed), mark done and stop.
  - Otherwise, post a fallback comment with the raw `result.output` and/or an error.

Why still poll?

- MCP tool execution can fail silently or partially; polling gives you a **reliable completion signal** and a place to implement fallback behavior.

**What is the “return” for MCP mode?**

- Workflow always stores/returns whatever Claude printed as `job.result.output`.
- For MCP-style “update Linear and exit”, the best practice is to require a **single-line JSON receipt** at the end of the response (see `docs/PROMPT_TEMPLATES.md`).
- If you truly don’t need response content, you can ignore `job.result.output` and use either:
  - the completion webhook (`callback.url`), or
  - polling (`GET /api/jobs/:jobId`) as a fallback.

### Use case 2 — Manual update required (structured response contract)

Goal: you want a predictable payload that n8n can parse and write back to the task.

Recommended approach:

- Use **Option B** with `mode = "manual"`.
- In your prompt, require Claude to output a **single JSON object** (no markdown fencing) so n8n can parse it.
- Poller extracts `job.result.output` and parses JSON. If parsing fails, fall back to “raw text” update.

Suggested JSON contract:

```json
{
  "status": "completed|blocked|needs_review",
  "summary": "1-3 sentence summary",
  "changes": {
    "highLevel": ["..."],
    "notes": ["..."]
  },
  "artifacts": {
    "branch": "feature/...",
    "commitHash": "abc123...",
    "mergeRequestUrl": null
  },
  "nextSteps": ["..."]
}
```

Notes:

- For `/api/edit`, you can also use `job.result.postExecution` (commit hash / pushed branch / MR URL) as the source of truth for artifacts.
- Keep the contract stable; evolve it by versioning (e.g., `contractVersion: 1`).

---

## Recommended: Plan for Option B (large requests)

1. **Define a tracking record schema** (above) and pick storage (n8n Data Store is fine to start).
2. **Implement Workflow 1 (Submitter)**:
   - Normalize inputs → build prompt → submit → store `jobId` + metadata
   - Update task with “Queued / Running” and a human-friendly link to your dashboard (optional)
3. **Implement Workflow 2 (Poller/Processor)**:
   - Schedule trigger
   - Fetch active records
   - Poll `/api/jobs/:jobId` with retry/backoff
   - On completion: route to either MCP-mode validation/fallback or manual JSON parsing
4. **Add idempotency**:
   - `processedAt` timestamp or `processed = true`
   - Ensure task updates are safe to run twice
5. **Operationalize**:
   - Alert on “stuck processing” (e.g., > 30–60 minutes)
   - Alert on repeated failures
   - Add a dead-letter queue (records that permanently fail)
