#!/bin/sh

# Add debug logging
echo "[ENTRYPOINT] Starting entrypoint script..."
echo "[ENTRYPOINT] Current user: $(whoami)"
echo "[ENTRYPOINT] Current directory: $(pwd)"
echo "[ENTRYPOINT] NEXTAUTH_SECRET_FILE: $NEXTAUTH_SECRET_FILE"
echo "[ENTRYPOINT] NEXTAUTH_SECRET provided: $( [ -n "$NEXTAUTH_SECRET" ] && echo "yes" || echo "no" )"

# -----------------------------------------------------------------------------
# Claude Code persistence helpers
# -----------------------------------------------------------------------------
# Claude Code stores auth under ~/.claude, but also writes a ~/.claude.json file
# in the user's home directory. If only ~/.claude is persisted via a volume,
# ~/.claude.json will be lost on container recreate, which can trigger setup/login
# prompts again. We migrate these files into ~/.claude and symlink them back.
persist_claude_home_files() {
  USER_HOME="$1"
  if [ -z "$USER_HOME" ]; then
    return 0
  fi

  # Only touch Claude's home files if they already exist.
  # If nothing exists yet, Claude should create it during interactive login.
  if [ ! -f "$USER_HOME/.claude.json" ] && [ ! -f "$USER_HOME/.claude/.claude.json" ]; then
    return 0
  fi

  # Ensure base dirs exist (only when we actually need to migrate/symlink)
  mkdir -p "$USER_HOME/.claude" 2>/dev/null || true

  # Migrate + symlink ~/.claude.json
  if [ -f "$USER_HOME/.claude.json" ] && [ ! -L "$USER_HOME/.claude.json" ]; then
    if [ ! -f "$USER_HOME/.claude/.claude.json" ]; then
      mv "$USER_HOME/.claude.json" "$USER_HOME/.claude/.claude.json" 2>/dev/null || true
    fi
  fi
  # Only create the symlink if we have a concrete target file.
  if [ -f "$USER_HOME/.claude/.claude.json" ]; then
    ln -sf "$USER_HOME/.claude/.claude.json" "$USER_HOME/.claude.json" 2>/dev/null || true
  fi

  # Migrate + symlink ~/.claude.json.backup
  if [ -f "$USER_HOME/.claude.json.backup" ] && [ ! -L "$USER_HOME/.claude.json.backup" ]; then
    if [ ! -f "$USER_HOME/.claude/.claude.json.backup" ]; then
      mv "$USER_HOME/.claude.json.backup" "$USER_HOME/.claude/.claude.json.backup" 2>/dev/null || true
    fi
  fi
  if [ -f "$USER_HOME/.claude/.claude.json.backup" ]; then
    ln -sf "$USER_HOME/.claude/.claude.json.backup" "$USER_HOME/.claude.json.backup" 2>/dev/null || true
  fi
}

run_as_nextjs_if_root() {
  if [ "$(id -u)" != "0" ]; then
    return 1
  fi

  # Ensure the nextjs home exists and is writable (named volumes default to root-owned).
  mkdir -p /home/nextjs/.claude 2>/dev/null || true
  chown -R nextjs:nodejs /home/nextjs 2>/dev/null || true

  # Some deployments persist workspaces + secrets too; try to fix ownership if mounted.
  chown -R nextjs:nodejs /app/workspaces 2>/dev/null || true
  chown -R nextjs:nodejs /secrets 2>/dev/null || true

  # Ensure Claude Code persistence for the intended runtime user.
  export HOME=/home/nextjs
  persist_claude_home_files "$HOME"

  # Drop privileges for the main process.
  exec gosu nextjs "$@"
}

# If we're root (recommended in Dockerfile), fix volume permissions then drop to nextjs.
run_as_nextjs_if_root "$@" || {
  # Otherwise, best-effort for the current user (prod may run as nextjs already).
  persist_claude_home_files "$HOME"
}

# Support both direct secret and file-based secret.
# - If NEXTAUTH_SECRET is already set, use it as-is.
# - Else, if NEXTAUTH_SECRET_FILE is set, load/generate from that file.
if [ -n "$NEXTAUTH_SECRET" ]; then
  echo "[ENTRYPOINT] Using NEXTAUTH_SECRET from environment"
  echo "[ENTRYPOINT] Secret length: ${#NEXTAUTH_SECRET} characters"
  echo "[ENTRYPOINT] Entrypoint script completed successfully"
  echo "[ENTRYPOINT] Running main process: $@"
  exec "$@"
fi

# Ensure env variable is set for file-based secret
if [ -z "$NEXTAUTH_SECRET_FILE" ]; then
  echo "[ENTRYPOINT] ERROR: Env var 'NEXTAUTH_SECRET' or 'NEXTAUTH_SECRET_FILE' must be set"
  exit 1
fi

SECRET_FILE="${NEXTAUTH_SECRET_FILE}"
echo "[ENTRYPOINT] Secret file path: $SECRET_FILE"

# Ensure secrets directory exists (try to create if it doesn't exist)
SECRETS_DIR=$(dirname "$SECRET_FILE")
echo "[ENTRYPOINT] Secrets directory: $SECRETS_DIR"

if [ ! -d "$SECRETS_DIR" ]; then
  echo "[ENTRYPOINT] Creating secrets directory: $SECRETS_DIR"
  mkdir -p "$SECRETS_DIR" 2>/dev/null || {
    echo "[ENTRYPOINT] WARNING: Could not create secrets directory $SECRETS_DIR"
    echo "[ENTRYPOINT] This might be a permission issue if running as non-root user"
  }
fi

# Try to set permissions on secrets directory (will fail gracefully if not root)
chmod 700 "$SECRETS_DIR" 2>/dev/null || echo "[ENTRYPOINT] WARNING: Could not chmod $SECRETS_DIR (not root)"

# Generate secret if it doesn't exist
if [ ! -f "$SECRET_FILE" ]; then
  echo "[ENTRYPOINT] Generating NEXTAUTH_SECRET..."
  openssl rand -base64 32 > "$SECRET_FILE" 2>/dev/null || {
    echo "[ENTRYPOINT] ERROR: Could not generate secret file $SECRET_FILE"
    echo "[ENTRYPOINT] This might be a permission issue if running as non-root user"
    exit 1
  }
  echo "[ENTRYPOINT] Secret file created successfully"
else
  echo "[ENTRYPOINT] Using existing NEXTAUTH_SECRET..."
fi

# Read and export the secret
if [ -f "$SECRET_FILE" ]; then
  export NEXTAUTH_SECRET="$(cat "$SECRET_FILE")"
  echo "[ENTRYPOINT] NEXTAUTH_SECRET exported successfully"
  echo "[ENTRYPOINT] Secret length: ${#NEXTAUTH_SECRET} characters"
else
  echo "[ENTRYPOINT] ERROR: Secret file $SECRET_FILE does not exist and could not be created"
  exit 1
fi

echo "[ENTRYPOINT] Entrypoint script completed successfully"
echo "[ENTRYPOINT] Running main process: $@"

# Debug: Test if the environment variable is available to the process
echo "[ENTRYPOINT] Testing NEXTAUTH_SECRET availability..."
node -e "console.log('NEXTAUTH_SECRET available:', !!process.env.NEXTAUTH_SECRET); console.log('NEXTAUTH_SECRET length:', process.env.NEXTAUTH_SECRET ? process.env.NEXTAUTH_SECRET.length : 'undefined');" 2>/dev/null || echo "[ENTRYPOINT] Could not test with node (node not available in this context)"

# Run the main process
exec "$@"
