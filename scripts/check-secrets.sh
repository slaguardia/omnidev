#!/usr/bin/env bash
# ------------------------------------------------------------------
# Secret detection script for pre-commit hook
# Scans staged files for common secret patterns to prevent
# accidental credential commits.
#
# Usage:
#   As a pre-commit hook:  cp scripts/check-secrets.sh .git/hooks/pre-commit
#   Manual run:            bash scripts/check-secrets.sh
# ------------------------------------------------------------------

set -euo pipefail

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Patterns that indicate real secrets (not placeholders/examples)
# Each entry: "pattern_regex|description"
SECRET_PATTERNS=(
  'glpat-[A-Za-z0-9_\-]{20,}|GitLab Personal Access Token'
  'ghp_[A-Za-z0-9]{36,}|GitHub Personal Access Token'
  'gho_[A-Za-z0-9]{36,}|GitHub OAuth Token'
  'ghs_[A-Za-z0-9]{36,}|GitHub Server Token'
  'ghu_[A-Za-z0-9]{36,}|GitHub User Token'
  'github_pat_[A-Za-z0-9_]{22,}|GitHub Fine-Grained PAT'
  'sk-ant-[A-Za-z0-9\-]{20,}|Anthropic API Key'
  'sk-[A-Za-z0-9]{20,}|OpenAI-style API Key'
  'lin_api_[A-Za-z0-9]{20,}|Linear API Key'
  'AKIA[0-9A-Z]{16}|AWS Access Key ID'
  'xoxb-[0-9]{10,}-[A-Za-z0-9]{20,}|Slack Bot Token'
  'xoxp-[0-9]{10,}-[A-Za-z0-9]{20,}|Slack User Token'
  'xoxs-[0-9]{10,}-[A-Za-z0-9]{20,}|Slack Session Token'
  'SG\.[A-Za-z0-9_\-]{22,}\.[A-Za-z0-9_\-]{43,}|SendGrid API Key'
  'rk_live_[A-Za-z0-9]{20,}|Stripe Restricted Key'
  'sk_live_[A-Za-z0-9]{20,}|Stripe Secret Key'
)

# Files to always skip (binary, lock files, known safe patterns)
SKIP_PATTERNS='\.lock$|\.png$|\.jpg$|\.jpeg$|\.gif$|\.ico$|\.woff2?$|\.ttf$|\.eot$|\.svg$|node_modules|\.next/|pnpm-lock\.yaml$|package-lock\.json$'

found_secrets=0
checked_files=0

# Get staged files (if running as pre-commit hook with staged changes),
# otherwise scan all tracked files (manual run).
staged=$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null || true)
if [ -n "$staged" ]; then
  files="$staged"
  mode="staged"
else
  files=$(git ls-files 2>/dev/null)
  mode="all"
fi

if [ -z "$files" ]; then
  echo -e "${GREEN}No files to check.${NC}"
  exit 0
fi

while IFS= read -r file; do
  # Skip binary/irrelevant files
  if echo "$file" | grep -qE "$SKIP_PATTERNS"; then
    continue
  fi

  # Skip files that don't exist (deleted)
  if [ ! -f "$file" ]; then
    continue
  fi

  checked_files=$((checked_files + 1))

  # Get file content (staged version for pre-commit, working copy otherwise)
  if [ "$mode" = "staged" ]; then
    content=$(git show ":$file" 2>/dev/null || true)
  else
    content=$(cat "$file" 2>/dev/null || true)
  fi

  if [ -z "$content" ]; then
    continue
  fi

  for pattern_entry in "${SECRET_PATTERNS[@]}"; do
    pattern="${pattern_entry%%|*}"
    description="${pattern_entry##*|}"

    # Search for the pattern
    matches=$(echo "$content" | grep -nE "$pattern" 2>/dev/null || true)

    if [ -n "$matches" ]; then
      # Filter out obvious placeholders/examples
      real_matches=$(echo "$matches" | grep -vE 'placeholder|example|your-.*-here|xxxx|1234|TODO|CHANGEME|REPLACE_ME' || true)

      if [ -n "$real_matches" ]; then
        echo -e "${RED}POTENTIAL SECRET DETECTED${NC}"
        echo -e "  ${YELLOW}Type:${NC} $description"
        echo -e "  ${YELLOW}File:${NC} $file"
        while IFS= read -r line; do
          line_num="${line%%:*}"
          echo -e "  ${YELLOW}Line $line_num${NC}"
        done <<< "$real_matches"
        echo ""
        found_secrets=$((found_secrets + 1))
      fi
    fi
  done
done <<< "$files"

echo -e "Checked $checked_files file(s) for secret patterns."

if [ "$found_secrets" -gt 0 ]; then
  echo ""
  echo -e "${RED}Found $found_secrets potential secret(s).${NC}"
  echo -e "If these are false positives (e.g., documentation examples), you can:"
  echo -e "  1. Add the pattern to the SKIP list in scripts/check-secrets.sh"
  echo -e "  2. Bypass this check with: git commit --no-verify"
  echo ""
  exit 1
fi

echo -e "${GREEN}No secrets detected.${NC}"
exit 0
