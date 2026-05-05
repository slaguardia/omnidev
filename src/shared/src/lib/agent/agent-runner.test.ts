/**
 * executeAgentRun tests focused on the streaming-event refactor in sub-task 4:
 *
 *   - assistant_message events concatenate into the final output
 *   - usage_update events trigger a single dbUpdateAgentRunSummary
 *   - agent_events are appended in seq order via dbAppendAgentEvent
 *   - error events surface as { success: false }
 *   - executeAgentRun is reentrant: two concurrent invocations don't cross-talk
 *
 * The DB layer is mocked so the test focuses on the iteration/persistence
 * surface without needing a real SQLite or PG instance. Git/artifact paths
 * are skipped via editMode=false and no artifact.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentEvent, AgentRunRequest, AgentRunner } from './types';

const appended: Array<{ run_id: string; seq: number; type: string }> = [];
const summaryUpdates: Array<{ runId: string; updates: Record<string, unknown> }> = [];

vi.mock('@/lib/managers/ralph-task-db', () => ({
  dbAppendAgentEvent: vi.fn(async (event: { run_id: string; seq: number; type: string }) => {
    appended.push({ run_id: event.run_id, seq: event.seq, type: event.type });
  }),
  dbUpdateAgentRunSummary: vi.fn(async (runId: string, updates: Record<string, unknown>) => {
    summaryUpdates.push({ runId, updates });
    return true;
  }),
}));

// Stub out the claudeCode + workflow + git modules — we don't exercise them
// from these tests (editMode=false and no artifact disable those branches).
vi.mock('@/lib/claudeCode', () => ({
  handlePostClaudeCodeExecution: vi.fn(),
  initializeGitWorkflow: vi.fn(),
}));
vi.mock('@/lib/workflow/prompt-template', () => ({
  parseQuestionsFromOutput: vi.fn().mockReturnValue([]),
}));

beforeEach(() => {
  appended.length = 0;
  summaryUpdates.length = 0;
});

function makeRunner(events: AgentEvent[]): AgentRunner {
  return {
    async *run(): AsyncIterable<AgentEvent> {
      for (const e of events) yield e;
    },
  };
}

function makeRequest(overrides: Partial<AgentRunRequest> = {}): AgentRunRequest {
  return {
    taskId: 't',
    stageName: 's',
    iteration: 1,
    prompt: 'p',
    workspacePath: '/tmp' as AgentRunRequest['workspacePath'],
    workspaceId: 'ws' as AgentRunRequest['workspaceId'],
    editMode: false,
    parseQuestions: false,
    runId: 'run-1',
    ...overrides,
  };
}

describe('executeAgentRun streaming consumption', () => {
  it('concatenates assistant_message text and persists every event in seq order', async () => {
    const { executeAgentRun } = await import('./agent-runner');
    const events: AgentEvent[] = [
      { type: 'assistant_message', text: 'Hello, ', seq: 0, timestamp: 't0' },
      {
        type: 'tool_call',
        toolUseId: 'toolu_1',
        name: 'Read',
        input: { path: '/x' },
        seq: 1,
        timestamp: 't1',
      },
      {
        type: 'tool_result',
        toolUseId: 'toolu_1',
        content: 'contents',
        isError: false,
        seq: 2,
        timestamp: 't2',
      },
      { type: 'assistant_message', text: 'world.', seq: 3, timestamp: 't3' },
      { type: 'done', stopReason: 'end_turn', seq: 4, timestamp: 't4' },
    ];

    const result = await executeAgentRun(makeRequest(), makeRunner(events));
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.output).toBe('Hello, world.');
    expect(appended.map((e) => e.seq)).toEqual([0, 1, 2, 3, 4]);
    expect(appended.every((e) => e.run_id === 'run-1')).toBe(true);
  });

  it('updates the run summary on usage_update events', async () => {
    const { executeAgentRun } = await import('./agent-runner');
    const events: AgentEvent[] = [
      { type: 'assistant_message', text: 'ok', seq: 0, timestamp: 't0' },
      {
        type: 'usage_update',
        inputTokens: 100,
        outputTokens: 50,
        model: 'composer-2',
        seq: 1,
        timestamp: 't1',
      },
      { type: 'done', stopReason: 'end_turn', seq: 2, timestamp: 't2' },
    ];

    await executeAgentRun(makeRequest(), makeRunner(events));
    expect(summaryUpdates).toHaveLength(1);
    expect(summaryUpdates[0]?.runId).toBe('run-1');
    expect(summaryUpdates[0]?.updates).toMatchObject({
      model: 'composer-2',
      input_tokens: 100,
      output_tokens: 50,
      total_tokens: 150,
    });
  });

  it('returns failure on error events without throwing', async () => {
    const { executeAgentRun } = await import('./agent-runner');
    const events: AgentEvent[] = [
      { type: 'assistant_message', text: 'partial ', seq: 0, timestamp: 't0' },
      { type: 'error', message: 'auth failed', recoverable: false, seq: 1, timestamp: 't1' },
    ];

    const result = await executeAgentRun(makeRequest(), makeRunner(events));
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.message).toBe('auth failed');
    // Events still persisted up to and including the error event
    expect(appended.map((e) => e.type)).toEqual(['assistant_message', 'error']);
  });

  it('skips persistence when runId is omitted', async () => {
    const { executeAgentRun } = await import('./agent-runner');
    const events: AgentEvent[] = [
      { type: 'assistant_message', text: 'x', seq: 0, timestamp: 't0' },
      { type: 'done', stopReason: 'end_turn', seq: 1, timestamp: 't1' },
    ];

    const req = makeRequest();
    delete (req as { runId?: string }).runId;
    const result = await executeAgentRun(req, makeRunner(events));
    expect(result.success).toBe(true);
    expect(appended).toHaveLength(0);
    expect(summaryUpdates).toHaveLength(0);
  });

  it('is reentrant: two concurrent invocations persist to their own run_ids without seq cross-talk', async () => {
    const { executeAgentRun } = await import('./agent-runner');
    const events = (prefix: string): AgentEvent[] => [
      { type: 'assistant_message', text: `${prefix}-a`, seq: 0, timestamp: 't0' },
      { type: 'assistant_message', text: `${prefix}-b`, seq: 1, timestamp: 't1' },
      { type: 'done', stopReason: 'end_turn', seq: 2, timestamp: 't2' },
    ];

    const [a, b] = await Promise.all([
      executeAgentRun(makeRequest({ runId: 'run-A' }), makeRunner(events('A'))),
      executeAgentRun(makeRequest({ runId: 'run-B' }), makeRunner(events('B'))),
    ]);

    expect(a.success && a.data.output).toBe('A-aA-b');
    expect(b.success && b.data.output).toBe('B-aB-b');

    const aRows = appended.filter((e) => e.run_id === 'run-A').map((e) => e.seq);
    const bRows = appended.filter((e) => e.run_id === 'run-B').map((e) => e.seq);
    expect(aRows).toEqual([0, 1, 2]);
    expect(bRows).toEqual([0, 1, 2]);
    // No event got mis-attributed to the wrong run.
    expect(appended.length).toBe(6);
  });
});
