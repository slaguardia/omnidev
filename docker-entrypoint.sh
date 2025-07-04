#!/bin/sh

# Add debug logging
echo "[ENTRYPOINT] Starting entrypoint script..."
echo "[ENTRYPOINT] Current user: $(whoami)"
echo "[ENTRYPOINT] Current directory: $(pwd)"
echo "[ENTRYPOINT] NEXTAUTH_SECRET_FILE: $NEXTAUTH_SECRET_FILE"

# Ensure env variable is set
if [ -z "$NEXTAUTH_SECRET_FILE" ]; then
  echo "[ENTRYPOINT] ERROR: Env var 'NEXTAUTH_SECRET_FILE' missing"
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
