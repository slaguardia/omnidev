/**
 * Task CRUD commands: list, show, create, update, delete, archive, unarchive, clone.
 */

import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import * as api from '../api-client.js';
import { resolveTaskRef } from '../resolver.js';
import { formatTaskList, formatTaskDetail, formatSuccess, formatError } from '../formatter.js';

/**
 * Read a string option that may be "-" (read from stdin) or a value.
 * Works around tsx truncating multiline process.argv entries.
 * Usage: `ralph tasks update RLP-1 -d -` then pipe/type multiline text.
 */
function resolveTextOption(value: unknown): string | undefined {
  if (value === '-') {
    try {
      return readFileSync(0, 'utf8').trimEnd();
    } catch {
      return undefined;
    }
  }
  return value as string | undefined;
}

export function registerTaskCommands(program: Command): void {
  const tasks = program.command('tasks').description('Manage Ralph tasks');

  // ── list ──
  tasks
    .command('list')
    .description('List tasks')
    .option('-s, --status <status>', 'Filter by status')
    .option('-w, --workspace <id>', 'Filter by workspace ID')
    .option('--archived', 'Show only archived tasks')
    .option('--include-archived', 'Include archived tasks')
    .option('--json', 'Output as JSON')
    .action(async (opts: Record<string, unknown>) => {
      try {
        const params: Record<string, string> = {};
        if (opts.status) params.status = opts.status as string;
        if (opts.workspace) params.workspaceId = opts.workspace as string;
        if (opts.archived) params.archivedOnly = 'true';
        if (opts.includeArchived) params.includeArchived = 'true';

        const result = await api.listTasks(params);

        if (opts.json) {
          console.log(JSON.stringify(result.data, null, 2));
        } else {
          console.log(formatTaskList(result.data.tasks));
        }
      } catch (err) {
        console.error(formatError((err as Error).message));
        process.exit(1);
      }
    });

  // ── show ──
  tasks
    .command('show <ref>')
    .description('Show task details (by ID or RLP-N)')
    .option('--json', 'Output as JSON')
    .action(async (ref: string, opts: Record<string, unknown>) => {
      try {
        const taskId = await resolveTaskRef(ref);
        const result = await api.getTask(taskId);

        if (opts.json) {
          console.log(JSON.stringify(result.data, null, 2));
        } else {
          console.log(formatTaskDetail(result.data.task));
        }
      } catch (err) {
        console.error(formatError((err as Error).message));
        process.exit(1);
      }
    });

  // ── create ──
  tasks
    .command('create')
    .description('Create a new task')
    .requiredOption('-w, --workspace <id>', 'Workspace ID')
    .requiredOption('-t, --title <title>', 'Task title')
    .requiredOption('-d, --description <desc>', 'Task description')
    .option('--project <id>', 'Project ID')
    .option('--playbook <id>', 'Playbook ID')
    .option('--parent <id>', 'Parent task ID (creates a subtask)')
    .option('--base-branch <branch>', 'Base branch override')
    .option(
      '--delivery <method>',
      'Delivery method: merge-request or direct-commit',
      'merge-request'
    )
    .option('--auto-run', 'Auto-start the first playbook stage', false)
    .option('--json', 'Output as JSON')
    .action(async (opts: Record<string, unknown>) => {
      try {
        const description = resolveTextOption(opts.description);
        if (!description) {
          console.error(formatError('Description is required. Use -d <text> or -d - for stdin.'));
          process.exit(1);
        }
        const body: Record<string, unknown> = {
          workspaceId: opts.workspace,
          title: opts.title,
          description,
          deliveryMethod: opts.delivery,
          autoRun: opts.autoRun ?? false,
        };
        if (opts.project) body.projectId = opts.project;
        if (opts.playbook) body.playbookId = opts.playbook;
        if (opts.parent) body.parentId = opts.parent;
        if (opts.baseBranch) body.baseBranch = opts.baseBranch;

        const result = await api.createTask(body);

        if (opts.json) {
          console.log(JSON.stringify(result.data, null, 2));
        } else {
          const task = result.data.task;
          const num = task.taskNumber as number | null;
          const label = num != null ? `RLP-${num}` : (task.id as string);
          console.log(formatSuccess(`Task ${label} created successfully.`));
          if (result.data.autoRunJobId) {
            console.log(`Auto-run job started: ${result.data.autoRunJobId}`);
          }
        }
      } catch (err) {
        console.error(formatError((err as Error).message));
        process.exit(1);
      }
    });

  // ── update ──
  tasks
    .command('update <ref>')
    .description('Update a task (by ID or RLP-N)')
    .option('-t, --title <title>', 'New title')
    .option('-d, --description <desc>', 'New description')
    .option('--project <id>', 'Project ID')
    .option('--playbook <id>', 'Playbook ID')
    .option('--base-branch <branch>', 'Base branch')
    .option('--feature-branch <branch>', 'Feature branch')
    .option('--delivery <method>', 'Delivery method')
    .option('--json', 'Output as JSON')
    .action(async (ref: string, opts: Record<string, unknown>) => {
      try {
        const taskId = await resolveTaskRef(ref);
        const body: Record<string, unknown> = {};
        if (opts.title) body.title = opts.title;
        if (opts.description) {
          const desc = resolveTextOption(opts.description);
          if (desc) body.description = desc;
        }
        if (opts.project) body.projectId = opts.project;
        if (opts.playbook) body.playbookId = opts.playbook;
        if (opts.baseBranch) body.baseBranch = opts.baseBranch;
        if (opts.featureBranch) body.featureBranch = opts.featureBranch;
        if (opts.delivery) body.deliveryMethod = opts.delivery;

        if (Object.keys(body).length === 0) {
          console.error(formatError('No fields to update. Use --title, --description, etc.'));
          process.exit(1);
        }

        const result = await api.updateTask(taskId, body);

        if (opts.json) {
          console.log(JSON.stringify(result.data, null, 2));
        } else {
          console.log(formatSuccess('Task updated.'));
        }
      } catch (err) {
        console.error(formatError((err as Error).message));
        process.exit(1);
      }
    });

  // ── delete ──
  tasks
    .command('delete <ref>')
    .description('Delete a task (by ID or RLP-N)')
    .option('--yes', 'Skip confirmation')
    .action(async (ref: string, opts: Record<string, unknown>) => {
      try {
        const taskId = await resolveTaskRef(ref);

        if (!opts.yes) {
          console.error(formatError(`Use --yes to confirm deletion of task ${taskId}`));
          process.exit(1);
        }

        await api.deleteTask(taskId);
        console.log(formatSuccess(`Task ${ref} deleted.`));
      } catch (err) {
        console.error(formatError((err as Error).message));
        process.exit(1);
      }
    });

  // ── archive ──
  tasks
    .command('archive <ref>')
    .description('Archive a completed task')
    .action(async (ref: string) => {
      try {
        const taskId = await resolveTaskRef(ref);
        await api.archiveTask(taskId);
        console.log(formatSuccess(`Task ${ref} archived.`));
      } catch (err) {
        console.error(formatError((err as Error).message));
        process.exit(1);
      }
    });

  // ── unarchive ──
  tasks
    .command('unarchive <ref>')
    .description('Unarchive a task')
    .action(async (ref: string) => {
      try {
        const taskId = await resolveTaskRef(ref);
        await api.unarchiveTask(taskId);
        console.log(formatSuccess(`Task ${ref} unarchived.`));
      } catch (err) {
        console.error(formatError((err as Error).message));
        process.exit(1);
      }
    });
}
