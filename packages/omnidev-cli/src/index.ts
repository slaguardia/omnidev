/**
 * Omnidev CLI — loads `.env` / `.env.local` from the repo root (see load-env.ts), then subcommands.
 * Variables: env.example; remote and agents: docs/RALPH_CLI.md.
 */

import { loadCliEnv } from './load-env.js';
import { setGlobalConfigOverrides } from './config.js';
import { CLI_VERSION } from './version.js';
import { Command } from 'commander';
import { registerTaskCommands } from './commands/tasks.js';
import { registerLifecycleCommands } from './commands/lifecycle.js';
import { registerDepsCommands } from './commands/deps.js';
import { registerResourceCommands } from './commands/resources.js';
import { registerJobCommands } from './commands/jobs.js';

loadCliEnv();

const program = new Command();

program
  .name('omnidev')
  .description('Omnidev CLI — task management from the command line')
  .version(CLI_VERSION)
  .option('--url <url>', 'Omnidev server URL (overrides OMNIDEV_URL)')
  .option('--api-key <key>', 'API key (overrides OMNIDEV_API_KEY)');

registerTaskCommands(program);
registerLifecycleCommands(program);
registerDepsCommands(program);
registerResourceCommands(program);
registerJobCommands(program);

program.hook('preAction', () => {
  const o = program.opts() as { url?: string; apiKey?: string };
  setGlobalConfigOverrides({
    url: o.url,
    apiKey: o.apiKey,
  });
});

program.parse();
