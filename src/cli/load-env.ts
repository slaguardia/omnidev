/**
 * Load `.env` / `.env.local` before reading OMNIDEV_* vars.
 *
 * Resolves the Omnidev repo root by walking up from `process.cwd()` until a
 * `package.json` with `"name": "omnidev"` is found, then loads env files from
 * that directory. If no repo root is found (e.g. global install), falls back
 * to the current working directory only.
 */

import { config } from 'dotenv';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const MAX_WALK_DEPTH = 40;

function findOmnidevRepoRoot(startDir: string): string | null {
  let dir = resolve(startDir);
  let depth = 0;
  while (depth < MAX_WALK_DEPTH) {
    const pkgPath = join(dir, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const raw = readFileSync(pkgPath, 'utf8');
        const pkg = JSON.parse(raw) as { name?: string };
        if (pkg.name === 'omnidev') {
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

export function loadCliEnv(): void {
  const repoRoot = findOmnidevRepoRoot(process.cwd());
  const base = repoRoot ?? process.cwd();

  const envPath = join(base, '.env');
  const localPath = join(base, '.env.local');

  if (existsSync(envPath)) {
    config({ path: envPath, quiet: true });
  }
  if (existsSync(localPath)) {
    config({ path: localPath, override: true, quiet: true });
  }
}
