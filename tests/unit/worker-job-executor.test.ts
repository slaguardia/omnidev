/**
 * V2 worker retry tests focused on the streaming-event refactor in sub-task 5:
 *
 *   - Success path persists events under one runId with seq 0..N
 *   - Recoverable error events trigger a retry; both attempts persist under
 *     the same runId with a continuous seq (no collisions)
 *   - usage_update events are aggregated into one dbUpdateAgentRunSummary
 *
 * The DB layer and full executeV2Job orchestration are mocked / bypassed —
 * these tests exercise the runAgentWithRetry contract via a synthetic
 * AgentRunner. Real V2 jobs are exercised by the existing integration smoke
 * test path (manual; not in this file).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentEvent } from '@/lib/agent';

const appended: Array<{ run_id: string; seq: number; type: string }> = [];
const summaryUpdates: Array<{ runId: string; updates: Record<string, unknown> }> = [];

vi.mock('@/lib/managers/ralph-task-db', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/lib/managers/ralph-task-db');
  return {
    ...actual,
    dbAppendAgentEvent: vi.fn(async (event: { run_id: string; seq: number; type: string }) => {
      appended.push({ run_id: event.run_id, seq: event.seq, type: event.type });
    }),
    dbUpdateAgentRunSummary: vi.fn(async (runId: string, updates: Record<string, unknown>) => {
      summaryUpdates.push({ runId, updates });
      return true;
    }),
    dbGetTask: vi.fn(),
  };
});

beforeEach(() => {
  appended.length = 0;
  summaryUpdates.length = 0;
});

interface AgentScript {
  /** Sequence of events to yield on the Nth call (0-indexed). */
  attempts: AgentEvent[][];
}

function makeScriptedAgent(script: AgentScript): {
  run: (opts: unknown) => AsyncIterable<AgentEvent>;
} {
  let calls = 0;
  return {
    async *run(): AsyncIterable<AgentEvent> {
      const events = script.attempts[calls] ?? [];
      calls += 1;
      for (const e of events) yield e;
    },
  };
}

async function importHelpers(): Promise<{
  runAgentWithRetry: (
    agent: { run: (opts: unknown) => AsyncIterable<AgentEvent> },
    question: string,
    workingDirectory: string,
    editRequest: boolean,
    logTag: string,
    runId?: string
  ) => Promise<{ output: string; retried: boolean }>;
}> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = (await import('../../src/worker/src/job-executor')) as any;
  return { runAgentWithRetry: mod.runAgentWithRetry };
}

describe('runAgentWithRetry (V2 worker streaming retry)', () => {
  it('success path: persists events 0..N under one runId, no retry, output assembled', async () => {
    const events: AgentEvent[] = [
      { type: 'assistant_message', text: 'Hello, ', seq: 0, timestamp: 't0' },
      {
        type: 'tool_call',
        toolUseId: 'toolu_1',
        name: 'Read',
        input: {},
        seq: 1,
        timestamp: 't1',
      },
      { type: 'assistant_message', text: 'world.', seq: 2, timestamp: 't2' },
      {
        type: 'usage_update',
        inputTokens: 10,
        outputTokens: 5,
        model: 'composer-2',
        seq: 3,
        timestamp: 't3',
      },
      { type: 'done', stopReason: 'end_turn', seq: 4, timestamp: 't4' },
    ];
    const agent = makeScriptedAgent({ attempts: [events] });

    const { runAgentWithRetry } = await importHelpers();
    const result = await runAgentWithRetry(agent, 'q', '/tmp', false, '[T]', 'run-1');

    expect(result.retried).toBe(false);
    expect(result.output).toBe('Hello, world.');
    expect(appended.map((e) => e.seq)).toEqual([0, 1, 2, 3, 4]);
    expect(appended.every((e) => e.run_id === 'run-1')).toBe(true);

    expect(summaryUpdates).toHaveLength(1);
    expect(summaryUpdates[0]?.updates).toMatchObject({
      model: 'composer-2',
      input_tokens: 10,
      output_tokens: 5,
      total_tokens: 15,
    });
  });

  it('retry path: error event on attempt 1 triggers retry; both attempts persist under one runId with a continuous seq', async () => {
    const failedAttempt: AgentEvent[] = [
      { type: 'assistant_message', text: 'partial ', seq: 0, timestamp: 't0' },
      { type: 'error', message: 'transient', recoverable: true, seq: 1, timestamp: 't1' },
    ];
    const successfulRetry: AgentEvent[] = [
      { type: 'assistant_message', text: 'success', seq: 0, timestamp: 't0' },
      { type: 'done', stopReason: 'end_turn', seq: 1, timestamp: 't1' },
    ];
    const agent = makeScriptedAgent({ attempts: [failedAttempt, successfulRetry] });

    const { runAgentWithRetry } = await importHelpers();
    const result = await runAgentWithRetry(agent, 'q', '/tmp', false, '[T]', 'run-1');

    expect(result.retried).toBe(true);
    expect(result.output).toBe('success');

    // 2 events from attempt 1 + 2 events from attempt 2 = 4 rows under run-1.
    // The worker re-numbers seq across attempts so they stay unique.
    expect(appended.map((e) => e.seq)).toEqual([0, 1, 2, 3]);
    expect(new Set(appended.map((e) => e.run_id))).toEqual(new Set(['run-1']));
  });

  it('failure path: error on attempt 2 throws after still persisting both attempts', async () => {
    const fail1: AgentEvent[] = [
      { type: 'error', message: 'first failure', recoverable: true, seq: 0, timestamp: 't0' },
    ];
    const fail2: AgentEvent[] = [
      { type: 'error', message: 'second failure', recoverable: false, seq: 0, timestamp: 't0' },
    ];
    const agent = makeScriptedAgent({ attempts: [fail1, fail2] });

    const { runAgentWithRetry } = await importHelpers();
    await expect(runAgentWithRetry(agent, 'q', '/tmp', false, '[T]', 'run-1')).rejects.toThrow(
      'second failure'
    );

    expect(appended.map((e) => e.seq)).toEqual([0, 1]);
    expect(appended.every((e) => e.run_id === 'run-1')).toBe(true);
  });

  it('runId omitted: skips persistence and summary updates entirely', async () => {
    const agent = makeScriptedAgent({
      attempts: [
        [
          { type: 'assistant_message', text: 'x', seq: 0, timestamp: 't0' },
          { type: 'done', stopReason: 'end_turn', seq: 1, timestamp: 't1' },
        ],
      ],
    });

    const { runAgentWithRetry } = await importHelpers();
    const result = await runAgentWithRetry(agent, 'q', '/tmp', false, '[T]');
    expect(result.retried).toBe(false);
    expect(result.output).toBe('x');
    expect(appended).toHaveLength(0);
    expect(summaryUpdates).toHaveLength(0);
  });
});
