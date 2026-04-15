/**
 * CLI configuration — reads base URL and auth credentials from environment variables.
 *
 * The CLI entrypoint loads `.env` / `.env.local` from the Omnidev repo root
 * (see `load-env.ts` — walk-up for `package.json` name `omnidev` or `omnidev-app`),
 * or from `~/.config/omnidev/.env` for global installs.
 *
 * Supports two auth modes:
 * - OMNIDEV_CLI_TOKEN: scoped stage token (set by worker during agent execution)
 * - OMNIDEV_API_KEY: full API key (for manual CLI usage)
 *
 * Stage tokens take precedence when both are set.
 *
 * Global flags `--url` and `--api-key` override environment variables.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { parse } from 'dotenv';
import { getXdgConfigPath } from './load-env.js';

export interface CliConfig {
  baseUrl: string;
  apiKey: string;
  /** Scoped stage token — set by the worker, takes precedence over apiKey */
  cliToken: string;
  /** Task ID associated with the current stage token */
  taskId: string;
}

export interface ConfigOverrides {
  url?: string;
  apiKey?: string;
}

/** Set by root `program` global flags (`--url`, `--api-key`) via `preAction` hook */
let globalFlagOverrides: ConfigOverrides = {};

export function setGlobalConfigOverrides(overrides: ConfigOverrides): void {
  globalFlagOverrides = overrides;
}

export function getConfig(overrides?: ConfigOverrides): CliConfig {
  const merged = { ...globalFlagOverrides, ...overrides };
  const baseUrl = merged.url ?? process.env.OMNIDEV_URL ?? 'http://localhost:3000';
  const cliToken = process.env.OMNIDEV_CLI_TOKEN ?? '';
  const apiKey = merged.apiKey ?? process.env.OMNIDEV_API_KEY ?? '';
  const taskId = process.env.OMNIDEV_TASK_ID ?? '';

  if (!cliToken && !apiKey) {
    console.error('Error: OMNIDEV_API_KEY or OMNIDEV_CLI_TOKEN environment variable is required.');
    console.error('');
    console.error('Options:');
    console.error('  1. Pass --api-key <key> on the command line');
    console.error('  2. Set OMNIDEV_API_KEY in ~/.config/omnidev/.env (global install)');
    console.error('  3. Set OMNIDEV_API_KEY in your project .env file');
    console.error('  4. export OMNIDEV_API_KEY=your-key-here');
    process.exit(1);
  }

  return { baseUrl: baseUrl.replace(/\/+$/, ''), apiKey, cliToken, taskId };
}

export interface ConfigSource {
  source: string;
  url: string;
  maskedKey: string;
}

function maskKey(key: string): string {
  if (key.length <= 8) return '***';
  return `${key.slice(0, 4)}***${key.slice(-4)}`;
}

/**
 * Determine where the current OMNIDEV_URL and OMNIDEV_API_KEY values originate.
 * Checks sources in precedence order and returns the first that provides both values.
 */
export function getConfigSource(): ConfigSource {
  const url = globalFlagOverrides.url ?? process.env.OMNIDEV_URL ?? 'http://localhost:3000';
  const apiKey = globalFlagOverrides.apiKey ?? process.env.OMNIDEV_API_KEY ?? '';

  // 1. CLI flags
  if (globalFlagOverrides.url || globalFlagOverrides.apiKey) {
    return { source: 'CLI flags (--url / --api-key)', url, maskedKey: maskKey(apiKey) };
  }

  // 2. OMNIDEV_ENV_FILE
  const explicitPath = process.env.OMNIDEV_ENV_FILE;
  if (explicitPath && existsSync(explicitPath)) {
    return { source: `OMNIDEV_ENV_FILE (${explicitPath})`, url, maskedKey: maskKey(apiKey) };
  }

  // 3. Repo-root .env (walk up looking for omnidev package.json)
  // When found, XDG auth keys still override (matches loadCliEnv behavior)
  let dir = resolve(process.cwd());
  let repoEnvFound = false;
  for (let i = 0; i < 40; i++) {
    const pkgPath = join(dir, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { name?: string };
        if (pkg.name && (pkg.name === 'omnidev' || pkg.name === 'omnidev-app')) {
          if (existsSync(join(dir, '.env'))) {
            repoEnvFound = true;
          }
          break;
        }
      } catch {
        /* ignore */
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // 4. XDG config file (or XDG override when repo-root was found)
  const xdgEnvPath = join(getXdgConfigPath(), '.env');
  if (existsSync(xdgEnvPath)) {
    try {
      const parsed = parse(readFileSync(xdgEnvPath, 'utf8'));
      if (parsed.OMNIDEV_URL || parsed.OMNIDEV_API_KEY) {
        return {
          source: repoEnvFound ? `${xdgEnvPath} (overriding repo .env)` : xdgEnvPath,
          url,
          maskedKey: maskKey(apiKey),
        };
      }
    } catch {
      /* ignore */
    }
  }

  if (repoEnvFound) {
    return { source: join(dir, '.env'), url, maskedKey: maskKey(apiKey) };
  }

  // 5. Environment variables
  if (process.env.OMNIDEV_URL || process.env.OMNIDEV_API_KEY) {
    return { source: 'Environment variables', url, maskedKey: maskKey(apiKey) };
  }

  return { source: 'Default (no config found)', url, maskedKey: maskKey(apiKey) };
}
