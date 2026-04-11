/**
 * Job queue commands — poll legacy /api/jobs status (used after run-stage and ask/edit).
 */

import { Command } from 'commander';
import * as api from '../api-client.js';
import { formatError } from '../formatter.js';

export function registerJobCommands(program: Command): void {
  program
    .command('job <jobId>')
    .description('Get status of a queued job (poll /api/jobs/:jobId)')
    .option('--json', 'Output as JSON')
    .action(async (jobId: string, opts: Record<string, unknown>) => {
      try {
        const result = await api.getJob(jobId);

        if (opts.json) {
          console.log(JSON.stringify(result.data, null, 2));
        } else {
          const d = result.data;
          console.log(`Job ${d.id as string}`);
          console.log(`  type:    ${d.type as string}`);
          console.log(`  status:  ${d.status as string}`);
          console.log(`  created: ${d.createdAt as string}`);
          if (d.startedAt) console.log(`  started: ${d.startedAt as string}`);
          if (d.completedAt) console.log(`  done:    ${d.completedAt as string}`);
          if (d.status === 'failed' && d.error) console.log(`  error:   ${d.error as string}`);
          if (d.status === 'completed' && d.result !== undefined) {
            console.log(`  result:  ${JSON.stringify(d.result)}`);
          }
        }
      } catch (err) {
        console.error(formatError((err as Error).message));
        process.exit(1);
      }
    });
}
