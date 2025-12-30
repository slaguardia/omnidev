# n8n Templates

A collection of ready-to-use n8n node configurations for integrating with Workflow. Each template includes the JSON configuration and notes on how I use it.

For integration setup, see [n8n Workflows](/docs/n8n-workflows). For async patterns, see [n8n Async Patterns](/docs/n8n-async-patterns).

---

## Quick Reference

| Template | Purpose |
|----------|---------|
| [HTTP Request: Submit Ask](#http-request-submit-ask) | Send a question to Claude Code |
| [HTTP Request: Submit Edit](#http-request-submit-edit) | Request code changes with optional MR |
| [HTTP Request: Poll Job](#http-request-poll-job) | Check job status for queued requests |
| [Webhook: Completion Handler](#webhook-completion-handler) | Receive completion callbacks |
| [IF: Check Queued Status](#if-check-queued-status) | Branch on immediate vs queued response |
| [Set: Build Planner Prompt](#set-build-planner-prompt) | Construct a planner prompt from task data |
| [Set: Parse Claude Response](#set-parse-claude-response) | Extract structured data from Claude output |
| [Loop: Poll Until Complete](#loop-poll-until-complete) | Poll with backoff until job finishes |

---

## HTTP Request: Submit Ask

Sends a question to the Workflow `/api/ask` endpoint. Use this for analysis, planning, or any read-only operation.

### Notes

I use this as the main entry point for my planner flows. The key things to remember:
- Always check the `queued` field in the response - if true, you need to poll
- `sourceBranch` is optional; defaults to the workspace's configured target branch
- Keep `context` concise - it's prepended to the question

### Node Configuration

```json
{
  "parameters": {
    "method": "POST",
    "url": "={{ $vars.workflowBaseUrl }}/api/ask",
    "authentication": "genericCredentialType",
    "genericAuthType": "httpHeaderAuth",
    "sendBody": true,
    "specifyBody": "json",
    "jsonBody": "={\n  \"workspaceId\": \"{{ $json.workspaceId }}\",\n  \"question\": \"{{ $json.prompt }}\",\n  \"context\": \"{{ $json.context }}\",\n  \"sourceBranch\": \"{{ $json.sourceBranch }}\"\n}",
    "options": {
      "timeout": 300000
    }
  },
  "type": "n8n-nodes-base.httpRequest",
  "name": "Submit Ask Request"
}
```

### Credential Setup

Create an "HTTP Header Auth" credential:
- **Name**: `workflow_api_key`
- **Header Name**: `X-API-Key`
- **Header Value**: Your Workflow API key

### Example Response (Immediate)

```json
{
  "queued": false,
  "response": "Based on my analysis...",
  "cost": {
    "inputTokens": 1234,
    "outputTokens": 567
  }
}
```

### Example Response (Queued)

```json
{
  "queued": true,
  "jobId": "job_abc123",
  "message": "Request queued for processing"
}
```

---

## HTTP Request: Submit Edit

Sends an edit request to the Workflow `/api/edit` endpoint. Use this when you want Claude to make code changes.

### Notes

This is my workhorse for implementation tasks. Key considerations:
- Set `createMR: true` if you want an automatic merge request
- The `sourceBranch` will be created if it doesn't exist
- Response includes branch, commit, and MR info in `postExecution`
- Edit requests are more likely to be queued due to longer execution time

### Node Configuration

```json
{
  "parameters": {
    "method": "POST",
    "url": "={{ $vars.workflowBaseUrl }}/api/edit",
    "authentication": "genericCredentialType",
    "genericAuthType": "httpHeaderAuth",
    "sendBody": true,
    "specifyBody": "json",
    "jsonBody": "={\n  \"workspaceId\": \"{{ $json.workspaceId }}\",\n  \"question\": \"{{ $json.prompt }}\",\n  \"context\": \"{{ $json.context }}\",\n  \"sourceBranch\": \"{{ $json.branchName }}\",\n  \"createMR\": true,\n  \"mrTitle\": \"{{ $json.mrTitle }}\",\n  \"mrDescription\": \"{{ $json.mrDescription }}\"\n}",
    "options": {
      "timeout": 300000
    }
  },
  "type": "n8n-nodes-base.httpRequest",
  "name": "Submit Edit Request"
}
```

### With Completion Callback

For long-running edits, I prefer using a webhook callback instead of polling:

```json
{
  "parameters": {
    "method": "POST",
    "url": "={{ $vars.workflowBaseUrl }}/api/edit",
    "authentication": "genericCredentialType",
    "genericAuthType": "httpHeaderAuth",
    "sendBody": true,
    "specifyBody": "json",
    "jsonBody": "={\n  \"workspaceId\": \"{{ $json.workspaceId }}\",\n  \"question\": \"{{ $json.prompt }}\",\n  \"sourceBranch\": \"{{ $json.branchName }}\",\n  \"createMR\": true,\n  \"callback\": {\n    \"url\": \"{{ $vars.n8nWebhookUrl }}/workflow-complete\",\n    \"secret\": \"{{ $vars.webhookSecret }}\"\n  }\n}",
    "options": {
      "timeout": 30000
    }
  },
  "type": "n8n-nodes-base.httpRequest",
  "name": "Submit Edit with Callback"
}
```

---

## HTTP Request: Poll Job

Checks the status of a queued job. Use this in a polling loop or as a fallback for webhook-based flows.

### Notes

I call this in a loop with a 10-second wait between attempts. Important behaviors:
- `pending` means the job is waiting in queue
- `processing` means Claude is actively working
- `completed` means you can read the result
- `failed` means something went wrong - check the `error` field

### Node Configuration

```json
{
  "parameters": {
    "method": "GET",
    "url": "={{ $vars.workflowBaseUrl }}/api/jobs/{{ $json.jobId }}",
    "authentication": "genericCredentialType",
    "genericAuthType": "httpHeaderAuth",
    "options": {
      "timeout": 30000
    }
  },
  "type": "n8n-nodes-base.httpRequest",
  "name": "Poll Job Status"
}
```

### Example Response (Completed)

```json
{
  "id": "job_abc123",
  "type": "claude-code",
  "status": "completed",
  "result": {
    "output": "I've analyzed the code...",
    "cost": { "inputTokens": 1234, "outputTokens": 567 }
  },
  "createdAt": "2024-01-15T10:30:00Z",
  "completedAt": "2024-01-15T10:32:45Z"
}
```

---

## Webhook: Completion Handler

Receives callbacks when jobs complete. This is my preferred approach for long-running requests.

### Notes

Why I prefer webhooks over polling:
- No wasted polling requests while waiting
- Near-instant notification when job completes
- Cleaner separation of concerns (submit workflow vs process workflow)

I always set up a fallback poller that runs every 15 minutes to catch any missed webhooks.

### Node Configuration

```json
{
  "parameters": {
    "httpMethod": "POST",
    "path": "workflow-complete",
    "options": {
      "rawBody": true
    }
  },
  "type": "n8n-nodes-base.webhook",
  "name": "Workflow Completion Webhook"
}
```

### Signature Verification (Code Node)

Add this after your webhook node to verify the request is authentic:

```javascript
const crypto = require('crypto');

const secret = $vars.webhookSecret;
const rawBody = $input.first().binary?.data?.toString() || JSON.stringify($input.first().json);
const signature = $input.first().headers['x-workflow-signature'];

if (!signature?.startsWith('sha256=')) {
  throw new Error('Invalid signature format');
}

const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
const expected = `sha256=${digest}`;

// Timing-safe comparison
const sigBuffer = Buffer.from(signature);
const expBuffer = Buffer.from(expected);
if (sigBuffer.length !== expBuffer.length || !crypto.timingSafeEqual(sigBuffer, expBuffer)) {
  throw new Error('Signature verification failed');
}

return $input.all();
```

---

## IF: Check Queued Status

Branches the flow based on whether the request was queued or executed immediately.

### Notes

Every submit request should be followed by this check. My pattern:
- Immediate → process result directly
- Queued → either start polling loop or store for background processing

### Node Configuration

```json
{
  "parameters": {
    "conditions": {
      "options": {
        "caseSensitive": true,
        "leftValue": "",
        "typeValidation": "strict"
      },
      "conditions": [
        {
          "id": "queued-check",
          "leftValue": "={{ $json.queued }}",
          "rightValue": true,
          "operator": {
            "type": "boolean",
            "operation": "equals"
          }
        }
      ],
      "combinator": "and"
    }
  },
  "type": "n8n-nodes-base.if",
  "name": "Is Queued?"
}
```

### Flow Structure

```
[Submit Request] → [Is Queued?]
                       ├── TRUE → [Store Job ID] → [End: Will Poll Later]
                       └── FALSE → [Process Result] → [Update Task]
```

---

## Set: Build Planner Prompt

Constructs a planner prompt from incoming task data. I use this to normalize inputs from different sources (ClickUp, Linear, etc.).

### Notes

This is the heart of my planner automation. Key elements:
- Uses the template from [Prompt Templates](/docs/prompt-templates)
- Handles the bug/feature distinction automatically
- Includes source branch context when available

### Node Configuration

```json
{
  "parameters": {
    "mode": "raw",
    "jsonOutput": "={\n  \"workspaceId\": \"{{ $vars.defaultWorkspaceId }}\",\n  \"sourceBranch\": \"{{ $json.sourceBranch || 'main' }}\",\n  \"prompt\": \"## You are a Planner Agent\\n\\nYour job is to assist in transforming vague software development tasks into detailed, concise, and actionable tasks for a developer agent to implement.\\n\\n## Your Task\\n\\n**Title:** {{ $json.title }}\\n\\n**Description:** {{ $json.description }}\\n\\n{{ $json.isBug ? 'This task appears to be a bug. Your goal is to investigate the cause, identify relevant code, and produce a task for a developer to fix the issue.' : '' }}\\n\\n## Instructions\\n\\n1. **Interpret the task** based on the project context.\\n2. **Investigate the codebase** to determine where and how this task should be executed.\\n3. **Identify any relevant files, components, logic, or dependencies** that are involved.\\n4. **Break the task down into clear steps** for implementation.\\n5. **Specify a definition of done**, so a developer knows when the task is complete.\\n\\n## Output Format (Markdown)\\n\\n### Task Title\\n{Clear, concise, and updated version of the task title}\\n\\n### Objective\\n{Short explanation of what the task is meant to accomplish}\\n\\n### Relevant Files / Areas\\n- path/to/file1.tsx\\n- path/to/file2.ts\\n\\n### Steps to Complete\\n1. ...\\n2. ...\\n\\n### Definition of Done\\n- [ ] Task is implemented\\n- [ ] All tests pass\\n- [ ] Code reviewed or PR created\"\n}"
  },
  "type": "n8n-nodes-base.set",
  "name": "Build Planner Prompt"
}
```

---

## Set: Parse Claude Response

Extracts structured data from Claude's output. Use this when you've instructed Claude to return JSON.

### Notes

I use this after Claude returns a structured response (see [Prompt Templates](/docs/prompt-templates) for the JSON contract). The key is being defensive about parsing:
- Try JSON.parse first
- Fall back to regex extraction if needed
- Always have a "raw output" fallback

### Node Configuration

```json
{
  "parameters": {
    "mode": "raw",
    "jsonOutput": "=(() => {\n  const output = $json.response || $json.result?.output || '';\n  \n  // Try direct JSON parse\n  try {\n    return JSON.parse(output);\n  } catch (e) {\n    // Try to extract JSON from markdown code block\n    const jsonMatch = output.match(/```(?:json)?\\s*([\\s\\S]*?)```/);\n    if (jsonMatch) {\n      try {\n        return JSON.parse(jsonMatch[1].trim());\n      } catch (e2) {}\n    }\n    \n    // Return raw output as fallback\n    return {\n      status: 'parse_failed',\n      rawOutput: output\n    };\n  }\n})()"
  },
  "type": "n8n-nodes-base.set",
  "name": "Parse Claude Response"
}
```

---

## Loop: Poll Until Complete

A complete polling loop with backoff. Use this for Option A flows (single workflow with inline polling).

### Notes

My polling strategy:
- Start with 5-second intervals
- After 10 attempts, switch to 15-second intervals
- Max 60 attempts (about 12 minutes at the longer interval)
- Always check for both `completed` and `failed` states

### Implementation Steps

1. **Loop Node** - Iterate until complete or max attempts reached
2. **Wait Node** - Delay between polls (5-15 seconds)
3. **HTTP Request** - Poll job status
4. **IF Node** - Check if done (`completed` or `failed`)
5. **Set Node** - Increment attempt counter

### Wait Node Configuration

```json
{
  "parameters": {
    "amount": "={{ $json.attempts > 10 ? 15 : 5 }}",
    "unit": "seconds"
  },
  "type": "n8n-nodes-base.wait",
  "name": "Wait Before Poll"
}
```

### Loop Exit Condition

```json
{
  "parameters": {
    "conditions": {
      "conditions": [
        {
          "leftValue": "={{ $json.status }}",
          "rightValue": "completed",
          "operator": { "type": "string", "operation": "equals" }
        }
      ],
      "combinator": "or"
    }
  },
  "type": "n8n-nodes-base.if",
  "name": "Is Complete?"
}
```

---

## Complete Flow: Linear Task Planner

A full example combining multiple templates for a Linear-triggered planning workflow.

### Notes

This is my actual production planner flow. It:
1. Triggers on Linear task assignment to the bot
2. Builds a planner prompt from the task
3. Submits to Workflow API
4. Handles both immediate and queued responses
5. Updates the Linear task with results

### Flow Overview

```
[Linear Trigger] → [Filter: Assigned to Bot] → [Build Planner Prompt]
                                                       ↓
[Submit Ask Request] → [Is Queued?] → TRUE → [Store Job] → [End]
                              ↓
                           FALSE
                              ↓
                    [Parse Response] → [Update Linear Task]
```

### Linear Trigger Configuration

```json
{
  "parameters": {
    "event": "issueUpdate",
    "filters": {
      "updatedFields": ["assignee"]
    }
  },
  "type": "n8n-nodes-base.linearTrigger",
  "name": "Linear: Task Assigned"
}
```

### Filter Node

```json
{
  "parameters": {
    "conditions": {
      "conditions": [
        {
          "leftValue": "={{ $json.data.assignee?.email }}",
          "rightValue": "={{ $vars.botEmail }}",
          "operator": { "type": "string", "operation": "equals" }
        },
        {
          "leftValue": "={{ $json.data.state?.type }}",
          "rightValue": "triage",
          "operator": { "type": "string", "operation": "equals" }
        }
      ],
      "combinator": "and"
    }
  },
  "type": "n8n-nodes-base.if",
  "name": "Assigned to Bot & In Triage?"
}
```

---

## Complete Flow: Webhook-Based Implementation

A two-workflow pattern for handling edit requests with webhooks.

### Notes

This is my recommended pattern for implementation tasks because:
- Submitter workflow returns quickly (no long-running executions)
- Processor workflow only runs when there's actual work
- Robust against n8n restarts during long Claude operations

### Workflow 1: Submitter

```
[Trigger] → [Build Prompt] → [Submit Edit with Callback] → [Store Tracking Record] → [Update Task: "Processing..."]
```

### Workflow 2: Processor

```
[Webhook: Completion] → [Verify Signature] → [Load Tracking Record] → [Parse Result] → [Update Task with Results]
```

### Tracking Record Structure

Store this in n8n Data Store or your preferred storage:

```json
{
  "jobId": "job_abc123",
  "taskId": "LIN-123",
  "taskUrl": "https://linear.app/team/issue/LIN-123",
  "workspaceId": "ws_xyz",
  "submittedAt": "2024-01-15T10:30:00Z",
  "mode": "edit",
  "branchName": "claude/lin-123-feature"
}
```

---

## Tips & Best Practices

### Variables I Set Up

Configure these in n8n Settings → Variables:

| Variable | Example | Purpose |
|----------|---------|---------|
| `workflowBaseUrl` | `https://workflow.example.com` | Your Workflow instance |
| `defaultWorkspaceId` | `ws_abc123` | Default workspace for new tasks |
| `botEmail` | `bot@example.com` | Bot's email for filtering |
| `webhookSecret` | `random-secret-here` | For callback verification |
| `n8nWebhookUrl` | `https://n8n.example.com/webhook` | Your n8n webhook base URL |

### Error Handling

I add error handling to every HTTP request node:

```json
{
  "parameters": {
    "options": {
      "response": {
        "response": {
          "neverError": true
        }
      }
    }
  }
}
```

Then check for errors explicitly:

```json
{
  "parameters": {
    "conditions": {
      "conditions": [
        {
          "leftValue": "={{ $json.statusCode }}",
          "rightValue": 200,
          "operator": { "type": "number", "operation": "gte" }
        },
        {
          "leftValue": "={{ $json.statusCode }}",
          "rightValue": 299,
          "operator": { "type": "number", "operation": "lte" }
        }
      ],
      "combinator": "and"
    }
  },
  "type": "n8n-nodes-base.if",
  "name": "Request Successful?"
}
```

### Logging

I add Set nodes throughout to log key data points for debugging:

```json
{
  "parameters": {
    "mode": "raw",
    "jsonOutput": "={\n  \"timestamp\": \"{{ new Date().toISOString() }}\",\n  \"step\": \"submit_complete\",\n  \"jobId\": \"{{ $json.jobId }}\",\n  \"queued\": {{ $json.queued }}\n}"
  },
  "type": "n8n-nodes-base.set",
  "name": "Log: Submit Result"
}
```

---

## Next Steps

- [n8n Workflows](/docs/n8n-workflows) - Integration setup guide
- [n8n Async Patterns](/docs/n8n-async-patterns) - Option A vs Option B in depth
- [Prompt Templates](/docs/prompt-templates) - Planner and implementation prompts
- [API Operations](/docs/api-operations) - Full API reference
