/**
 * Unit tests for the streaming AgentRunner contract:
 *   - AgentEvent discriminated union narrows correctly
 *   - collapseEventsToOutput drains a stream into the legacy { output } shape
 */

import { describe, it, expect } from 'vitest';
import { collapseEventsToOutput } from '@/lib/agent/collapse';
import type { AgentEvent } from '@/lib/agent/types';

describe('AgentEvent discriminated union', () => {
  it('narrows on the type discriminator', () => {
    const events: AgentEvent[] = [
      { type: 'assistant_message', text: 'hello', seq: 0, timestamp: '2026-05-04T00:00:00Z' },
      {
        type: 'tool_call',
        toolUseId: 'toolu_1',
        name: 'Read',
        input: { path: '/x' },
        seq: 1,
        timestamp: '2026-05-04T00:00:01Z',
      },
      {
        type: 'tool_result',
        toolUseId: 'toolu_1',
        content: 'file contents',
        isError: false,
        seq: 2,
        timestamp: '2026-05-04T00:00:02Z',
      },
      {
        type: 'usage_update',
        inputTokens: 100,
        outputTokens: 50,
        model: 'claude-sonnet-4-6',
        seq: 3,
        timestamp: '2026-05-04T00:00:03Z',
      },
      { type: 'done', stopReason: 'end_turn', seq: 4, timestamp: '2026-05-04T00:00:04Z' },
    ];

    let assistantTextSeen = '';
    let toolCallNameSeen = '';
    let toolResultErrSeen: boolean | null = null;
    let usageModelSeen = '';
    let stopReasonSeen: string | undefined;

    for (const e of events) {
      // The TypeScript narrowing must allow access to per-variant fields
      // without casts; if narrowing breaks, this file won't typecheck.
      switch (e.type) {
        case 'assistant_message':
          assistantTextSeen = e.text;
          break;
        case 'tool_call':
          toolCallNameSeen = e.name;
          break;
        case 'tool_result':
          toolResultErrSeen = e.isError;
          break;
        case 'usage_update':
          usageModelSeen = e.model;
          break;
        case 'done':
          stopReasonSeen = e.stopReason;
          break;
        case 'thinking':
        case 'error':
          // exhaustive — must be present for type checker to be happy
          break;
      }
    }

    expect(assistantTextSeen).toBe('hello');
    expect(toolCallNameSeen).toBe('Read');
    expect(toolResultErrSeen).toBe(false);
    expect(usageModelSeen).toBe('claude-sonnet-4-6');
    expect(stopReasonSeen).toBe('end_turn');
  });
});

describe('collapseEventsToOutput', () => {
  async function* fromArray(events: AgentEvent[]): AsyncIterable<AgentEvent> {
    for (const e of events) yield e;
  }

  it('concatenates assistant_message text and ignores other event types', async () => {
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
      {
        type: 'tool_result',
        toolUseId: 'toolu_1',
        content: 'ignored',
        isError: false,
        seq: 2,
        timestamp: 't2',
      },
      { type: 'thinking', text: 'ignored thinking', seq: 3, timestamp: 't3' },
      { type: 'assistant_message', text: 'world.', seq: 4, timestamp: 't4' },
      { type: 'done', stopReason: 'end_turn', seq: 5, timestamp: 't5' },
    ];

    const result = await collapseEventsToOutput(fromArray(events));
    expect(result.output).toBe('Hello, world.');
  });

  it('throws when an error event is encountered', async () => {
    const events: AgentEvent[] = [
      { type: 'assistant_message', text: 'partial ', seq: 0, timestamp: 't0' },
      { type: 'error', message: 'boom', recoverable: false, seq: 1, timestamp: 't1' },
    ];

    await expect(collapseEventsToOutput(fromArray(events))).rejects.toThrow('boom');
  });

  it('returns empty output when stream emits no assistant messages', async () => {
    const events: AgentEvent[] = [
      { type: 'done', stopReason: 'end_turn', seq: 0, timestamp: 't0' },
    ];
    const result = await collapseEventsToOutput(fromArray(events));
    expect(result.output).toBe('');
  });
});

describe('AgentEvent reentrancy', () => {
  it('two concurrent streams from the same source iterate independently', async () => {
    // Synthetic test: two separate generators (representing two concurrent
    // run() invocations) each maintain their own seq counter with no
    // cross-talk. This is the contract the AgentRunner interface promises.
    async function* makeStream(prefix: string): AsyncIterable<AgentEvent> {
      let seq = 0;
      yield { type: 'assistant_message', text: `${prefix}-a`, seq: seq++, timestamp: 't0' };
      yield { type: 'assistant_message', text: `${prefix}-b`, seq: seq++, timestamp: 't1' };
      yield { type: 'done', stopReason: 'end_turn', seq: seq++, timestamp: 't2' };
    }

    const [a, b] = await Promise.all([
      collapseEventsToOutput(makeStream('A')),
      collapseEventsToOutput(makeStream('B')),
    ]);

    expect(a.output).toBe('A-aA-b');
    expect(b.output).toBe('B-aB-b');
  });
});
