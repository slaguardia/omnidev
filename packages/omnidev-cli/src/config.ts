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
