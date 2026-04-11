#!/bin/sh
# Add a persistent volume for Claude Code auth on the worker service.
# Requires Railway CLI: link the project, then select the worker service (or pass --service).
#
# Usage:
#   railway link   # pick worker service
#   sh src/worker/scripts/railway-volume-worker.sh
#
# Git Bash on Windows may mangle paths starting with / — use PowerShell instead:
#   railway volume add --mount-path /home/nextjs/.claude
#
# Or:
#   railway volume add --mount-path /home/nextjs/.claude --service <worker-service-name>
set -e
exec railway volume add --mount-path /home/nextjs/.claude "$@"
