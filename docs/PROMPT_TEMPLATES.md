# Prompt Templates

This guide provides prompt templates for use with n8n workflows and direct API calls.

---

## Async + Task Update Patterns (Recommended)

When requests are large, Workflow may return `queued: true` and you should poll via `/api/jobs/:jobId` (see `docs/N8N_ASYNC_PATTERNS.md`).

There are two common task-update modes:

- **MCP mode (Linear MCP auto-update)**: Claude uses MCP tools to update the task directly. Your automation can be “fire-and-forget”, but a poller fallback is recommended for reliability.
- **Manual mode (structured output)**: Claude returns a JSON object that your automation writes back to the task.

### Template: MCP mode (Linear auto-update, with optional receipt)

```markdown
You have access to a Linear MCP. Update the Linear issue described below directly in Linear.

Requirements:

- Apply the requested change/analysis.
- Update the issue with a clear summary and next steps.
- If you hit blockers, update the issue with what you tried and what is needed.

At the end, output a single-line JSON "receipt" (no code fences) so automations can detect completion:
{"status":"completed|blocked","summary":"...","updatedLinear":true}

Issue:

- Linear ID: ${linear.issueId}
- Title: ${linear.title}
- Description: ${linear.description}
```

#### If you only have the Linear URL (copy/paste)

If your n8n flow only has the issue URL, you can still make the automation reliable by forcing a JSON receipt:

```markdown
You have access to a Linear MCP. Open and update the Linear issue at this URL:
${linear.issueUrl}

Do the requested research/work and update the issue in Linear with:

- a short summary of findings
- next steps
- any blockers (if blocked)

At the end, output EXACTLY one single-line JSON receipt (no code fences) so automations can detect completion:
{"status":"completed|blocked","updatedLinear":true,"issueUrl":"${linear.issueUrl}","summary":"..."}
```

**What does Workflow “return” for MCP mode?**

- Workflow returns `job.result.output` (the text Claude printed). If you use the receipt pattern above, this will be a single JSON line.
- If you don’t care about the output, you can ignore it and rely on **job completion** via polling (`GET /api/jobs/:jobId`) or the **completion webhook callback** (`callback.url`).

### Template: Manual mode (structured JSON contract)

```markdown
Perform the task below. Do not use markdown in your final answer.

At the end, output EXACTLY one JSON object (no code fences) matching this schema:
{
"status": "completed|blocked|needs_review",
"summary": "1-3 sentence summary",
"changes": {
"highLevel": ["..."],
"notes": ["..."]
},
"nextSteps": ["..."]
}

Task:

- Title: ${task.title}
- Description: ${task.description}
```

Notes:

- For edit requests (`/api/edit`), branch/commit/MR details are available in `job.result.postExecution` and can be used as the source of truth.

## Planner Agent Template

The Planner Agent transforms vague software development tasks into detailed, actionable tasks for implementation.

### Template

```markdown
## You are a Planner Agent

Your job is to assist in transforming vague software development tasks into detailed, concise, and actionable tasks for a developer agent to implement.

## Your Task

**Title:** ${task.taskTitle}

**Description:** ${task.taskDescription}

${task.isBug ? "This task appears to be a bug. Your goal is to investigate the cause, identify relevant code, and produce a task for a developer to fix the issue." : ""}

## Instructions

1. **Interpret the task** based on the project context.
2. **Investigate the codebase** to determine where and how this task should be executed.
3. **Identify any relevant files, components, logic, or dependencies** that are involved.
4. **Break the task down into clear steps** for implementation.
5. **Specify a definition of done**, so a developer knows when the task is complete.

## Output Format (Markdown)

### Task Title

{Clear, concise, and updated version of the task title}

### Objective

{Short explanation of what the task is meant to accomplish}

### Relevant Files / Areas

- path/to/file1.tsx
- path/to/file2.ts
- component: `ComponentName`
- function: `functionName()`

### Steps to Complete

1. ...
2. ...
3. ...

### Definition of Done

- [ ] Task is implemented and committed to `{sourceBranch}`
- [ ] All tests pass
- [ ] UI/UX changes confirmed visually (if applicable)
- [ ] Code reviewed or PR created
```

### Variables

| Variable                  | Description                         | Example                      |
| ------------------------- | ----------------------------------- | ---------------------------- |
| `${task.taskTitle}`       | The task title from ClickUp         | "Add dark mode toggle"       |
| `${task.taskDescription}` | Full task description               | "Users should be able to..." |
| `${task.isBug}`           | Boolean indicating if tagged as bug | `true` or `false`            |
| `${sourceBranch}`         | Target branch for changes           | "feature/dark-mode"          |

### Usage with n8n

1. Create a **Set** node to build the prompt using the template above
2. Replace variables with data from the ClickUp trigger
3. Send to the Workflow `/api/ask` endpoint

### Usage with Direct API Call

```bash
curl -X POST https://your-workflow-instance/api/ask \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "workspaceId": "your-workspace-id",
    "sourceBranch": "main",
    "question": "## You are a Planner Agent\n\nYour job is to..."
  }'
```

## Best Practices

### Be Specific About Output Format

Always include a clear output format section so Claude knows exactly how to structure the response.

### Include Context

Provide enough context about the project, codebase structure, and conventions so the planner can make informed decisions.

### Handle Edge Cases

Include conditional instructions (like the bug handling example) for different task types.

## Next Steps

- See [n8n Workflows](/docs/n8n-workflows) for integration setup
- See [API Operations](/docs/api-operations) for API details
