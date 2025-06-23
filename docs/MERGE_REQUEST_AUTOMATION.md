# Merge Request Automation

This document explains how the merge request creation functionality works after Claude Code makes edits to your repository.

## Overview

The system can create merge requests after Claude Code makes changes to your workspace. **Note: Auto-generated summaries using AI are deprecated.** You must now provide manual titles and descriptions for merge requests.

## Setup

### Environment Variables

Add these to your `.env` file:

```bash
# Required for merge request creation
GITLAB_TOKEN=your_gitlab_personal_access_token
GITLAB_URL=https://gitlab.com  # or your GitLab instance URL
```

### GitLab Token Setup

1. Go to GitLab → User Settings → Access Tokens
2. Create a token with these scopes:
   - `api` (full API access)
   - `write_repository` (push code, create MRs)
3. Copy the token to your environment variables

## How It Works

### Manual MR Creation

After Claude Code completes any changes to your workspace:

1. **Change Detection**: The system checks if any files were modified
2. **Auto Commit**: Changes are automatically committed with a descriptive message
3. **Branch Push**: The feature branch is pushed to the remote repository
4. **MR Creation**: A merge request is created with **manually provided** title and description

### Current Branch Detection

The system automatically detects:
- **Source Branch**: Current branch from `git branch --show-current`
- **Target Branch**: Defaults to `main` (configurable)
- **Project ID**: Extracted from the repository URL

### Manual Descriptions Required

**IMPORTANT**: Auto-generated summaries are deprecated. You must provide:
- **Title**: A clear, descriptive title for your merge request
- **Description**: A detailed description of the changes made

The system will include context about:
- Modified files list
- Original question/request (if available)
- Basic merge request metadata

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
  labels: ['enhancement', 'claude-code']
});
```

### Configuration Options

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `projectId` | string | GitLab project ID | Required |
| `title` | string | **Manual MR title** | Required |
| `description` | string | **Manual MR description** | Required |
| `sourceBranch` | string | Source branch name | Required |
| `targetBranch` | string | Target branch for MR | `main` |
| `removeSourceBranch` | boolean | Delete source branch after merge | `true` |
| `squash` | boolean | Squash commits when merging | `false` |
| `assigneeId` | number | GitLab user ID to assign | none |
| `labels` | string[] | Labels to add to MR | `[]` |

## Error Handling

The system gracefully handles errors:

```typescript
// If GitLab token is missing
{
  "autoMRDisabled": true,
  "warning": "GitLab token not configured - merge request creation skipped"
}

// If title/description is missing (auto mode deprecated)
{
  "success": false,
  "error": "Auto mode is deprecated. Please provide title and description manually."
}

// If MR creation fails but Claude Code succeeds
{
  "success": true,
  "response": "Claude response...",
  "mergeRequest": {
    "created": false,
    "error": "Failed to create merge request"
  }
}
```

## Migration from Auto Mode

If you were using auto mode (deprecated), update your code:

```typescript
// OLD (deprecated)
const result = await createMergeRequest(options, true); // auto mode

// NEW (required)
const result = await createMergeRequest({
  ...options,
  title: "Your manual title",
  description: "Your manual description"
}, false); // manual mode
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