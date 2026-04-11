#!/bin/bash
# =============================================================================
# create-task — Create a Ralph task via the local API
# =============================================================================
# Called by Claude Code inside the container to create tasks.
# Validates required inputs and calls POST /api/ralph/tasks/create.
#
# Env (same as the Omnidev Ralph CLI, with legacy aliases):
#   OMNIDEV_URL or OMNIDEV_API_URL — API base (default http://localhost:$PORT)
#   OMNIDEV_API_KEY or API_KEY — API key for X-API-Key
#
# Usage:
#   create-task --workspace-id <id> --title <title> --description <desc> [options]
#
# Required:
#   --workspace-id    Workspace ID to create the task in
#   --title           Task title
#   --description     Task description
#
# Optional:
#   --file-paths      Comma-separated file paths (e.g. "src/foo.ts,src/bar.ts")
#   --delivery-method "merge-request" (default) or "direct-commit"
#   --parent-id       Parent task ID (creates subtask)
#   --project-id      Project ID to associate with
#
# Output:
#   JSON with task_created status and task details on success
#   JSON with error message on failure
# =============================================================================

set -euo pipefail

# Defaults
WORKSPACE_ID=""
TITLE=""
DESCRIPTION=""
FILE_PATHS=""
DELIVERY_METHOD="merge-request"
PARENT_ID=""
PROJECT_ID=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --workspace-id)     WORKSPACE_ID="$2";      shift 2 ;;
    --title)            TITLE="$2";             shift 2 ;;
    --description)      DESCRIPTION="$2";       shift 2 ;;
    --file-paths)       FILE_PATHS="$2";        shift 2 ;;
    --delivery-method)  DELIVERY_METHOD="$2";   shift 2 ;;
    --parent-id)        PARENT_ID="$2";         shift 2 ;;
    --project-id)       PROJECT_ID="$2";        shift 2 ;;
    *)
      echo "{\"error\": \"Unknown argument: $1\"}" >&2
      exit 1
      ;;
  esac
done

# Validate required fields
if [[ -z "$WORKSPACE_ID" ]]; then
  echo '{"error": "Missing required flag: --workspace-id"}'
  exit 1
fi
if [[ -z "$TITLE" ]]; then
  echo '{"error": "Missing required flag: --title"}'
  exit 1
fi
if [[ -z "$DESCRIPTION" ]]; then
  echo '{"error": "Missing required flag: --description"}'
  exit 1
fi

# Validate delivery method
if [[ "$DELIVERY_METHOD" != "merge-request" && "$DELIVERY_METHOD" != "direct-commit" ]]; then
  echo '{"error": "Invalid --delivery-method. Must be \"merge-request\" or \"direct-commit\""}'
  exit 1
fi

# Build file paths JSON array
FILE_PATHS_JSON="[]"
if [[ -n "$FILE_PATHS" ]]; then
  FILE_PATHS_JSON=$(echo "$FILE_PATHS" | tr ',' '\n' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | jq -R . | jq -s .)
fi

# Build JSON payload using jq for safe escaping
PAYLOAD=$(jq -n \
  --arg title "$TITLE" \
  --arg workspaceId "$WORKSPACE_ID" \
  --arg description "$DESCRIPTION" \
  --argjson filePaths "$FILE_PATHS_JSON" \
  --arg deliveryMethod "$DELIVERY_METHOD" \
  --arg parentId "$PARENT_ID" \
  --arg projectId "$PROJECT_ID" \
  '{
    title: $title,
    workspaceId: $workspaceId,
    description: $description,
    filePaths: $filePaths,
    deliveryMethod: $deliveryMethod
  }
  + (if $parentId != "" then {parentId: $parentId} else {} end)
  + (if $projectId != "" then {projectId: $projectId} else {} end)'
)

# Determine API base URL (OMNIDEV_URL matches the Ralph CLI; OMNIDEV_API_URL is legacy)
API_BASE="${OMNIDEV_URL:-${OMNIDEV_API_URL:-http://localhost:${PORT:-3000}}}"
API_BASE="${API_BASE%/}"

# API key header (OMNIDEV_API_KEY matches the CLI; API_KEY is legacy)
API_KEY_HEADER="${OMNIDEV_API_KEY:-${API_KEY:-}}"

# Call the API
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ${API_KEY_HEADER}" \
  -d "$PAYLOAD" \
  "${API_BASE}/api/ralph/tasks/create" 2>/dev/null)

# Split response body and status code
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [[ "$HTTP_CODE" -ge 200 && "$HTTP_CODE" -lt 300 ]]; then
  echo "$BODY" | jq '{
    task_created: true,
    id: .task.id,
    title: .task.title,
    taskNumber: .task.taskNumber,
    status: .task.status,
    message: .message
  }'
else
  echo "$BODY" | jq '{task_created: false, error: .error, details: .details}' 2>/dev/null || echo "{\"task_created\": false, \"error\": \"HTTP $HTTP_CODE\", \"raw\": $(echo "$BODY" | jq -R .)}"
  exit 1
fi
