/**
 * Load `.env` / `.env.local` before reading OMNIDEV_* vars.
 *
 * Discovery order (first match wins):
 *   1. OMNIDEV_ENV_FILE — explicit path override
 *   2. Repo-root walk-up — finds `package.json` with name `omnidev` or `omnidev-app`
 *   3. XDG config — `$XDG_CONFIG_HOME/omnidev/.env` (default `~/.config/omnidev/.env`)
 *   4. Current working directory `.env` / `.env.local`
 */

import { config } from 'dotenv';
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
    return;
  }

  // 3. XDG config directory
  const xdgConfigHome = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config');
  const xdgDir = join(xdgConfigHome, 'omnidev');
  if (loadEnvFiles(xdgDir)) {
    return;
  }

  // 4. Current working directory fallback
  loadEnvFiles(process.cwd());
}
