/**
 * CLI configuration — reads base URL and auth credentials from environment variables.
 *
 * The CLI entrypoint loads `.env` and `.env.local` from the Omnidev repo root
 * (see `load-env.ts` — discovers root by walking up to `package.json` name `omnidev`).
 *
 * Supports two auth modes:
 * - OMNIDEV_CLI_TOKEN: scoped stage token (set by worker during agent execution)
 * - OMNIDEV_API_KEY: full API key (for manual CLI usage)
 *
 * Stage tokens take precedence when both are set.
 */

export interface CliConfig {
  baseUrl: string;
  apiKey: string;
  /** Scoped stage token — set by the worker, takes precedence over apiKey */
  cliToken: string;
  /** Task ID associated with the current stage token */
  taskId: string;
}

export function getConfig(): CliConfig {
  const baseUrl = process.env.OMNIDEV_URL ?? 'http://localhost:3000';
  const cliToken = process.env.OMNIDEV_CLI_TOKEN ?? '';
  const apiKey = process.env.OMNIDEV_API_KEY ?? '';
  const taskId = process.env.OMNIDEV_TASK_ID ?? '';

  if (!cliToken && !apiKey) {
    console.error('Error: OMNIDEV_API_KEY or OMNIDEV_CLI_TOKEN environment variable is required.');
    console.error('Generate an API key from the Omnidev web UI and set it:');
    console.error('  export OMNIDEV_API_KEY=your-key-here');
    process.exit(1);
  }

  return { baseUrl: baseUrl.replace(/\/+$/, ''), apiKey, cliToken, taskId };
}
