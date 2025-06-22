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

4. **Claude Code headless calls failing completely**
   - This can occur when GitLab API keys for the Claude Code MCP server are incorrect or expired
   - Symptoms: Claude CLI commands hang, timeout, or fail with cryptic errors
   - Solution: Verify your GitLab API key configuration in the Claude Code MCP server settings
   - The Claude Code MCP server requires a valid GitLab API key even for basic operations

### Claude Code MCP Server Issues

If you're experiencing issues with Claude CLI headless execution (commands hanging, timeouts, or failing to respond), the problem may be related to Claude Code MCP server configuration:

**Symptoms:**
- `claude --version` works fine
- `claude -p "question"` hangs indefinitely or fails
- Headless Claude calls timeout without clear error messages
- Claude CLI appears to connect but never returns responses

**Root Cause:**
The Claude Code MCP server may be configured with an invalid or expired GitLab API key, causing all headless operations to fail silently.

**Recommended Solution (Current Project State):**
**🚨 IMPORTANT: For this project, it is recommended to NOT use the GitLab MCP server at all.**

The current implementation handles all git operations manually:
- **Before Claude Code**: Application prepares git workspace, branches, and context
- **After Claude Code**: Application handles commits, pushes, and merge request creation

**Why avoid GitLab MCP server:**
- Prevents API key configuration issues entirely
- Eliminates silent failures in headless operations
- Application's manual git handling provides better control and error handling
- Reduces complexity and potential points of failure

**Alternative Solutions (if MCP server is needed):**
1. Check your Claude Code MCP server configuration
2. Verify the GitLab API key is valid and has proper permissions
3. Update the API key if it has been rotated or expired
4. Restart the Claude Code MCP server after updating credentials

**Prevention:**
- **Recommended**: Configure Claude Code without GitLab MCP server integration
- If using MCP server: Monitor GitLab API key expiration dates
- Use tokens with appropriate long-term validity
- Set up monitoring/alerts for API key expiration
- Test Claude CLI functionality after any credential changes

### Best Practices

- Test with a simple public repository first
- Use tokens with minimal required permissions
- Keep tokens secure and rotate them regularly
- Use repository-specific deploy keys when possible for production environments
- **Test Claude CLI functionality after any API key changes** 