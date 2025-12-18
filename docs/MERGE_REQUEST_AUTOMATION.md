# Merge Request Automation

This document explains how the merge request creation functionality works after Claude Code makes edits to your repository.

## Overview

The system can create merge requests after Claude Code makes changes to your workspace.

For edit requests submitted via `POST /api/edit` with `createMR: true`, git workflow + MR creation runs **inside the same queue job** (consistent whether the request is immediate or queued).

## Setup

### Environment Variables

Add these to your `.env` file:

Required for merge request creation:

```bash
GITLAB_TOKEN=your_gitlab_personal_access_token
GITLAB_URL=https://gitlab.com
```

Note: Use your GitLab instance URL if self-hosted

### GitLab Token Setup

1. Go to GitLab → User Settings → Access Tokens
2. Create a token with these scopes:
   - `api` (full API access)
   - `write_repository` (push code, create MRs)
3. Copy the token to your environment variables

## How It Works

### Automated MR Creation

After Claude Code completes any changes to your workspace:

1. **Change Detection**: The system checks if any files were modified
2. **Auto Commit**: Changes are automatically committed
3. **Branch Push**: The feature branch is pushed to the remote repository
4. **MR Creation**: A merge request is created (if GitLab API is configured)

### Branch Workflow

The system automatically detects:

- **Target Branch**: From the workspace configuration (falls back to the repo default branch)
- **Source Branch**:
  - If `sourceBranch === targetBranch`, the system will create a unique feature branch automatically
  - Otherwise it uses `sourceBranch`
- **Project ID**: Extracted from the repository URL when creating an MR

### MR Title/Description

MR metadata is generated automatically by the server (title/description include timestamps and commit info).
If you need fully custom MR metadata, that would be a follow-up enhancement to pass `title`/`description` through the `/api/edit` payload.

## API Usage

### Basic Merge Request Creation

```typescript
import { createMergeRequest } from '@/lib/gitlab';

const result = await createMergeRequest({
  projectId: 'your-project-id',
  title: 'Your MR Title',
  description: 'Your detailed description of changes',
  sourceBranch: 'feature-branch',
  targetBranch: 'main',
  labels: ['enhancement', 'claude-code'],
});
```

### Configuration Options

| Option               | Type     | Description                      | Default  |
| -------------------- | -------- | -------------------------------- | -------- |
| `projectId`          | string   | GitLab project ID                | Required |
| `title`              | string   | **Manual MR title**              | Required |
| `description`        | string   | **Manual MR description**        | Required |
| `sourceBranch`       | string   | Source branch name               | Required |
| `targetBranch`       | string   | Target branch for MR             | `main`   |
| `removeSourceBranch` | boolean  | Delete source branch after merge | `true`   |
| `squash`             | boolean  | Squash commits when merging      | `false`  |
| `assigneeId`         | number   | GitLab user ID to assign         | none     |
| `labels`             | string[] | Labels to add to MR              | `[]`     |

## Error Handling

The system gracefully handles errors:

**If GitLab token is missing:**

```json
{
  "autoMRDisabled": true,
  "warning": "GitLab token not configured - merge request creation skipped"
}
```

**If MR creation fails but Claude Code succeeds:**

```json
{
  "success": true,
  "response": "Claude response...",
  "postExecution": {
    "hasChanges": true,
    "pushedBranch": "feature/branch",
    "mergeRequestUrl": null
  }
}
```

## Best Practices

1. **Manual Descriptions**: Write clear, detailed descriptions explaining what changed and why
2. **Branch Naming**: Use descriptive branch names that reflect the changes
3. **Small Changes**: Ask Claude for focused, reviewable changes
4. **Environment Setup**: Ensure GitLab tokens are properly configured
5. **Review Process**: Always review merge requests before approving
6. **Testing**: Test changes locally before creating merge requests

## Troubleshooting

### Common Issues

1. **"GitLab token not configured"**

   - Ensure `GITLAB_TOKEN` is set in environment
   - Verify token has `api` and `write_repository` scopes

2. **"Auto mode is deprecated"**

   - Update your code to provide manual title and description
   - Remove reliance on auto-generated summaries

3. **"Failed to extract project ID"**

   - Check repository URL format
   - Ensure workspace is properly initialized

4. **"No current branch found"**
   - Ensure you're on a feature branch (not detached HEAD)
   - Claude Code will create a new branch if needed

## Deprecated Features

- **Auto-generated summaries**: AI-powered summary generation is no longer supported
- **Auto mode**: The `auto` parameter in `createMergeRequest` is deprecated
- **Claude API integration**: Merge request creation no longer uses external AI services
