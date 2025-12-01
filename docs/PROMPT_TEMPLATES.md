# Prompt Templates

This guide provides prompt templates for use with n8n workflows and direct API calls.

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
    "message": "## You are a Planner Agent\n\nYour job is to...",
    "workspaceId": "your-workspace-id"
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
