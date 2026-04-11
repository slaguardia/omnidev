#!/bin/sh
# Railway web service: validate env, wait for Postgres, run migrations, then Next.js only (no worker).
set -e

# ---------- required env var checks (skipped in showcase mode) ----------
if [ "${SHOWCASE_MODE:-}" != "true" ] && [ "${NEXT_PUBLIC_SHOWCASE_MODE:-}" != "true" ]; then
  missing=""
  for var in NEXTAUTH_SECRET NEXTAUTH_URL; do
    eval val=\$$var
    if [ -z "$val" ]; then
      missing="$missing $var"
    fi
  done

  if [ -n "$missing" ]; then
    echo "[railway-web] ERROR: Missing required environment variable(s):$missing"
    echo "[railway-web] Set these on the web service or use Railway shared variables."
    echo "[railway-web] See docs/RAILWAY.md for the full list."
    exit 1
  fi
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[railway-web] DATABASE_URL not set — skipping Prisma migrations (SQLite fallback)."
else
  i=0
  until prisma migrate deploy --schema=/app/prisma/schema.prisma; do
    i=$((i + 1))
    if [ "$i" -ge 30 ]; then
      echo "[railway-web] prisma migrate deploy failed after 30 attempts — is DATABASE_URL correct and Postgres running?"
      exit 1
    fi
    echo "[railway-web] Waiting for Postgres (attempt $i)..."
    sleep 2
  done
fi
exec node src/web/server.js
