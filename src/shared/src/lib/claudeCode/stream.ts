'use server';

/**
 * Claude Code streaming execution via AsyncGenerator.
 *
 * Spawns the Claude Code CLI with session flags and yields
 * parsed JSON log events as they arrive on stdout.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { access } from 'node:fs/promises';

import type { ClaudeCodeStreamOptions, ClaudeCodeStreamEvent, ClaudeCodeJsonLog } from './types';

/**
 * Stream Claude Code CLI output as an async generator.
 *
 * Yields ClaudeCodeStreamEvent objects as they arrive.
 * Uses a queue-and-resolve pattern to bridge Node stream callbacks into async iteration.
 */
export async function* streamClaudeCode(
  options: ClaudeCodeStreamOptions
): AsyncGenerator<ClaudeCodeStreamEvent, void, undefined> {
  const { message, workingDirectory, sessionId, isResume, context } = options;

  // Verify working directory exists
  try {
    await access(workingDirectory);
  } catch {
    yield { type: 'error', message: `Working directory does not exist: ${workingDirectory}` };
    return;
  }

  // Build full message with optional context (same pattern as orchestrator.ts)
  let fullMessage = message;
  if (context) {
    fullMessage = `${context}\n\n${message}`;
  }

  // Build command
  const wrapperPath = process.env.CLAUDE_CODE_WRAPPER || '/usr/local/bin/claude-code-wrapper';

  // Build argument array to avoid shell injection — never use shell: true with user input
  const useBash = wrapperPath.endsWith('.sh') || wrapperPath.includes('claude-code-wrapper');
  const spawnCommand = useBash ? 'bash' : wrapperPath;
  const spawnArgs = [
    ...(useBash ? [wrapperPath] : []),
    workingDirectory,
    '--verbose',
    isResume ? '--resume' : '--session-id',
    sessionId,
    '-p',
    fullMessage,
    '--output-format',
    'stream-json',
  ];

  const commandPreview = `${spawnCommand} ${spawnArgs.join(' ')}`;
  console.log(`[CLAUDE STREAM] Spawning: ${commandPreview.substring(0, 200)}...`);

  // Queue-and-resolve pattern for bridging callbacks → async iteration
  type QueueItem = ClaudeCodeStreamEvent | null; // null = done
  const queue: QueueItem[] = [];
  let resolve: (() => void) | null = null;

  function enqueue(item: QueueItem) {
    queue.push(item);
    if (resolve) {
      resolve();
      resolve = null;
    }
  }

  function waitForItem(): Promise<void> {
    if (queue.length > 0) return Promise.resolve();
    return new Promise<void>((r) => {
      resolve = r;
    });
  }

  // Spawn process
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    TERM: 'dumb',
    NO_COLOR: '1',
  };
  delete childEnv.ANTHROPIC_API_KEY;

  let proc: ChildProcess;
  try {
    proc = spawn(spawnCommand, spawnArgs, {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: childEnv,
    });
  } catch (err) {
    yield { type: 'error', message: `Failed to spawn Claude Code: ${err}` };
    return;
  }

  console.log(`[CLAUDE STREAM] Process spawned, PID: ${proc.pid}`);

  // Activity-based timeout
  const maxInactivityTime = 300000; // 5 minutes
  const activityCheckInterval = 30000;
  let lastActivityTime = Date.now();

  function resetActivity() {
    lastActivityTime = Date.now();
  }

  // Line buffer for newline-delimited JSON parsing
  let lineBuffer = '';

  proc.stdout?.on('data', (data) => {
    const chunk = data.toString();
    resetActivity();

    lineBuffer += chunk;
    const lines = lineBuffer.split('\n');
    lineBuffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith('[CLAUDE-WRAPPER]')) continue;

      if (trimmed.startsWith('{')) {
        try {
          const parsed = JSON.parse(trimmed) as ClaudeCodeJsonLog;
          const logType = parsed.type || 'unknown';

          if (logType === 'result') {
            const content = typeof parsed.result === 'string' ? parsed.result : '';
            const durationMs = typeof parsed.duration_ms === 'number' ? parsed.duration_ms : null;
            enqueue({ type: 'result', content, durationMs });
          } else if (logType === 'assistant') {
            // Extract text content from assistant messages
            const msg = parsed.message as Record<string, unknown> | undefined;
            if (msg && Array.isArray(msg.content)) {
              for (const block of msg.content) {
                const b = block as Record<string, unknown>;
                if (b.type === 'text' && typeof b.text === 'string') {
                  enqueue({ type: 'text', content: b.text });
                }
              }
            }
            enqueue({ type: 'log', logType, data: parsed });
          } else {
            enqueue({ type: 'log', logType, data: parsed });
          }
        } catch {
          // Skip unparseable JSON
        }
      }
    }
  });

  proc.stderr?.on('data', (data) => {
    resetActivity();
    const chunk = data.toString();
    console.log(`[CLAUDE STREAM] stderr: ${chunk.substring(0, 200)}`);
  });

  let processExitCode: number | null = null;

  proc.on('close', (code) => {
    processExitCode = code;
    // Flush remaining buffer
    if (lineBuffer.trim()) {
      const trimmed = lineBuffer.trim();
      if (trimmed.startsWith('{')) {
        try {
          const parsed = JSON.parse(trimmed) as ClaudeCodeJsonLog;
          if (parsed.type === 'result') {
            const content = typeof parsed.result === 'string' ? parsed.result : '';
            const durationMs = typeof parsed.duration_ms === 'number' ? parsed.duration_ms : null;
            enqueue({ type: 'result', content, durationMs });
          }
        } catch {
          // skip
        }
      }
    }
    console.log(`[CLAUDE STREAM] Process closed with code ${code}`);
    enqueue(null); // signal done
  });

  proc.on('error', (err) => {
    enqueue({ type: 'error', message: `Process error: ${err.message}` });
    enqueue(null);
  });

  // Activity timeout monitor
  const activityHandle = setInterval(() => {
    const inactiveTime = Date.now() - lastActivityTime;
    if (inactiveTime > maxInactivityTime) {
      clearInterval(activityHandle);
      console.log(`[CLAUDE STREAM] Inactivity timeout (${inactiveTime / 1000}s)`);
      proc.kill('SIGKILL');
      enqueue({
        type: 'error',
        message: `Inactivity timeout (${Math.round(inactiveTime / 1000)}s)`,
      });
      enqueue(null);
    }
  }, activityCheckInterval);

  proc.on('close', () => clearInterval(activityHandle));

  // Yield events from queue
  try {
    while (true) {
      await waitForItem();
      while (queue.length > 0) {
        const item = queue.shift()!;
        if (item === null) return; // done
        yield item;
      }
    }
  } finally {
    // Cleanup: kill process if still running
    clearInterval(activityHandle);
    if (processExitCode === null) {
      console.log(`[CLAUDE STREAM] Generator closed early, killing process`);
      proc.kill('SIGTERM');
      setTimeout(() => proc.kill('SIGKILL'), 5000);
    }
  }
}
