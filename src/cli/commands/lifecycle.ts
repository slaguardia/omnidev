/**
 * Lifecycle commands: transition, execute, run-stage, complete, cancel-loop.
 */

import { Command } from 'commander';
import * as api from '../api-client.js';
import { resolveTaskRef } from '../resolver.js';
import { formatSuccess, formatError } from '../formatter.js';

export function registerLifecycleCommands(program: Command): void {
  // ── transition ──
  program
    .command('transition <ref> <status>')
    .description('Transition a task to a new status')
    .option('-r, --reason <reason>', 'Reason for transition')
    .option('--json', 'Output as JSON')
    .action(async (ref: string, status: string, opts: Record<string, unknown>) => {
      try {
        const taskId = await resolveTaskRef(ref);
        const result = await api.transitionTask(taskId, status, opts.reason as string | undefined);

        if (opts.json) {
          console.log(JSON.stringify(result.data, null, 2));
        } else {
          const t = result.data.transition;
          console.log(formatSuccess(`${ref}: ${t.from as string} \u2192 ${t.to as string}`));
        }
      } catch (err) {
        console.error(formatError((err as Error).message));
        process.exit(1);
      }
    });

  // ── execute ──
  program
    .command('execute <ref>')
    .description('Execute a task (create branch, transition to executing)')
    .option('--json', 'Output as JSON')
    .action(async (ref: string, opts: Record<string, unknown>) => {
      try {
        const taskId = await resolveTaskRef(ref);
        const result = await api.executeTask(taskId);

        if (opts.json) {
          console.log(JSON.stringify(result.data, null, 2));
        } else {
          const msg = (result.data.message as string) ?? 'Task execution started.';
          console.log(formatSuccess(msg));
        }
      } catch (err) {
        console.error(formatError((err as Error).message));
        process.exit(1);
      }
    });

  // ── run-stage ──
  program
    .command('run-stage <ref> <stage>')
    .description('Run a specific workflow stage on a task')
    .option('-p, --prompt <prompt>', 'Override stage prompt')
    .option('--json', 'Output as JSON')
    .action(async (ref: string, stage: string, opts: Record<string, unknown>) => {
      try {
        const taskId = await resolveTaskRef(ref);
        const result = await api.runStage(taskId, stage, opts.prompt as string | undefined);

        if (opts.json) {
          console.log(JSON.stringify(result.data, null, 2));
        } else {
          if (result.data.jobId) {
            console.log(formatSuccess(`Stage '${stage}' started. Job: ${result.data.jobId}`));
          } else {
            console.log(formatSuccess(`Stage '${stage}' applied (no job created).`));
          }
        }
      } catch (err) {
        console.error(formatError((err as Error).message));
        process.exit(1);
      }
    });

  // ── complete ──
  program
    .command('complete <ref>')
    .description('Complete a task and optionally create a PR/MR')
    .option('--skip-pr', 'Skip PR/MR creation')
    .option('--draft', 'Create as draft PR/MR')
    .option('--title <title>', 'PR title override')
    .option('--body <body>', 'PR body override')
    .option('--json', 'Output as JSON')
    .action(async (ref: string, opts: Record<string, unknown>) => {
      try {
        const taskId = await resolveTaskRef(ref);
        const completeOpts: { skipPr?: boolean; draft?: boolean; title?: string; body?: string } = {
          skipPr: (opts.skipPr as boolean) ?? false,
          draft: (opts.draft as boolean) ?? false,
        };
        if (opts.title) completeOpts.title = opts.title as string;
        if (opts.body) completeOpts.body = opts.body as string;
        const result = await api.completeTask(taskId, completeOpts);

        if (opts.json) {
          console.log(JSON.stringify(result.data, null, 2));
        } else {
          console.log(formatSuccess(`Task ${ref} completed.`));
          if (result.data.prUrl) {
            console.log(`PR: ${result.data.prUrl}`);
          }
        }
      } catch (err) {
        console.error(formatError((err as Error).message));
        process.exit(1);
      }
    });

  // ── cancel-loop ──
  program
    .command('cancel-loop <ref>')
    .description('Cancel an active auto-loop on a task')
    .action(async (ref: string) => {
      try {
        const taskId = await resolveTaskRef(ref);
        await api.cancelLoop(taskId);
        console.log(formatSuccess(`Auto-loop cancelled for ${ref}.`));
      } catch (err) {
        console.error(formatError((err as Error).message));
        process.exit(1);
      }
    });

  // ── stage-answer ──
  program
    .command('stage-answer <ref>')
    .description('Answer or dismiss pending stage questions (human-in-the-loop)')
    .requiredOption('--stage <name>', 'Stage name (e.g. executing, triage)')
    .option(
      '--answers <json>',
      'JSON object mapping questionId to answer text, e.g. \'{"q_1":"yes"}\''
    )
    .option('--dismiss <ids>', 'Comma-separated question IDs to remove without answering')
    .option('--json', 'Output as JSON')
    .action(async (ref: string, opts: Record<string, unknown>) => {
      try {
        const taskId = await resolveTaskRef(ref);
        const stageName = opts.stage as string;

        let answers: Record<string, string> | undefined;
        if (opts.answers) {
          try {
            answers = JSON.parse(opts.answers as string) as Record<string, string>;
          } catch {
            console.error(formatError('Invalid JSON for --answers'));
            process.exit(1);
          }
        }

        const dismissRaw = opts.dismiss as string | undefined;
        const dismiss = dismissRaw
          ? dismissRaw
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined;

        if (!answers && (!dismiss || dismiss.length === 0)) {
          console.error(formatError('Provide --answers and/or --dismiss'));
          process.exit(1);
        }

        const result = await api.stageAnswer(taskId, {
          stageName,
          ...(answers && Object.keys(answers).length > 0 ? { answers } : {}),
          ...(dismiss && dismiss.length > 0 ? { dismiss } : {}),
        });

        if (opts.json) {
          console.log(JSON.stringify(result.data, null, 2));
        } else {
          console.log(
            formatSuccess(
              `Stage '${stageName}' questions updated. Iterations remaining (stage output): ${result.data.iterationsRemaining}`
            )
          );
        }
      } catch (err) {
        console.error(formatError((err as Error).message));
        process.exit(1);
      }
    });
}
