# Repository Credentials Guide

## Overview

The application now supports cloning private repositories by providing credentials through the UI, eliminating the need for terminal password prompts.

## How to Use

### Dashboard Interface

1. Navigate to the **Dashboard** → **Operations** tab
2. In the "Clone Repository" section, enter your repository URL
3. Enable "Private Repository (requires authentication)" toggle
4. Enter your credentials:
   - **Username**: Your GitLab/GitHub username
   - **Password/Token**: Your personal access token (recommended) or password

### Credential Requirements

#### GitLab
- **Username**: Your GitLab username
- **Token**: Personal Access Token with `read_repository` scope
  - Create at: GitLab → Settings → Access Tokens
  - Token format: `glpat-xxxxxxxxxxxxxxxxxxxx`

#### GitHub
- **Username**: Your GitHub username  
- **Token**: Personal Access Token with `repo` scope
  - Create at: GitHub → Settings → Developer settings → Personal access tokens
  - Token format: `ghp_xxxxxxxxxxxxxxxxxxxx`

#### Other Git Providers
- Use your platform's username and personal access token/app password

## Security Notes

⚠️ **Important Security Considerations:**

1. **Use Personal Access Tokens**: Always prefer personal access tokens over passwords
2. **Minimal Permissions**: Grant only the minimum required permissions (read access)
3. **Token Expiry**: Set reasonable expiration dates for tokens
4. **No Storage**: Credentials are only used during the clone operation and are not stored
5. **HTTPS Only**: Only HTTPS repository URLs support credential authentication

## Example Usage

```
Repository URL: https://gitlab.com/mycompany/private-repo.git
Username: john.doe
Token: glpat-1234567890abcdef1234
```

## Troubleshooting

### Common Issues

1. **"Authentication failed"**
   - Verify your username and token are correct
   - Ensure the token has proper permissions
   - Check if the token has expired

2. **"Repository not found"**
   - Verify the repository URL is correct
   - Ensure you have access to the repository
   - Check if the repository is private and requires authentication

3. **"Invalid URL"**
   - Use HTTPS URLs only (not SSH)
   - Ensure the URL format is correct

### Best Practices

- Test with a simple public repository first
- Use tokens with minimal required permissions
- Keep tokens secure and rotate them regularly
- Use repository-specific deploy keys when possible for production environments 