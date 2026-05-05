#!/usr/bin/env bash
# PreToolUse hook: block `git push` to protected branches.
# Reads JSON from stdin (Claude Code hook input). Exits 0 to allow,
# exit 2 + stderr to deny (model sees the stderr message).
#
# Edit PROTECTED to change the list. Limitations: argument parsing is
# best-effort and assumes whitespace-tokenized commands; complex quoting
# may slip through. Chained commands (&&, ||, ;, |) are split and each
# `git push` segment is checked.

set -uo pipefail

PROTECTED=("master" "main")

INPUT=$(cat)
COMMAND=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // ""')
CWD=$(printf '%s' "$INPUT" | jq -r '.cwd // "."')

is_protected() {
  local b="$1"
  for p in "${PROTECTED[@]}"; do
    [ "$b" = "$p" ] && return 0
  done
  return 1
}

deny() {
  printf 'Blocked: %s\n' "$1" >&2
  printf 'Protected branches: %s\n' "${PROTECTED[*]}" >&2
  printf 'The user can run this command directly if needed.\n' >&2
  exit 2
}

check_push() {
  local args_str="$1"
  # shellcheck disable=SC2206
  local args=($args_str)

  local has_tags=0 has_all=0 has_mirror=0
  local positional=()
  local skip_next=0

  for arg in "${args[@]+"${args[@]}"}"; do
    if [ "$skip_next" = 1 ]; then
      skip_next=0
      continue
    fi
    case "$arg" in
      --all)                 has_all=1 ;;
      --mirror)              has_mirror=1 ;;
      --tags|--follow-tags)  has_tags=1 ;;
      --repo|-o|--push-option|--receive-pack|--exec|--upload-pack|--signed)
        skip_next=1
        ;;
      -*) ;; # other flags ignored
      *)  positional+=("$arg") ;;
    esac
  done

  if [ "$has_all" = 1 ]; then
    deny "git push --all would touch protected branches"
  fi
  if [ "$has_mirror" = 1 ]; then
    deny "git push --mirror would touch protected branches"
  fi

  # positional[0] is remote; rest are refspecs.
  local refspecs=()
  if [ "${#positional[@]}" -gt 1 ]; then
    refspecs=("${positional[@]:1}")
  fi

  if [ "${#refspecs[@]}" -eq 0 ]; then
    if [ "$has_tags" = 1 ]; then
      return 0
    fi
    local current
    current=$(git -C "$CWD" symbolic-ref --short HEAD 2>/dev/null || true)
    if [ -n "$current" ] && is_protected "$current"; then
      deny "current branch '$current' is protected (no refspec given, would push current)"
    fi
    return 0
  fi

  for refspec in "${refspecs[@]}"; do
    refspec="${refspec#+}"
    local dst
    if [[ "$refspec" == *:* ]]; then
      dst="${refspec#*:}"
    else
      dst="$refspec"
    fi
    dst="${dst#refs/heads/}"
    if is_protected "$dst"; then
      deny "would push to protected branch '$dst'"
    fi
  done
}

# Split on shell separators so chained commands are each inspected.
SPLIT=$(printf '%s' "$COMMAND" | sed -E 's/(\&\&|\|\||;|\|)/\n/g')

while IFS= read -r line; do
  line="$(printf '%s' "$line" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g')"
  [ -z "$line" ] && continue
  if [[ "$line" =~ ^git[[:space:]]+push([[:space:]]|$) ]]; then
    rest="${line#git push}"
    rest="$(printf '%s' "$rest" | sed -E 's/^[[:space:]]+//')"
    check_push "$rest"
  fi
done <<< "$SPLIT"

exit 0
