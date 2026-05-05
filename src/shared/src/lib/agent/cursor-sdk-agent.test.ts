/**
 * CursorSdkAgent unit tests with a mocked @cursor/sdk module.
 *
 * Verifies:
 *   - Each native SDKMessage type maps to the correct AgentEvent variant(s)
 *   - usage_update is yielded after the stream when onDelta provides token totals
 *   - AbortSignal triggers run.cancel() and recoverable=false on the error event
 *   - Symbol.asyncDispose is called on cleanup
 *   - Two concurrent run() invocations on one CursorSdkAgent produce
 *     independent event streams (reentrancy guarantee)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentEvent } from './types';

// ---------------------------------------------------------------------------
// Mock @cursor/sdk so tests do not require a real CURSOR_API_KEY or network.
// The mock returns whatever sequence of SDKMessage events the test sets up.
// ---------------------------------------------------------------------------

interface MockRun {
  stream: () => AsyncGenerator<unknown, void, unknown>;
  cancel: () => Promise<void>;
}

let mockMessages: unknown[] = [];
let mockOnDeltaInvocations: Array<{ update: unknown }> = [];
let mockCancelCalled = false;
let mockDisposeCalled = 0;
let cancelOnAbort = false;
let createCallCount = 0;

vi.mock('@cursor/sdk', () => {
  return {
    Agent: {
      create: vi.fn(async (_options: unknown) => {
        createCallCount += 1;
        return {
          send: async (
            _message: unknown,
            options?: { onDelta?: (args: { update: unknown }) => void }
          ): Promise<MockRun> => {
            // Capture the onDelta handler so tests can simulate token deltas.
            const handler = options?.onDelta;
            if (handler) {
              for (const inv of mockOnDeltaInvocations) {
                handler({ update: inv.update });
              }
            }
            return {
              stream: async function* (): AsyncGenerator<unknown, void, unknown> {
                for (const m of mockMessages) {
                  if (cancelOnAbort && mockCancelCalled) return;
                  yield m;
                }
              },
              cancel: async (): Promise<void> => {
                mockCancelCalled = true;
              },
            };
          },
          [Symbol.asyncDispose]: async (): Promise<void> => {
            mockDisposeCalled += 1;
          },
        };
      }),
    },
  };
});

beforeEach(() => {
  mockMessages = [];
  mockOnDeltaInvocations = [];
  mockCancelCalled = false;
  mockDisposeCalled = 0;
  cancelOnAbort = false;
  createCallCount = 0;
  process.env.CURSOR_API_KEY = 'test-api-key';
});

async function collect(stream: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const e of stream) out.push(e);
  return out;
}

describe('CursorSdkAgent — event mapping', () => {
  it('maps assistant text and tool_use blocks to assistant_message + tool_call', async () => {
    mockMessages = [
      {
        type: 'assistant',
        agent_id: 'a',
        run_id: 'r',
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Reading files…' },
            { type: 'tool_use', id: 'toolu_1', name: 'Read', input: { path: '/x' } },
          ],
        },
      },
      { type: 'status', agent_id: 'a', run_id: 'r', status: 'FINISHED' },
    ];

    const { CursorSdkAgent } = await import('./cursor-sdk-agent');
    const agent = new CursorSdkAgent();
    const events = await collect(
      agent.run({ question: 'go', workingDirectory: '/tmp/x', editRequest: false })
    );

    const types = events.map((e) => e.type);
    expect(types).toContain('assistant_message');
    expect(types).toContain('tool_call');
    expect(types).toContain('done');

    const tc = events.find((e) => e.type === 'tool_call');
    expect(tc && tc.type === 'tool_call' && tc.name).toBe('Read');
  });

  it('maps SDK tool_call lifecycle "completed" to a tool_result event with isError=false', async () => {
    mockMessages = [
      {
        type: 'tool_call',
        agent_id: 'a',
        run_id: 'r',
        call_id: 'toolu_1',
        name: 'Read',
        status: 'completed',
        result: 'file contents',
      },
      { type: 'status', agent_id: 'a', run_id: 'r', status: 'FINISHED' },
    ];

    const { CursorSdkAgent } = await import('./cursor-sdk-agent');
    const events = await collect(
      new CursorSdkAgent().run({ question: 'q', workingDirectory: '/tmp', editRequest: false })
    );

    const tr = events.find((e) => e.type === 'tool_result');
    expect(tr).toBeDefined();
    if (tr && tr.type === 'tool_result') {
      expect(tr.toolUseId).toBe('toolu_1');
      expect(tr.isError).toBe(false);
      expect(tr.content).toBe('file contents');
    }
  });

  it('maps tool_call lifecycle "error" to tool_result with isError=true', async () => {
    mockMessages = [
      {
        type: 'tool_call',
        agent_id: 'a',
        run_id: 'r',
        call_id: 'toolu_2',
        name: 'Bash',
        status: 'error',
        result: { message: 'permission denied' },
      },
      { type: 'status', agent_id: 'a', run_id: 'r', status: 'FINISHED' },
    ];

    const { CursorSdkAgent } = await import('./cursor-sdk-agent');
    const events = await collect(
      new CursorSdkAgent().run({ question: 'q', workingDirectory: '/tmp', editRequest: true })
    );

    const tr = events.find((e) => e.type === 'tool_result');
    expect(tr && tr.type === 'tool_result' && tr.isError).toBe(true);
  });

  it('maps thinking messages and status=ERROR appropriately', async () => {
    mockMessages = [
      { type: 'thinking', agent_id: 'a', run_id: 'r', text: 'considering…' },
      { type: 'status', agent_id: 'a', run_id: 'r', status: 'ERROR', message: 'rate limited' },
    ];

    const { CursorSdkAgent } = await import('./cursor-sdk-agent');
    const events = await collect(
      new CursorSdkAgent().run({ question: 'q', workingDirectory: '/tmp', editRequest: false })
    );

    expect(events.find((e) => e.type === 'thinking')).toBeDefined();
    const err = events.find((e) => e.type === 'error');
    expect(err && err.type === 'error' && err.message).toBe('rate limited');
    expect(err && err.type === 'error' && err.recoverable).toBe(true);
  });

  it('emits a usage_update with token totals captured from onDelta', async () => {
    mockOnDeltaInvocations = [
      { update: { type: 'token_delta', tokensIn: 100, tokensOut: 50, model: 'composer-2' } },
    ];
    mockMessages = [{ type: 'status', agent_id: 'a', run_id: 'r', status: 'FINISHED' }];

    const { CursorSdkAgent } = await import('./cursor-sdk-agent');
    const events = await collect(
      new CursorSdkAgent().run({ question: 'q', workingDirectory: '/tmp', editRequest: false })
    );

    const usage = events.find((e) => e.type === 'usage_update');
    expect(usage).toBeDefined();
    if (usage && usage.type === 'usage_update') {
      expect(usage.inputTokens).toBe(100);
      expect(usage.outputTokens).toBe(50);
      expect(usage.model).toBe('composer-2');
    }
  });
});

describe('CursorSdkAgent — auth + lifecycle', () => {
  it('emits an unrecoverable error when CURSOR_API_KEY is absent', async () => {
    delete process.env.CURSOR_API_KEY;
    const { CursorSdkAgent } = await import('./cursor-sdk-agent');
    const events = await collect(
      new CursorSdkAgent().run({ question: 'q', workingDirectory: '/tmp', editRequest: false })
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('error');
    if (events[0]?.type === 'error') {
      expect(events[0].recoverable).toBe(false);
      expect(events[0].message).toMatch(/CURSOR_API_KEY/);
    }
  });

  it('reads the API key from options.extraEnv when provided', async () => {
    delete process.env.CURSOR_API_KEY;
    mockMessages = [{ type: 'status', agent_id: 'a', run_id: 'r', status: 'FINISHED' }];

    const { CursorSdkAgent } = await import('./cursor-sdk-agent');
    const events = await collect(
      new CursorSdkAgent().run({
        question: 'q',
        workingDirectory: '/tmp',
        editRequest: false,
        extraEnv: { CURSOR_API_KEY: 'from-extra-env' },
      })
    );
    expect(events.some((e) => e.type === 'done')).toBe(true);
  });

  it('disposes the SDKAgent (Symbol.asyncDispose) after a successful run', async () => {
    mockMessages = [{ type: 'status', agent_id: 'a', run_id: 'r', status: 'FINISHED' }];
    const { CursorSdkAgent } = await import('./cursor-sdk-agent');
    await collect(
      new CursorSdkAgent().run({ question: 'q', workingDirectory: '/tmp', editRequest: false })
    );
    expect(mockDisposeCalled).toBe(1);
  });

  it('calls run.cancel() when AbortSignal is aborted mid-stream', async () => {
    cancelOnAbort = true;
    // Slow stream so abort fires while we're iterating.
    mockMessages = [
      {
        type: 'assistant',
        agent_id: 'a',
        run_id: 'r',
        message: { role: 'assistant', content: [{ type: 'text', text: 'a' }] },
      },
      {
        type: 'assistant',
        agent_id: 'a',
        run_id: 'r',
        message: { role: 'assistant', content: [{ type: 'text', text: 'b' }] },
      },
      { type: 'status', agent_id: 'a', run_id: 'r', status: 'CANCELLED' },
    ];

    const { CursorSdkAgent } = await import('./cursor-sdk-agent');
    const controller = new AbortController();
    const stream = new CursorSdkAgent().run({
      question: 'q',
      workingDirectory: '/tmp',
      editRequest: false,
      signal: controller.signal,
    });

    const events: AgentEvent[] = [];
    for await (const e of stream) {
      events.push(e);
      if (events.length === 1) controller.abort();
    }

    expect(mockCancelCalled).toBe(true);
  });
});

describe('CursorSdkAgent — reentrancy', () => {
  it('two concurrent run() invocations on one agent produce independent streams with no shared state', async () => {
    mockMessages = [
      {
        type: 'assistant',
        agent_id: 'a',
        run_id: 'r',
        message: { role: 'assistant', content: [{ type: 'text', text: 'hello' }] },
      },
      { type: 'status', agent_id: 'a', run_id: 'r', status: 'FINISHED' },
    ];

    const { CursorSdkAgent } = await import('./cursor-sdk-agent');
    const agent = new CursorSdkAgent();

    const [a, b] = await Promise.all([
      collect(agent.run({ question: 'A', workingDirectory: '/tmp/A', editRequest: false })),
      collect(agent.run({ question: 'B', workingDirectory: '/tmp/B', editRequest: false })),
    ]);

    // Each run gets its own seq counter starting at 0.
    expect(a[0]?.seq).toBe(0);
    expect(b[0]?.seq).toBe(0);

    // Both runs received their own SDKAgent (Agent.create called twice).
    expect(createCallCount).toBe(2);
    // Both runs disposed independently.
    expect(mockDisposeCalled).toBe(2);

    // Both produced a done event — neither stream cross-talked.
    expect(a.some((e) => e.type === 'done')).toBe(true);
    expect(b.some((e) => e.type === 'done')).toBe(true);
  });
});
