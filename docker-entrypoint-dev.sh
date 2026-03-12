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

# Fix permissions
chown -R nextjs:nodejs /app/workspaces /app/data /home/nextjs 2>/dev/null || true

# Install dependencies
pnpm install --frozen-lockfile

# Build native addons if missing (pnpm doesn't reliably run install scripts in Docker volumes)
bs3_dir=/app/node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3
if compgen -G "$bs3_dir" > /dev/null; then
  cd $bs3_dir
  [ -f build/Release/better_sqlite3.node ] || npx --yes node-gyp rebuild --release
  cd /app
fi

# Start dev server
exec pnpm exec next dev --hostname 0.0.0.0 --port 3000
