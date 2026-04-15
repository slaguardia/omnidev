/**
 * Auth commands: `auth login` (interactive setup) and `auth status` (show config source).
 */

import { Command } from 'commander';
import { createInterface } from 'node:readline/promises';
import { existsSync, mkdirSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { getXdgConfigPath } from '../load-env.js';
import { getConfigSource } from '../config.js';
import { validateCredentials } from '../api-client.js';
import { formatError } from '../formatter.js';

export function registerAuthCommands(program: Command): void {
  const auth = program.command('auth').description('Manage authentication credentials');

  // ── auth login ──
  auth
    .command('login')
    .description('Interactively configure Omnidev credentials')
    .action(async () => {
      if (!process.stdin.isTTY) {
        console.error(formatError('auth login requires an interactive terminal'));
        process.exit(1);
      }

      const rl = createInterface({ input: process.stdin, output: process.stdout });

      try {
        const url =
          (await rl.question('Omnidev instance URL [http://localhost:3000]: ')).trim() ||
          'http://localhost:3000';
        const apiKey = (await rl.question('API key: ')).trim();

        if (!apiKey) {
          console.error(formatError('API key is required'));
          process.exit(1);
        }

        // Validate credentials before persisting
        console.log('\nValidating credentials...');
        try {
          await validateCredentials(url, apiKey);
        } catch (err) {
          console.error(formatError(`Authentication failed: ${(err as Error).message}`));
          process.exit(1);
        }

        // Write config atomically
        const configDir = getXdgConfigPath();
        mkdirSync(configDir, { recursive: true });

        const envPath = join(configDir, '.env');
        const tmpPath = join(configDir, '.env.tmp');
        const content = `OMNIDEV_URL=${url}\nOMNIDEV_API_KEY=${apiKey}\n`;

        writeFileSync(tmpPath, content, { mode: 0o600 });
        renameSync(tmpPath, envPath);

        console.log(`\n\x1b[32mAuthenticated successfully.\x1b[0m Config saved to ${envPath}`);
      } finally {
        rl.close();
      }
    });

  // ── auth status ──
  auth
    .command('status')
    .description('Show current authentication config and connectivity')
    .option('--json', 'Output as JSON')
    .action(async (opts: Record<string, unknown>) => {
      const source = getConfigSource();

      // Test connectivity
      let connected = false;
      let statusMessage = '';
      const url = source.url.replace(/\/+$/, '');

      if (source.maskedKey !== '***') {
        try {
          const apiKey = process.env.OMNIDEV_API_KEY ?? '';
          await validateCredentials(url, apiKey);
          connected = true;
          statusMessage = 'Connected';
        } catch (err) {
          statusMessage = `Connection failed — ${(err as Error).message}`;
        }
      } else {
        statusMessage = 'No API key configured';
      }

      if (opts.json) {
        console.log(
          JSON.stringify(
            {
              url,
              maskedKey: source.maskedKey,
              source: source.source,
              connected,
              status: statusMessage,
            },
            null,
            2
          )
        );
      } else {
        console.log(`Instance:  ${url}`);
        console.log(`API Key:   ${source.maskedKey}`);
        console.log(`Source:    ${source.source}`);
        if (connected) {
          console.log(`Status:    \x1b[32m${statusMessage}\x1b[0m`);
        } else {
          console.log(`Status:    \x1b[31m${statusMessage}\x1b[0m`);
        }
      }

      if (!connected) {
        process.exit(1);
      }
    });

  // ── auth logout ──
  auth
    .command('logout')
    .description('Remove stored credentials from XDG config')
    .action(() => {
      const envPath = join(getXdgConfigPath(), '.env');
      if (existsSync(envPath)) {
        unlinkSync(envPath);
        console.log(`Removed ${envPath}`);
      } else {
        console.log('No stored credentials found.');
      }
    });
}
