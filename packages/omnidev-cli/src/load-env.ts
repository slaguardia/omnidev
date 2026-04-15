/**
 * Load `.env` / `.env.local` before reading OMNIDEV_* vars.
 *
 * Discovery order (first match wins):
 *   1. OMNIDEV_ENV_FILE — explicit path override
 *   2. Repo-root walk-up — finds `package.json` with name `omnidev` or `omnidev-app`
 *   3. XDG config — `$XDG_CONFIG_HOME/omnidev/.env` (default `~/.config/omnidev/.env`)
 *   4. Current working directory `.env` / `.env.local`
 *
 * After initial load, XDG config values for OMNIDEV_URL and OMNIDEV_API_KEY
 * always override repo-root values when present (since XDG represents an
 * explicit user choice for a remote instance).
 */

import { config, parse } from 'dotenv';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';

const MAX_WALK_DEPTH = 40;
const REPO_ROOT_NAMES = new Set(['omnidev', 'omnidev-app']);

function findOmnidevRepoRoot(startDir: string): string | null {
  let dir = resolve(startDir);
  let depth = 0;
  while (depth < MAX_WALK_DEPTH) {
    const pkgPath = join(dir, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const raw = readFileSync(pkgPath, 'utf8');
        const pkg = JSON.parse(raw) as { name?: string };
        if (pkg.name && REPO_ROOT_NAMES.has(pkg.name)) {
          return dir;
        }
      } catch {
        /* ignore invalid package.json */
      }
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
    depth += 1;
  }
  return null;
}

function loadEnvFiles(base: string): boolean {
  const envPath = join(base, '.env');
  const localPath = join(base, '.env.local');
  let found = false;

  if (existsSync(envPath)) {
    config({ path: envPath, quiet: true });
    found = true;
  }
  if (existsSync(localPath)) {
    config({ path: localPath, override: true, quiet: true });
    found = true;
  }
  return found;
}

/** Returns the XDG config directory for omnidev (`$XDG_CONFIG_HOME/omnidev` or `~/.config/omnidev`). */
export function getXdgConfigPath(): string {
  const xdgConfigHome = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config');
  return join(xdgConfigHome, 'omnidev');
}

/** Auth-specific keys that XDG config can override after initial env load. */
const XDG_OVERRIDE_KEYS = ['OMNIDEV_URL', 'OMNIDEV_API_KEY'] as const;

export function loadCliEnv(): void {
  // 1. Explicit env file override
  const explicitPath = process.env.OMNIDEV_ENV_FILE;
  if (explicitPath && existsSync(explicitPath)) {
    config({ path: explicitPath, quiet: true });
    return;
  }

  // 2. Repo-root walk-up
  const repoRoot = findOmnidevRepoRoot(process.cwd());
  if (repoRoot) {
    loadEnvFiles(repoRoot);
    // XDG override: let user's explicit auth config take precedence over repo .env
    applyXdgAuthOverrides();
    return;
  }

  // 3. XDG config directory
  const xdgDir = getXdgConfigPath();
  if (loadEnvFiles(xdgDir)) {
    return;
  }

  // 4. Current working directory fallback
  loadEnvFiles(process.cwd());
}

/**
 * Read the XDG config file and override OMNIDEV_URL / OMNIDEV_API_KEY in
 * process.env if present. Other vars from repo .env are preserved.
 */
function applyXdgAuthOverrides(): void {
  const xdgEnvPath = join(getXdgConfigPath(), '.env');
  if (!existsSync(xdgEnvPath)) return;

  try {
    const raw = readFileSync(xdgEnvPath, 'utf8');
    const parsed = parse(raw);
    for (const key of XDG_OVERRIDE_KEYS) {
      if (parsed[key]) {
        process.env[key] = parsed[key];
      }
    }
  } catch {
    /* ignore unreadable XDG config */
  }
}
