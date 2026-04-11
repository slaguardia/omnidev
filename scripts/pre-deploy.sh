#!/bin/bash
# Pre-deploy checks: run before pushing to Railway.
# Catches type errors, test failures, and uncommitted changes before a ~5 min Docker build.
set -e

echo "[pre-deploy] Checking for uncommitted changes..."
if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
  echo "[pre-deploy] WARNING: You have uncommitted changes."
  echo "[pre-deploy] Railway deploys from the working directory, not from git HEAD."
  echo "[pre-deploy] Commit or stash before deploying to avoid confusion."
  # Not a hard failure — railway up uploads the working directory, so uncommitted code DOES deploy.
  # But it's easy to forget what state was deployed.
fi

echo "[pre-deploy] Type checking..."
pnpm typecheck

echo "[pre-deploy] Running tests..."
pnpm test

echo ""
echo "[pre-deploy] All checks passed."
