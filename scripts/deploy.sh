#!/bin/bash
# Deploy both web and worker services to Railway.
#
# Usage:
#   sh scripts/deploy.sh              # pre-deploy checks + deploy both
#   sh scripts/deploy.sh --skip-checks # deploy without checks
#   sh scripts/deploy.sh --web-only    # deploy web service only
#   sh scripts/deploy.sh --worker-only # deploy worker service only
set -e

SKIP_CHECKS=false
WEB=true
WORKER=true
EXTRA_ARGS=""

for arg in "$@"; do
  case "$arg" in
    --skip-checks) SKIP_CHECKS=true ;;
    --web-only)    WORKER=false ;;
    --worker-only) WEB=false ;;
    *)             EXTRA_ARGS="$EXTRA_ARGS $arg" ;;
  esac
done

# Resolve service names from environment or defaults.
# Override with RAILWAY_WEB_SERVICE / RAILWAY_WORKER_SERVICE if your services are named differently.
WEB_SERVICE="${RAILWAY_WEB_SERVICE:-omnidev}"
WORKER_SERVICE="${RAILWAY_WORKER_SERVICE:-omnidev-worker}"

if [ "$SKIP_CHECKS" = false ]; then
  echo "[deploy] Running pre-deploy checks..."
  sh "$(dirname "$0")/pre-deploy.sh"
  echo ""
fi

if [ "$WEB" = true ]; then
  echo "[deploy] Deploying web service ($WEB_SERVICE)..."
  railway up --service "$WEB_SERVICE" --detach $EXTRA_ARGS
  echo "[deploy] Web deploy triggered."
fi

if [ "$WORKER" = true ]; then
  echo "[deploy] Deploying worker service ($WORKER_SERVICE)..."
  railway up --service "$WORKER_SERVICE" --detach $EXTRA_ARGS
  echo "[deploy] Worker deploy triggered."
fi

echo ""
echo "[deploy] Done. Both services deploying in background."
echo "[deploy] View status: railway open"
