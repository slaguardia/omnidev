#!/bin/sh
# Railway worker service: validate required env vars, then run the job worker.
set -e

# ---------- required env var checks ----------
missing=""
for var in DATABASE_URL NEXTAUTH_SECRET; do
  eval val=\$$var
  if [ -z "$val" ]; then
    missing="$missing $var"
  fi
done

if [ -n "$missing" ]; then
  echo "[railway-worker] ERROR: Missing required environment variable(s):$missing"
  echo "[railway-worker] Set these on the worker service or use Railway shared variables."
  echo "[railway-worker] See docs/RAILWAY.md for the full list."
  exit 1
fi

exec node worker.cjs
