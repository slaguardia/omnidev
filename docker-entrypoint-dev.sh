#!/bin/bash
set -e

# Create required directories
mkdir -p /app/workspaces /app/data

# Migrate Claude config symlinks (legacy layout compat)
if [ -f /home/nextjs/.claude.json ] || [ -f /home/nextjs/.claude/.claude.json ]; then
  mkdir -p /home/nextjs/.claude
  if [ -f /home/nextjs/.claude.json ] && [ ! -L /home/nextjs/.claude.json ] && [ ! -f /home/nextjs/.claude/.claude.json ]; then
    mv /home/nextjs/.claude.json /home/nextjs/.claude/.claude.json 2>/dev/null || true
  fi
  if [ -f /home/nextjs/.claude/.claude.json ]; then
    ln -sf /home/nextjs/.claude/.claude.json /home/nextjs/.claude.json 2>/dev/null || true
  fi
fi

if [ -f /home/nextjs/.claude.json.backup ] && [ ! -L /home/nextjs/.claude.json.backup ] && [ ! -f /home/nextjs/.claude/.claude.json.backup ]; then
  mkdir -p /home/nextjs/.claude
  mv /home/nextjs/.claude.json.backup /home/nextjs/.claude/.claude.json.backup 2>/dev/null || true
fi
if [ -f /home/nextjs/.claude/.claude.json.backup ]; then
  ln -sf /home/nextjs/.claude/.claude.json.backup /home/nextjs/.claude.json.backup 2>/dev/null || true
fi

# Fix permissions — include .next cache and node_modules so nextjs user can write
chown -R nextjs:nodejs /app/workspaces /app/data /home/nextjs /app/.next 2>/dev/null || true
chown -R nextjs:nodejs /app/node_modules 2>/dev/null || true

# Install dependencies (skip if SKIP_INSTALL=1, e.g. for worker sharing node_modules volume)
if [ "${SKIP_INSTALL}" != "1" ]; then
  pnpm install --frozen-lockfile
fi

# Build native addons if missing (pnpm doesn't reliably run install scripts in Docker volumes)
bs3_dir=/app/node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3
if compgen -G "$bs3_dir" > /dev/null; then
  cd $bs3_dir
  [ -f build/Release/better_sqlite3.node ] || npx --yes node-gyp rebuild --release
  cd /app
fi

# Run the passed command as nextjs user.
# The entrypoint runs as root for pnpm install and chown above,
# then drops privileges so Claude Code can use --dangerously-skip-permissions
# (which refuses to run under root/sudo).
# Default command: next dev (when no CMD is specified)
CMD_TO_RUN="${@:-pnpm exec next dev --hostname 0.0.0.0 --port 3000}"
if [ "$(id -u)" = "0" ] && command -v gosu >/dev/null 2>&1; then
  echo "[DEV] Dropping privileges to nextjs"
  exec gosu nextjs $CMD_TO_RUN
else
  exec $CMD_TO_RUN
fi
