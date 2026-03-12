#!/bin/bash
#
# Ralph Wiggum Loop - Autonomous Claude Code execution (Local Tasks)
# Spawns fresh Claude instances until all local JSON stories are complete
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROMPT_FILE="$SCRIPT_DIR/ralph-prompt.md"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
MAX_ITERATIONS=40
SLEEP_BETWEEN=2
TASKS_DIR=".tasks"

# Parse arguments
FEATURE_ID=""
while [[ $# -gt 0 ]]; do
    case $1 in
        --max-iterations)
            MAX_ITERATIONS="$2"
            shift 2
            ;;
        --sleep)
            SLEEP_BETWEEN="$2"
            shift 2
            ;;
        --tasks-dir)
            TASKS_DIR="$2"
            shift 2
            ;;
        --help|-h)
            echo "Usage: ralph.sh <FEATURE_ID> [options]"
            echo ""
            echo "Arguments:"
            echo "  FEATURE_ID    Feature ID from .tasks directory (e.g., FEAT-20240115_123456-abc1)"
            echo ""
            echo "Options:"
            echo "  --tasks-dir DIR     Tasks directory (default: .tasks)"
            echo "  --max-iterations N  Maximum iterations before stopping (default: 10)"
            echo "  --sleep N           Seconds to wait between iterations (default: 2)"
            echo "  --help, -h          Show this help message"
            echo ""
            echo "Examples:"
            echo "  ralph.sh FEAT-20240115_123456-abc1"
            echo "  ralph.sh FEAT-20240115_123456-abc1 --max-iterations 20"
            echo ""
            echo "To list available features:"
            echo "  ls .tasks/"
            exit 0
            ;;
        *)
            if [[ -z "$FEATURE_ID" ]]; then
                FEATURE_ID="$1"
            fi
            shift
            ;;
    esac
done

# Validate arguments
if [[ -z "$FEATURE_ID" ]]; then
    echo -e "${RED}Error: Feature ID required${NC}"
    echo "Usage: ralph.sh <FEATURE_ID> [--max-iterations N]"
    echo ""
    echo "Available features:"
    if [[ -d "$TASKS_DIR" ]]; then
        ls -1 "$TASKS_DIR" 2>/dev/null || echo "  (none found)"
    else
        echo "  (tasks directory not found)"
    fi
    exit 1
fi

# Validate feature directory exists
FEATURE_DIR="$TASKS_DIR/$FEATURE_ID"
if [[ ! -d "$FEATURE_DIR" ]]; then
    echo -e "${RED}Error: Feature not found: $FEATURE_DIR${NC}"
    echo ""
    echo "Available features:"
    ls -1 "$TASKS_DIR" 2>/dev/null || echo "  (none found)"
    exit 1
fi

if [[ ! -f "$FEATURE_DIR/feature.json" ]]; then
    echo -e "${RED}Error: feature.json not found in $FEATURE_DIR${NC}"
    exit 1
fi

# Check dependencies
if ! command -v claude &> /dev/null; then
    echo -e "${RED}Error: claude CLI not found${NC}"
    echo "Install Claude Code CLI first"
    exit 1
fi

if ! command -v jq &> /dev/null; then
    echo -e "${YELLOW}Warning: jq not found, some features may not work${NC}"
fi

# Block running on protected branches
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null)
if [[ "$CURRENT_BRANCH" == "main" || "$CURRENT_BRANCH" == "master" ]]; then
    echo -e "${RED}Error: Cannot run Ralph on protected branch '$CURRENT_BRANCH'${NC}"
    echo "Create a feature branch first: git checkout -b ralph/$FEATURE_ID"
    exit 1
fi

# State file
STATE_FILE=".ralph-state"

# Initialize or load state
init_state() {
    if [[ -f "$STATE_FILE" ]]; then
        CURRENT_FEATURE=$(jq -r '.featureId // empty' "$STATE_FILE" 2>/dev/null || echo "")
        if [[ "$CURRENT_FEATURE" != "$FEATURE_ID" ]]; then
            echo -e "${YELLOW}Different feature detected. Archiving previous state...${NC}"
            archive_state
            create_state
        else
            ITERATION=$(jq -r '.iteration // 0' "$STATE_FILE")
            echo -e "${BLUE}Resuming from iteration $ITERATION${NC}"
        fi
    else
        create_state
    fi
}

create_state() {
    BRANCH_NAME="ralph/$(echo "$FEATURE_ID" | tr '[:upper:]' '[:lower:]')"
    ITERATION=0
    cat > "$STATE_FILE" << EOF
{
  "featureId": "$FEATURE_ID",
  "featureDir": "$FEATURE_DIR",
  "branch": "$BRANCH_NAME",
  "iteration": 0,
  "startedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF
    echo -e "${GREEN}Created new Ralph state for $FEATURE_ID${NC}"
}

archive_state() {
    ARCHIVE_DIR=".ralph-archive"
    mkdir -p "$ARCHIVE_DIR"
    TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

    if [[ -f "$STATE_FILE" ]]; then
        mv "$STATE_FILE" "$ARCHIVE_DIR/state_$TIMESTAMP.json"
    fi
    if [[ -f "progress.txt" ]]; then
        cp "progress.txt" "$ARCHIVE_DIR/progress_$TIMESTAMP.txt"
    fi
    echo -e "${BLUE}Archived previous state to $ARCHIVE_DIR${NC}"
}

update_iteration() {
    local new_iteration=$1
    if [[ -f "$STATE_FILE" ]]; then
        jq ".iteration = $new_iteration" "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
    fi
}

# Cleanup on completion
cleanup() {
    if [[ -f "$STATE_FILE" ]]; then
        rm "$STATE_FILE"
        echo -e "${BLUE}Cleaned up .ralph-state${NC}"
    fi
    if [[ -f "progress.txt" ]]; then
        rm "progress.txt"
        echo -e "${BLUE}Cleaned up progress.txt${NC}"
    fi
}

# Ensure progress.txt exists
ensure_progress_file() {
    if [[ ! -f "progress.txt" ]]; then
        local feature_title=$(jq -r '.title // "Unknown Feature"' "$FEATURE_DIR/feature.json")
        cat > "progress.txt" << EOF
# Ralph Progress Log

## Feature: $FEATURE_ID
## Title: $feature_title
Started: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
Tasks Directory: $FEATURE_DIR

---

## Codebase Patterns

_Patterns discovered during implementation will be added here._

---

## Iteration Log

EOF
        echo -e "${GREEN}Created progress.txt${NC}"
    fi
}

# Get story status summary
get_status_summary() {
    local stories_dir="$FEATURE_DIR/stories"
    local total=0
    local done=0
    local in_progress=0
    local todo=0

    for story_file in "$stories_dir"/*.json; do
        if [[ -f "$story_file" ]]; then
            total=$((total + 1))
            local status=$(jq -r '.status // "todo"' "$story_file")
            case "$status" in
                done|completed) done=$((done + 1)) ;;
                in_progress|"in-progress") in_progress=$((in_progress + 1)) ;;
                *) todo=$((todo + 1)) ;;
            esac
        fi
    done

    echo "$total $done $in_progress $todo"
}

# Main loop
run_loop() {
    init_state
    ensure_progress_file

    local feature_title=$(jq -r '.title // "Unknown Feature"' "$FEATURE_DIR/feature.json")
    local status_summary=$(get_status_summary)
    read total done in_progress todo <<< "$status_summary"

    echo ""
    echo -e "${BLUE}=======================================================${NC}"
    echo -e "${BLUE}  Ralph Wiggum Loop (Local Tasks)${NC}"
    echo -e "${BLUE}  Feature: $FEATURE_ID${NC}"
    echo -e "${BLUE}  Title: $feature_title${NC}"
    echo -e "${BLUE}  Stories: $done/$total complete ($in_progress in progress, $todo todo)${NC}"
    echo -e "${BLUE}  Max iterations: $MAX_ITERATIONS${NC}"
    echo -e "${BLUE}=======================================================${NC}"
    echo ""

    for ((i=1; i<=MAX_ITERATIONS; i++)); do
        ITERATION=$((ITERATION + 1))
        update_iteration $ITERATION

        echo ""
        echo -e "${GREEN}-------------------------------------------------------${NC}"
        echo -e "${GREEN}  Iteration $ITERATION / $MAX_ITERATIONS${NC}"
        echo -e "${GREEN}  $(date)${NC}"
        echo -e "${GREEN}-------------------------------------------------------${NC}"
        echo ""

        # Create the prompt with the feature ID and directory
        if [[ ! -f "$PROMPT_FILE" ]]; then
            echo -e "${RED}Error: ralph-prompt.md not found at $PROMPT_FILE${NC}"
            echo "Make sure you copied both ralph.sh and ralph-prompt.md"
            exit 1
        fi
        PROMPT=$(cat "$PROMPT_FILE" | sed "s|{{FEATURE_ID}}|$FEATURE_ID|g" | sed "s|{{FEATURE_DIR}}|$FEATURE_DIR|g" | sed "s|{{TASKS_DIR}}|$TASKS_DIR|g")

        # Run Claude with the prompt
        OUTPUT=$(echo "$PROMPT" | claude --dangerously-skip-permissions 2>&1) || true

        echo "$OUTPUT"

        # Check for completion signal
        if echo "$OUTPUT" | grep -q "<promise>COMPLETE</promise>"; then
            # Update feature status
            jq '.status = "complete"' "$FEATURE_DIR/feature.json" > "$FEATURE_DIR/feature.json.tmp" && mv "$FEATURE_DIR/feature.json.tmp" "$FEATURE_DIR/feature.json"

            # Update index
            local final_summary=$(get_status_summary)
            read final_total final_done _ _ <<< "$final_summary"
            jq --argjson done "$final_done" '.completedStories = $done | .lastUpdated = "'"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"'"' "$FEATURE_DIR/index.json" > "$FEATURE_DIR/index.json.tmp" && mv "$FEATURE_DIR/index.json.tmp" "$FEATURE_DIR/index.json"

            cleanup
            echo ""
            echo -e "${GREEN}=======================================================${NC}"
            echo -e "${GREEN}  ALL STORIES COMPLETE!${NC}"
            echo -e "${GREEN}  Finished in $ITERATION iterations${NC}"
            echo -e "${GREEN}=======================================================${NC}"
            exit 0
        fi

        # Check for error signals
        if echo "$OUTPUT" | grep -q "BLOCKED\|ERROR\|needs breakdown"; then
            echo ""
            echo -e "${YELLOW}=======================================================${NC}"
            echo -e "${YELLOW}  Iteration encountered a blocker${NC}"
            echo -e "${YELLOW}  Check progress.txt for details${NC}"
            echo -e "${YELLOW}=======================================================${NC}"
            echo ""
            echo "Continue anyway? (y/N)"
            read -r response
            if [[ ! "$response" =~ ^[Yy]$ ]]; then
                exit 1
            fi
        fi

        # Wait before next iteration
        if [[ $i -lt $MAX_ITERATIONS ]]; then
            echo ""
            echo -e "${BLUE}Waiting ${SLEEP_BETWEEN}s before next iteration...${NC}"
            sleep "$SLEEP_BETWEEN"
        fi
    done

    echo ""
    echo -e "${YELLOW}=======================================================${NC}"
    echo -e "${YELLOW}  Max iterations ($MAX_ITERATIONS) reached${NC}"
    echo -e "${YELLOW}  Check progress.txt for current status${NC}"
    echo -e "${YELLOW}=======================================================${NC}"
    exit 1
}

# Run it
run_loop
