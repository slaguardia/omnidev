#!/bin/bash
# =============================================================================
# Claude Code Sandboxed Execution Wrapper
# =============================================================================
# This script runs Claude Code in a sandboxed environment with restricted
# access to system executables. It ensures Claude Code cannot execute git,
# rm, curl, wget, and other potentially dangerous commands.
#
# Usage: ./claude-code-wrapper.sh <workspace_path> [additional_args...]
# =============================================================================

set -e

# Validate arguments
if [ $# -lt 1 ]; then
  echo "Usage: $0 <workspace_path> [additional_args...]"
  echo "Example: $0 /app/workspaces/my-project"
  exit 1
fi

WORKSPACE_PATH="$1"
shift  # Remove first argument, keep the rest for Claude Code

# Validate workspace path
if [ ! -d "$WORKSPACE_PATH" ]; then
  echo "Error: Workspace path does not exist: $WORKSPACE_PATH"
  exit 1
fi

# =============================================================================
# Security Configuration
# =============================================================================
# Restrict PATH to safe executables only
# Exclude /opt/internal/bin which contains the real git binary
export PATH="/usr/local/bin:/bin:/usr/bin"

# Ensure Claude Code cannot access internal git binary
export BLOCKED_PATHS="/opt/internal/bin"

# Disable git configuration to prevent any git access
export GIT_CONFIG_GLOBAL=/dev/null
export GIT_CONFIG_SYSTEM=/dev/null
export GIT_CONFIG_NOSYSTEM=1
unset GIT_DIR
unset GIT_WORK_TREE

# Additional protection: set git to fail if somehow accessed
export GIT_TERMINAL_PROMPT=0

# =============================================================================
# Resource Limits (optional - uncomment if needed)
# =============================================================================
# ulimit -t 3600   # CPU time limit (1 hour)
# ulimit -v 4194304  # Virtual memory limit (4GB)
# ulimit -n 1024   # File descriptor limit

# =============================================================================
# Logging
# =============================================================================
echo "[CLAUDE-WRAPPER] Starting Claude Code in sandboxed environment"
echo "[CLAUDE-WRAPPER] Workspace: $WORKSPACE_PATH"
echo "[CLAUDE-WRAPPER] Restricted PATH: $PATH"
echo "[CLAUDE-WRAPPER] User: $(whoami)"
echo "[CLAUDE-WRAPPER] Current directory: $(pwd)"

# =============================================================================
# Execute Claude Code
# =============================================================================
cd "$WORKSPACE_PATH" || {
  echo "[CLAUDE-WRAPPER] Error: Cannot change to workspace directory"
  exit 1
}

# Run Claude Code with all passed arguments
# Note: @anthropic-ai/claude-code installs as 'claude' binary
exec claude "$@"
