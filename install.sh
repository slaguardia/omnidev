#!/usr/bin/env bash
# ============================================================================
# Omnidev — one-line VPS installer
# ============================================================================
# Usage (interactive):
#   curl -fsSL https://raw.githubusercontent.com/slaguardia/omnidev/master/install.sh | bash
#
# Usage (non-interactive, env-driven):
#   CURSOR_API_KEY=cursor_sk_... bash install.sh
#
# What it does, in order:
#   1.  Detects a supported OS (Ubuntu / Debian).
#   2.  Installs Docker + the compose plugin if missing (official upstream
#       convenience script).
#   3.  Creates /opt/omnidev/ (or $OMNIDEV_HOME) and downloads the published
#       Compose file.
#   4.  Generates random secrets (NEXTAUTH_SECRET, INITIAL_SIGNUP_TOKEN,
#       POSTGRES_PASSWORD) into /opt/omnidev/.env with mode 0600.
#   5.  Reads CURSOR_API_KEY from env, or prompts the user interactively.
#       Optionally collects GITHUB_TOKEN / GITLAB_TOKEN.
#   6.  Pulls images from GHCR and starts the stack via docker compose.
#   7.  Polls /api/health until the dashboard is up (or fails loudly with the
#       last 50 lines of container logs).
#   8.  Prints the dashboard URL and the one-time signup token.
#
# Re-running on an existing install: preserves /opt/omnidev/.env, pulls the
# latest images, and restarts the stack. Use OMNIDEV_FORCE=1 to wipe and
# reinitialize secrets.
# ============================================================================

set -euo pipefail

# ----- Defaults / env -------------------------------------------------------

OMNIDEV_HOME="${OMNIDEV_HOME:-/opt/omnidev}"
OMNIDEV_VERSION="${OMNIDEV_VERSION:-latest}"
OMNIDEV_PORT="${OMNIDEV_PORT:-3000}"
OMNIDEV_BIND_ADDR="${OMNIDEV_BIND_ADDR:-127.0.0.1}"
OMNIDEV_REPO_URL="${OMNIDEV_REPO_URL:-https://raw.githubusercontent.com/slaguardia/omnidev}"
OMNIDEV_REF="${OMNIDEV_REF:-master}"
OMNIDEV_FORCE="${OMNIDEV_FORCE:-0}"

# Where to download the Compose file from (versioned in source tree).
COMPOSE_URL="${OMNIDEV_REPO_URL}/${OMNIDEV_REF}/docker/docker-compose.install.yml"

# ----- Output helpers -------------------------------------------------------

if [[ -t 1 && "${NO_COLOR:-}" == "" ]]; then
  BOLD=$'\033[1m'
  DIM=$'\033[2m'
  RED=$'\033[31m'
  GREEN=$'\033[32m'
  YELLOW=$'\033[33m'
  CYAN=$'\033[36m'
  RESET=$'\033[0m'
else
  BOLD="" DIM="" RED="" GREEN="" YELLOW="" CYAN="" RESET=""
fi

info()  { printf '%s[omnidev]%s %s\n' "$CYAN" "$RESET" "$*"; }
warn()  { printf '%s[omnidev]%s %s%s%s\n' "$YELLOW" "$RESET" "$YELLOW" "$*" "$RESET" >&2; }
err()   { printf '%s[omnidev]%s %s%s%s\n' "$RED"    "$RESET" "$RED"    "$*" "$RESET" >&2; }
ok()    { printf '%s[omnidev]%s %s%s%s\n' "$GREEN"  "$RESET" "$GREEN"  "$*" "$RESET"; }
note()  { printf '%s        %s%s\n' "$DIM" "$*" "$RESET"; }

die()   { err "$*"; exit 1; }

# ----- Permission helper ----------------------------------------------------
# All system-affecting commands route through SUDO so the script works both
# as root (CI, fresh VPS) and as a regular user with passwordless sudo.

if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
  SUDO=""
else
  if command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
  else
    die "Not running as root and 'sudo' is not installed. Re-run as root or install sudo."
  fi
fi

# ----- OS detection ---------------------------------------------------------

detect_os() {
  if [[ ! -r /etc/os-release ]]; then
    die "Cannot read /etc/os-release — unsupported OS. Omnidev installs on Ubuntu/Debian."
  fi
  # shellcheck disable=SC1091
  . /etc/os-release
  case "${ID:-}" in
    ubuntu|debian) info "Detected ${PRETTY_NAME:-$ID}" ;;
    *)
      die "Unsupported OS '${ID:-unknown}'. Omnidev's installer supports Ubuntu and Debian at launch."
      ;;
  esac
}

# ----- Docker ---------------------------------------------------------------

ensure_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    info "Docker and compose plugin already present: $(docker --version)"
    return
  fi

  info "Installing Docker via the official convenience script…"
  local tmp
  tmp="$(mktemp)"
  curl -fsSL https://get.docker.com -o "$tmp"
  $SUDO sh "$tmp"
  rm -f "$tmp"

  if ! command -v docker >/dev/null 2>&1; then
    die "Docker install reported success but 'docker' is not on PATH."
  fi
  if ! docker compose version >/dev/null 2>&1; then
    die "Docker installed but the 'compose' plugin is missing. Install docker-compose-plugin manually and re-run."
  fi
  ok "Docker installed: $(docker --version)"
}

# ----- Filesystem -----------------------------------------------------------

ensure_dir() {
  if [[ ! -d "$OMNIDEV_HOME" ]]; then
    info "Creating $OMNIDEV_HOME"
    $SUDO mkdir -p "$OMNIDEV_HOME"
    $SUDO chown "$(id -u):$(id -g)" "$OMNIDEV_HOME"
  fi
}

download_compose() {
  info "Downloading docker-compose.install.yml from $COMPOSE_URL"
  local target="$OMNIDEV_HOME/docker-compose.install.yml"
  curl -fsSL "$COMPOSE_URL" -o "$target"
  # Sanity: must look like a Compose file.
  if ! grep -q "^services:" "$target"; then
    die "Downloaded file at $target does not look like a Compose file. Aborting."
  fi
  ok "Compose file written to $target"
}

# ----- Secrets / .env -------------------------------------------------------

random_hex() {
  # Prefer openssl when available; fall back to /dev/urandom.
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "${1:-32}"
  else
    head -c "${1:-32}" /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

prompt_secret() {
  # $1=var name, $2=prompt, $3=optional default
  local varname="$1" prompt="$2" default="${3:-}" value=""
  if [[ -t 0 ]]; then
    if [[ -n "$default" ]]; then
      read -r -p "$prompt [$default]: " value || true
      value="${value:-$default}"
    else
      read -r -p "$prompt: " value || true
    fi
  else
    # Non-interactive: must come from env. Empty result means "skip".
    value="$default"
  fi
  printf -v "$varname" '%s' "$value"
}

resolve_cursor_api_key() {
  if [[ -n "${CURSOR_API_KEY:-}" ]]; then
    info "Using CURSOR_API_KEY from environment."
    return
  fi
  if [[ ! -t 0 ]]; then
    die "CURSOR_API_KEY is required and the installer is running non-interactively. Re-run with CURSOR_API_KEY=cursor_sk_... bash install.sh"
  fi
  printf '\n%sOmnidev needs a Cursor API key to run agent jobs.%s\n' "$BOLD" "$RESET"
  note "Generate one at https://cursor.com/dashboard → Integrations."
  note "For shared deployments, prefer a Service Account API Key from Team Settings."
  while [[ -z "${CURSOR_API_KEY:-}" ]]; do
    read -r -s -p "Paste CURSOR_API_KEY (input hidden): " CURSOR_API_KEY || true
    printf '\n'
    if [[ -z "$CURSOR_API_KEY" ]]; then
      warn "Empty input. Try again or Ctrl-C to abort."
    fi
  done
  export CURSOR_API_KEY
}

write_env() {
  local env_path="$OMNIDEV_HOME/.env"

  if [[ -f "$env_path" && "$OMNIDEV_FORCE" != "1" ]]; then
    info "Existing .env detected at $env_path — preserving secrets. (OMNIDEV_FORCE=1 to wipe.)"
    # Still allow updating CURSOR_API_KEY if it was provided this run.
    if [[ -n "${CURSOR_API_KEY:-}" ]] && ! grep -q "^CURSOR_API_KEY=" "$env_path"; then
      printf 'CURSOR_API_KEY=%s\n' "$CURSOR_API_KEY" >> "$env_path"
      info "Appended CURSOR_API_KEY to existing .env."
    fi
    return
  fi

  info "Generating fresh secrets in $env_path"

  resolve_cursor_api_key

  local nextauth_secret signup_token postgres_password
  nextauth_secret="$(random_hex 32)"
  signup_token="$(random_hex 24)"
  postgres_password="$(random_hex 24)"

  # NEXTAUTH_URL: the dashboard's externally-visible URL. With the default
  # bind to 127.0.0.1 this is localhost-only. The install script does not
  # try to auto-detect the public hostname — the user provides it via env
  # var or accepts the localhost default and reverse-proxies later.
  local nextauth_url="${NEXTAUTH_URL:-http://${OMNIDEV_BIND_ADDR}:${OMNIDEV_PORT}}"

  local github_token="${GITHUB_TOKEN:-}"
  local gitlab_token="${GITLAB_TOKEN:-}"
  local gitlab_url="${GITLAB_URL:-}"

  # Write atomically: full content into a temp, then rename.
  local tmp_env
  tmp_env="$(mktemp)"
  {
    printf '# Omnidev environment — generated by install.sh on %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf '# Edit values below to reconfigure; re-run install.sh to apply.\n\n'

    printf 'OMNIDEV_VERSION=%s\n' "$OMNIDEV_VERSION"
    printf 'OMNIDEV_PORT=%s\n' "$OMNIDEV_PORT"
    printf 'OMNIDEV_BIND_ADDR=%s\n\n' "$OMNIDEV_BIND_ADDR"

    printf 'NEXTAUTH_SECRET=%s\n' "$nextauth_secret"
    printf 'NEXTAUTH_URL=%s\n' "$nextauth_url"
    printf 'INITIAL_SIGNUP_TOKEN=%s\n\n' "$signup_token"

    printf 'POSTGRES_USER=omnidev\n'
    printf 'POSTGRES_PASSWORD=%s\n' "$postgres_password"
    printf 'POSTGRES_DB=omnidev\n'
    printf 'DATABASE_URL=postgresql://omnidev:%s@postgres:5432/omnidev?schema=public\n\n' "$postgres_password"

    printf 'CURSOR_API_KEY=%s\n\n' "$CURSOR_API_KEY"

    printf '# Optional git provider tokens (leave blank to skip):\n'
    printf 'GITHUB_TOKEN=%s\n' "$github_token"
    printf 'GITLAB_URL=%s\n' "$gitlab_url"
    printf 'GITLAB_TOKEN=%s\n\n' "$gitlab_token"

    printf 'OMNIDEV_WORKER_CONCURRENCY=%s\n' "${OMNIDEV_WORKER_CONCURRENCY:-3}"
    printf 'API_RATE_LIMIT=%s\n' "${API_RATE_LIMIT:-100}"
  } > "$tmp_env"

  chmod 0600 "$tmp_env"
  mv "$tmp_env" "$env_path"

  # Save the signup token to a side file so the user can recover it after
  # the initial console output scrolls away. Mode 0600 — it's a credential.
  printf '%s\n' "$signup_token" > "$OMNIDEV_HOME/.signup-token"
  chmod 0600 "$OMNIDEV_HOME/.signup-token"

  ok "Wrote $env_path (mode 0600). Signup token cached at $OMNIDEV_HOME/.signup-token."
}

# ----- Compose lifecycle ----------------------------------------------------

compose() {
  ( cd "$OMNIDEV_HOME" && docker compose -f docker-compose.install.yml --env-file .env "$@" )
}

start_stack() {
  info "Pulling images (this may take a few minutes on first run)…"
  compose pull
  info "Starting stack (docker compose up -d)…"
  compose up -d
}

wait_for_health() {
  local url="http://${OMNIDEV_BIND_ADDR}:${OMNIDEV_PORT}/api/health"
  info "Waiting for dashboard health at $url …"
  local deadline=$(( $(date +%s) + 120 ))
  while (( $(date +%s) < deadline )); do
    if curl -fsS --max-time 3 "$url" >/dev/null 2>&1; then
      ok "Dashboard is healthy."
      return
    fi
    sleep 3
  done

  err "Dashboard did not become healthy within 120s. Last 50 lines of logs:"
  compose logs --tail=50 || true
  die "Install failed at health check. Run 'docker compose -f $OMNIDEV_HOME/docker-compose.install.yml --env-file $OMNIDEV_HOME/.env logs -f' to investigate."
}

# ----- Done banner ----------------------------------------------------------

print_done_banner() {
  local signup_token
  signup_token="$(cat "$OMNIDEV_HOME/.signup-token" 2>/dev/null || printf '<see %s>' "$OMNIDEV_HOME/.signup-token")"

  printf '\n'
  ok "Omnidev is up."
  printf '\n'
  printf '  %sDashboard%s   http://%s:%s\n' "$BOLD" "$RESET" "$OMNIDEV_BIND_ADDR" "$OMNIDEV_PORT"
  printf '  %sSignup token%s %s\n' "$BOLD" "$RESET" "$signup_token"
  printf '\n'
  printf '  Next steps:\n'
  printf '    1. Open the dashboard URL above (or set up a reverse proxy if exposing to the internet).\n'
  printf '    2. Sign up the first user with the token above.\n'
  printf '    3. (Optional) Set GITHUB_TOKEN in %s/.env to enable push.\n' "$OMNIDEV_HOME"
  printf '\n'
  printf '  Manage the stack:\n'
  printf '    %scd %s%s\n' "$DIM" "$OMNIDEV_HOME" "$RESET"
  printf '    %sdocker compose -f docker-compose.install.yml --env-file .env logs -f%s\n' "$DIM" "$RESET"
  printf '    %sdocker compose -f docker-compose.install.yml --env-file .env restart%s\n' "$DIM" "$RESET"
  printf '    %sdocker compose -f docker-compose.install.yml --env-file .env down%s\n' "$DIM" "$RESET"
  printf '\n'
}

# ----- Main -----------------------------------------------------------------

main() {
  info "Omnidev installer starting."
  detect_os
  ensure_docker
  ensure_dir
  download_compose
  write_env
  start_stack
  wait_for_health
  print_done_banner
}

main "$@"
