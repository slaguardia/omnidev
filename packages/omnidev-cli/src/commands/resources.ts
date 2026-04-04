/**
 * Resource listing commands: workspaces, projects, playbooks.
 */

import { Command } from 'commander';
import * as api from '../api-client.js';
import {
  formatWorkspaceList,
  formatProjectList,
  formatPlaybookList,
  formatError,
} from '../formatter.js';

export function registerResourceCommands(program: Command): void {
  // ── workspaces ──
  program
    .command('workspaces')
    .description('List available workspaces')
    .option('--branches', 'Include branch lists')
    .option('--json', 'Output as JSON')
    .action(async (opts: Record<string, unknown>) => {
      try {
        const result = await api.listWorkspaces(!!opts.branches);

        if (opts.json) {
          console.log(JSON.stringify(result.data, null, 2));
        } else {
          console.log(formatWorkspaceList(result.data.workspaces));
        }
      } catch (err) {
        console.error(formatError((err as Error).message));
        process.exit(1);
      }
    });

  // ── projects ──
  program
    .command('projects')
    .description('List Ralph projects')
    .option('--json', 'Output as JSON')
    .action(async (opts: Record<string, unknown>) => {
      try {
        const result = await api.listProjects();

        if (opts.json) {
          console.log(JSON.stringify(result.data, null, 2));
        } else {
          console.log(formatProjectList(result.data.projects));
        }
      } catch (err) {
        console.error(formatError((err as Error).message));
        process.exit(1);
      }
    });

  // ── playbooks ──
  program
    .command('playbooks')
    .description('List Ralph playbooks')
    .option('--json', 'Output as JSON')
    .action(async (opts: Record<string, unknown>) => {
      try {
        const result = await api.listPlaybooks();

        if (opts.json) {
          console.log(JSON.stringify(result.data, null, 2));
        } else {
          console.log(formatPlaybookList(result.data.playbooks));
        }
      } catch (err) {
        console.error(formatError((err as Error).message));
        process.exit(1);
      }
    });
}
