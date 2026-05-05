'use server';

/**
 * Adapter between the streaming AgentRunner interface and the legacy
 * { output: string } shape consumed by callers that have not migrated yet.
 *
 * collapseEventsToOutput drains an event stream and returns the concatenated
 * assistant text. ToolCall/ToolResult/Thinking/UsageUpdate events are
 * observed (so the iterator advances and side effects happen) but not folded
 * into the output. An Error event ends the drain by throwing so that the
 * legacy try/catch shape continues to work for callers that expect rejection
 * on failure.
 */

import type { AgentEvent, AgentRunnerResult } from './types';

export async function collapseEventsToOutput(
  stream: AsyncIterable<AgentEvent>
): Promise<AgentRunnerResult> {
  let output = '';
  for await (const event of stream) {
    if (event.type === 'assistant_message') {
      output += event.text;
    } else if (event.type === 'error') {
      throw new Error(event.message);
    }
    // Other event types are observed-and-discarded — the legacy { output }
    // shape only carries assistant text.
  }
  return { output };
}
