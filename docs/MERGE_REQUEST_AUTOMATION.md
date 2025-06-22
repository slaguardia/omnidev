# Merge Request Automation

This document explains how to use the automatic merge request creation functionality after Claude Code makes edits to your repository.

## Overview

The system supports creating merge requests manually after any changes with Claude-generated summaries.

## Setup

### Environment Variables

Add these to your `.env` file:

```bash
# Required for merge request creation
GITLAB_TOKEN=your_gitlab_personal_access_token
GITLAB_URL=https://gitlab.com  # or your GitLab instance URL

# Required for Claude-generated summaries
CLAUDE_API_KEY=your_anthropic_api_key
```

### GitLab Token Setup

1. Go to GitLab → User Settings → Access Tokens
2. Create a token with these scopes:
   - `api` (full API access)
   - `write_repository` (push code, create MRs)
3. Copy the token to your environment variables

## Usage

### Manual MR Creation

Create merge requests manually after any changes:

```typescript
// POST /api/merge-requests
{
  "workspaceId": "workspace123",
  "targetBranch": "main",
  "generateSummary": true,
  "originalQuestion": "Add error handling to the user authentication",
  "claudeResponse": "I've implemented comprehensive error handling...",
  "assigneeId": 123,
  "labels": ["enhancement", "backend"],
  "removeSourceBranch": true,
  "squash": true
}
```

**Manual Title/Description (optional):**
```typescript
{
  "workspaceId": "workspace123",
  "generateSummary": false,
  "manualTitle": "Fix authentication bug",
  "manualDescription": "This PR fixes the authentication issue by...",
  "targetBranch": "main"
}
```

## How It Works

### 1. Current Branch Detection

The system automatically detects:
- **Source Branch**: Current branch from `git branch --show-current`
- **Target Branch**: Defaults to `main` (configurable)
- **Project ID**: Extracted from the repository URL

### 2. Claude-Generated Summaries

Claude analyzes the changes and generates:

```typescript
{
  "title": "Add comprehensive error handling to user authentication",
  "description": "## Summary\nThis PR adds robust error handling...",
  "changes": [
    "Added try-catch blocks in auth middleware",
    "Implemented proper error logging",
    "Added user-friendly error messages"
  ],
  "impact": "medium",
  "confidence": 95,
  "suggestedLabels": ["enhancement", "security"],
  "estimatedReviewTime": "30 minutes"
}
```

### 3. Formatted MR Description

The final MR includes:
- **Summary** from Claude
- **Key Changes** list
- **Impact Assessment** (low/medium/high)
- **Confidence Score** (0-100%)
- **Original Request** (if provided)
- **Modified Files** list
- **Estimated Review Time**

## Integration Examples

### Frontend Usage

```typescript
// React component example
const handleCreateMR = async () => {
  const response = await fetch('/api/merge-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workspaceId: selectedWorkspace.id,
      generateSummary: true,
      targetBranch: 'main',
      labels: ['auto-generated', 'claude'],
      squash: true
    })
  });

  const result = await response.json();
  
  if (result.success) {
    showNotification(`MR created: ${result.webUrl}`);
  }
};
```

### CLI Integration

```bash
# Using curl to create MR after manual changes
curl -X POST http://localhost:3000/api/merge-requests \
  -H "Content-Type: application/json" \
  -d '{
    "workspaceId": "workspace123",
    "generateSummary": true,
    "targetBranch": "main",
    "labels": ["manual-mr", "feature"]
  }'
```

### MCP Server Integration

```typescript
// Call the MCP function directly
import { createAutomaticMergeRequest } from '@/utils/mergeRequestUtils';

const result = await createAutomaticMergeRequest({
  workspaceId: "workspace123",
  workspacePath: "/path/to/workspace",
  repoUrl: "https://gitlab.com/user/repo.git",
  sourceBranch: "feature-branch",
  targetBranch: "main",
  originalQuestion: "Add new feature",
  claudeResponse: "I've implemented the feature..."
}, {
  labels: ["mcp-generated"],
  squash: true
});
```

## Configuration Options

### MR Options

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `targetBranch` | string | Target branch for MR | `main` |
| `assigneeId` | number | GitLab user ID to assign | none |
| `labels` | string[] | Labels to add to MR | `[]` |
| `removeSourceBranch` | boolean | Delete source branch after merge | `true` |
| `squash` | boolean | Squash commits when merging | `false` |

### Summary Generation

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `generateSummary` | boolean | Use Claude to generate summary | `true` |
| `manualTitle` | string | Override generated title | none |
| `manualDescription` | string | Override generated description | none |

## Error Handling

The system gracefully handles errors:

```typescript
// If GitLab token is missing
{
  "error": "GitLab token is not configured",
  "autoMRDisabled": true
}

// If MR creation fails but Claude Code succeeds
{
  "success": true,
  "response": "Claude response...",
  "autoMR": {
    "enabled": true,
    "created": false
  }
}
```

## Best Practices

1. **Branch Naming**: Use descriptive branch names for better MR titles
2. **Small Changes**: Create MRs for focused, reviewable changes
3. **Labels**: Use consistent labeling for better organization
4. **Review**: Always review Claude-generated summaries before approving
5. **Testing**: Test changes locally before creating MRs

## Troubleshooting

### Common Issues

1. **"GitLab token not configured"**
   - Ensure `GITLAB_TOKEN` is set in environment
   - Verify token has `api` and `write_repository` scopes

2. **"Failed to extract project ID"**
   - Check repository URL format
   - Ensure workspace is properly initialized

3. **"No current branch found"**
   - Ensure you're on a feature branch (not detached HEAD)
   - Run `git checkout -b feature-branch` if needed

4. **"Permission denied"**
   - Verify GitLab token permissions
   - Check if user has push access to repository

### Debug Mode

Enable debug logging:

```bash
DEBUG=merge-request* npm run dev
```

This will show detailed logs of the MR creation process. 