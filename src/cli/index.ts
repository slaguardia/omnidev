#!/usr/bin/env node
/**
 * Omnidev Ralph CLI — loads `.env` / `.env.local` from the repo root (see load-env.ts), then subcommands.
 * Variables: env.example; remote and agents: docs/RALPH_CLI.md.
 */

import { loadCliEnv } from './load-env.js';
import { Command } from 'commander';
import { registerTaskCommands } from './commands/tasks.js';
import { registerLifecycleCommands } from './commands/lifecycle.js';
import { registerDepsCommands } from './commands/deps.js';
import { registerResourceCommands } from './commands/resources.js';
import { registerJobCommands } from './commands/jobs.js';

loadCliEnv();

const program = new Command();

program
  .name('ralph')
  .description('Omnidev Ralph CLI — task management from the command line')
  .version('1.0.0');

registerTaskCommands(program);
registerLifecycleCommands(program);
registerDepsCommands(program);
registerResourceCommands(program);
registerJobCommands(program);

program.parse();
