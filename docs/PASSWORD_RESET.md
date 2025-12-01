# Password Reset Guide

## Overview

This application uses a single-user authentication system with no email recovery. If you forget your password, you must reset the account manually.

## Reset Process

### Step 1: Locate the users file

The user credentials are stored in:

```
/workspaces/users.json
```

### Step 2: Delete the users file

```bash
rm /workspaces/users.json
```

### Step 3: Create new account

1. Navigate to `/signin` in your browser
2. The system will detect no user exists
3. You will see the "Create Account" form
4. Enter your new username and password

## Important Notes

- **Single User System**: Only one user account can exist at a time
- **Data Preservation**: Deleting users.json does NOT delete your workspaces or configurations
- **Configuration Preserved**: The `app-config.json` file with your GitLab/Claude settings remains intact
- **API Keys**: Generated API keys will continue to work

## Docker/Container Environment

If running in Docker, you may need to:

1. Access the container shell: `docker exec -it <container_name> /bin/sh`
2. Delete the file: `rm /app/workspaces/users.json`
3. Exit and refresh the browser

## Security Warning

Anyone with filesystem access can reset the account. Ensure proper access controls are in place for production deployments.
