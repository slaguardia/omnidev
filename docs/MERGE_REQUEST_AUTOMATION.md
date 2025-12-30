# Merge Request / Pull Request Automation

This document explains how the merge request (GitLab) and pull request (GitHub) creation functionality works after Claude Code makes edits to your repository.

## Overview

The system can create merge requests (GitLab) or pull requests (GitHub) after Claude Code makes changes to your workspace. The provider is automatically detected from the repository URL.

For edit requests submitted via `POST /api/edit` with `createMR: true`, git workflow + MR/PR creation runs **inside the same queue job** (consistent whether the request is immediate or queued).

## Setup

### Environment Variables

Add these to your `.env` file depending on your git provider:

**For GitLab repositories:**

```bash
GITLAB_TOKEN=your_gitlab_personal_access_token
GITLAB_URL=https://gitlab.com
```

Note: Use your GitLab instance URL if self-hosted

**For GitHub repositories:**

```bash
GITHUB_TOKEN=your_github_personal_access_token
```

### GitLab Token Setup

1. Go to GitLab → User Settings → Access Tokens
2. Create a token with these scopes:
   - `api` (full API access)
   - `write_repository` (push code, create MRs)
3. Copy the token to your environment variables

### GitHub Token Setup

1. Go to GitHub → Settings → Developer settings → Personal access tokens
2. Create a token with these scopes:
   - `repo` (full repository access)
3. Copy the token to your environment variables or configure via the Dashboard UI

## How It Works

### Provider Detection

The system automatically detects your git provider from the repository URL:

- URLs containing `github.com` or `github.` → GitHub (creates Pull Request)
- URLs containing `gitlab.com` or `gitlab.` → GitLab (creates Merge Request)
- Other URLs → No automatic MR/PR creation (changes are still pushed)

### Automated MR/PR Creation

After Claude Code completes any changes to your workspace:

1. **Change Detection**: The system checks if any files were modified
2. **Auto Commit**: Changes are automatically committed
3. **Branch Push**: The feature branch is pushed to the remote repository
4. **MR/PR Creation**: A merge request (GitLab) or pull request (GitHub) is created if the respective API is configured

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

### GitLab Merge Request Creation

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

### GitHub Pull Request Creation

```typescript
import { createPullRequest } from '@/lib/github';

const result = await createPullRequest({
  owner: 'repository-owner',
  repo: 'repository-name',
  title: 'Your PR Title',
  body: 'Your detailed description of changes',
  head: 'feature-branch',
  base: 'main',
});
```

### GitLab Configuration Options

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

### GitHub Configuration Options

| Option  | Type    | Description                 | Default  |
| ------- | ------- | --------------------------- | -------- |
| `owner` | string  | Repository owner/org        | Required |
| `repo`  | string  | Repository name             | Required |
| `title` | string  | Pull request title          | Required |
| `body`  | string  | Pull request description    | Required |
| `head`  | string  | Source branch name          | Required |
| `base`  | string  | Target branch for PR        | `main`   |
| `draft` | boolean | Create as draft PR          | `false`  |
| `token` | string  | GitHub token (if not in UI) | none     |

## Error Handling

The system gracefully handles errors:

**If GitLab token is missing (for GitLab repos):**

```json
{
  "autoMRDisabled": true,
  "warning": "GitLab token not configured - merge request creation skipped"
}
```

**If GitHub token is missing (for GitHub repos):**

```json
{
  "autoMRDisabled": true,
  "warning": "GitHub token not configured - pull request creation skipped"
}
```

**If MR/PR creation fails but Claude Code succeeds:**

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
4. **Environment Setup**: Ensure GitLab/GitHub tokens are properly configured for your repositories
5. **Review Process**: Always review merge requests/pull requests before approving
6. **Testing**: Test changes locally before creating merge requests/pull requests

## Troubleshooting

### Common Issues

1. **"GitLab token not configured"**

   - Ensure `GITLAB_TOKEN` is set in environment or configured via Dashboard UI
   - Verify token has `api` and `write_repository` scopes

2. **"GitHub token not configured"**

   - Ensure `GITHUB_TOKEN` is set in environment or configured via Dashboard UI
   - Verify token has `repo` scope

3. **"Auto mode is deprecated"**

   - Update your code to provide manual title and description
   - Remove reliance on auto-generated summaries

4. **"Failed to extract project ID"** (GitLab)

   - Check repository URL format
   - Ensure workspace is properly initialized

5. **"Could not extract owner/repo"** (GitHub)

   - Check repository URL format (should be `https://github.com/owner/repo`)
   - Ensure the URL is a valid GitHub repository URL

6. **"No current branch found"**
   - Ensure you're on a feature branch (not detached HEAD)
   - Claude Code will create a new branch if needed

## Deprecated Features

- **Auto-generated summaries**: AI-powered summary generation is no longer supported
- **Auto mode**: The `auto` parameter in `createMergeRequest` is deprecated
- **Claude API integration**: Merge request creation no longer uses external AI services
