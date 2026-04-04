/**
 * Dependency management commands: show, add, remove, graph.
 */

import { Command } from 'commander';
import * as api from '../api-client.js';
import { resolveTaskRef } from '../resolver.js';
import { formatSuccess, formatError } from '../formatter.js';

export function registerDepsCommands(program: Command): void {
  const deps = program.command('deps').description('Manage task dependencies');

  // ── show ──
  deps
    .command('show <ref>')
    .description('Show dependencies for a task')
    .option('--json', 'Output as JSON')
    .action(async (ref: string, opts: Record<string, unknown>) => {
      try {
        const taskId = await resolveTaskRef(ref);
        const result = await api.getDependencies(taskId);

        if (opts.json) {
          console.log(JSON.stringify(result.data, null, 2));
        } else {
          const data = result.data;
          const blockerDetails = data.blockerDetails as Array<Record<string, string>> | undefined;
          const blocksDetails = data.blocksDetails as Array<Record<string, string>> | undefined;

          console.log(`Dependencies for ${ref}:\n`);

          if (blockerDetails && blockerDetails.length > 0) {
            console.log('  Blocked by:');
            for (const b of blockerDetails) {
              console.log(`    - [${b.status}] ${b.title} (${b.id})`);
            }
          } else {
            console.log('  Blocked by: none');
          }

          if (blocksDetails && blocksDetails.length > 0) {
            console.log('\n  Blocks:');
            for (const b of blocksDetails) {
              console.log(`    - [${b.status}] ${b.title} (${b.id})`);
            }
          }
        }
      } catch (err) {
        console.error(formatError((err as Error).message));
        process.exit(1);
      }
    });

  // ── add ──
  deps
    .command('add <ref> <blockerRef>')
    .description('Add a blocker to a task')
    .action(async (ref: string, blockerRef: string) => {
      try {
        const taskId = await resolveTaskRef(ref);
        const blockerId = await resolveTaskRef(blockerRef);

        // Get current dependencies
        const current = await api.getDependencies(taskId);
        const blockedBy = (current.data.blockedBy as string[]) ?? [];

        if (blockedBy.includes(blockerId)) {
          console.log(`Task ${ref} is already blocked by ${blockerRef}.`);
          return;
        }

        await api.setDependencies(taskId, [...blockedBy, blockerId]);
        console.log(formatSuccess(`Added ${blockerRef} as blocker for ${ref}.`));
      } catch (err) {
        console.error(formatError((err as Error).message));
        process.exit(1);
      }
    });

  // ── remove ──
  deps
    .command('remove <ref> <blockerRef>')
    .description('Remove a blocker from a task')
    .action(async (ref: string, blockerRef: string) => {
      try {
        const taskId = await resolveTaskRef(ref);
        const blockerId = await resolveTaskRef(blockerRef);

        // Get current dependencies
        const current = await api.getDependencies(taskId);
        const blockedBy = (current.data.blockedBy as string[]) ?? [];

        const filtered = blockedBy.filter((id) => id !== blockerId);
        if (filtered.length === blockedBy.length) {
          console.log(`Task ${ref} is not blocked by ${blockerRef}.`);
          return;
        }

        await api.setDependencies(taskId, filtered);
        console.log(formatSuccess(`Removed ${blockerRef} as blocker for ${ref}.`));
      } catch (err) {
        console.error(formatError((err as Error).message));
        process.exit(1);
      }
    });

  // ── graph ──
  deps
    .command('graph <ref>')
    .description('Show dependency graph for a task')
    .option('--json', 'Output as JSON')
    .action(async (ref: string, opts: Record<string, unknown>) => {
      try {
        const taskId = await resolveTaskRef(ref);
        const result = await api.getDependencyGraph(taskId);

        if (opts.json) {
          console.log(JSON.stringify(result.data, null, 2));
        } else {
          console.log(`Dependency graph for ${ref}:\n`);
          console.log(JSON.stringify(result.data, null, 2));
        }
      } catch (err) {
        console.error(formatError((err as Error).message));
        process.exit(1);
      }
    });
}
