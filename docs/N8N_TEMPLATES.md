# n8n Templates

Ready-to-import n8n workflow templates for integrating with Workflow. Download the JSON files and import them directly into n8n.

For integration concepts, see [n8n Workflows](/docs/n8n-workflows). For async patterns, see [n8n Async Patterns](/docs/n8n-async-patterns).

---

## Available Templates

| Template  | Description                                         | Download                                                 |
| --------- | --------------------------------------------------- | -------------------------------------------------------- |
| Ask Flow  | Linear-triggered planning workflow with MCP updates | [n8n-ask-flow.json](/docs/templates/n8n-ask-flow.json)   |
| Edit Flow | Implementation workflow with branch/MR creation     | [n8n-edit-flow.json](/docs/templates/n8n-edit-flow.json) |

---

## Ask Flow

A complete workflow that triggers on Linear events and uses Claude to plan tasks.

### What It Does

1. **Assign Flow**: Triggers when an issue is assigned to the bot and moved to "Codespider In Progress"

   - Builds a prompt asking Claude to research and update the Linear issue description
   - Submits to Workflow API
   - Reassigns the issue when complete

2. **Comment Flow**: Triggers when someone mentions `@codespider` in a comment
   - Fetches the issue's project context via GraphQL
   - Asks Claude to address the comment and update the plan
   - Claude replies to the comment when done

### Customization Required

After importing, update these values:

| Field                  | Location             | Description                              |
| ---------------------- | -------------------- | ---------------------------------------- |
| `your-bot@example.com` | If nodes             | Your bot's email address                 |
| `YOUR_WORKSPACE_ID`    | HTTP Request nodes   | Your Workflow workspace ID               |
| `YOUR_TEAM_ID`         | Linear Trigger nodes | Your Linear team ID                      |
| `YOUR_ASSIGNEE_ID`     | Update Issue node    | User ID to reassign to after planning    |
| `YOUR_STATE_ID`        | Update Issue node    | State ID to move issue to after planning |
| Workflow URL           | HTTP Request nodes   | Your Workflow instance URL               |

### Credentials Needed

- **Bearer Auth**: Your Workflow API key
- **Linear API**: Your Linear API token
- **Header Auth**: Linear API token (for GraphQL queries)

---

## Edit Flow

_(Coming soon - drop your edit flow JSON into `docs/templates/n8n-edit-flow.json`)_

---

## Setup Guide

### 1. Import the Template

1. Download the JSON file
2. In n8n, go to **Workflows** → **Import from File**
3. Select the downloaded JSON

### 2. Configure Credentials

Create these credentials in n8n before activating:

**Bearer Auth (for Workflow API)**

- Name: `Workflow API`
- Token: Your Workflow API key

**Linear API**

- Name: `Linear account`
- API Key: Your Linear personal API key

**Header Auth (for Linear GraphQL)**

- Name: `Linear GraphQL`
- Header Name: `Authorization`
- Header Value: `Bearer YOUR_LINEAR_API_KEY`

### 3. Update Placeholders

Search for `YOUR_` in the workflow and replace all placeholder values with your actual IDs.

### 4. Set Up n8n Variables (Optional)

For cleaner workflows, configure these in **Settings** → **Variables**:

| Variable             | Example                        | Purpose                   |
| -------------------- | ------------------------------ | ------------------------- |
| `workflowBaseUrl`    | `https://workflow.example.com` | Your Workflow instance    |
| `defaultWorkspaceId` | `ws_abc123`                    | Default workspace ID      |
| `botEmail`           | `bot@example.com`              | Bot's email for filtering |

---

## How the Prompts Work

The Ask Flow uses prompts that leverage Claude's Linear MCP access:

**Assign Flow Prompt:**

> You have access to a Linear MCP. Open the Linear issue at this URL: `{issue.url}` and do the requested research to create a robust plan for the work being requested and update ONLY the issue description in Linear.

**Comment Flow Prompt:**

> You have access to a Linear MCP. Review my latest comment on this issue: `{issue.url}` and do the requested research to address my comment and update the issue description with any changes to the plan. When you are done, leave a brief reply to my comment.

This approach means Claude handles the Linear updates directly - your n8n workflow just needs to trigger Claude and optionally reassign the issue afterward.

---

## Tips

### Error Handling

The templates use `neverError: true` on HTTP requests so you can handle errors explicitly rather than having the workflow fail.

### Timeouts

API requests have a 10-second timeout. For long-running Claude operations, the API returns `queued: true` immediately - you don't need a long timeout.

### Testing

1. Set the workflow to **Inactive** first
2. Use **Test Workflow** with sample data
3. Check the execution log for any credential or ID issues
4. Activate once everything works

---

## Next Steps

- [n8n Workflows](/docs/n8n-workflows) - Integration concepts
- [n8n Async Patterns](/docs/n8n-async-patterns) - Handling queued requests
- [Prompt Templates](/docs/prompt-templates) - More prompt examples
- [API Operations](/docs/api-operations) - Full API reference
