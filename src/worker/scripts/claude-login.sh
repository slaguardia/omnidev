#!/bin/sh
# Authenticate Claude Code as the nextjs user so credentials land on the
# persistent volume at /home/nextjs/.claude.
#
# Usage (from railway shell or docker exec):
#   sh src/worker/scripts/claude-login.sh
#   # or, if installed to PATH:
#   claude-login
set -e

TARGET_HOME="/home/nextjs"

# Ensure the .claude directory exists and is owned by nextjs.
mkdir -p "$TARGET_HOME/.claude" 2>/dev/null || true
chown -R nextjs:nodejs "$TARGET_HOME" 2>/dev/null || true

if command -v gosu >/dev/null 2>&1; then
  exec gosu nextjs env HOME="$TARGET_HOME" claude "$@"
elif command -v su >/dev/null 2>&1; then
  exec su -s /bin/sh nextjs -c "HOME=$TARGET_HOME claude $*"
else
  echo "[claude-login] Neither gosu nor su found — running as current user with HOME=$TARGET_HOME"
  exec env HOME="$TARGET_HOME" claude "$@"
fi
