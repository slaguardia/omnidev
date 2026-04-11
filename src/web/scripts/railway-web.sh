#!/bin/sh
# Railway web service: wait for Postgres, run migrations, then Next.js only (no worker).
set -e
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
exec node src/web/server.js
