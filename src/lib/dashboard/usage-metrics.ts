import type { ClaudeCodeJsonLogEntry } from './types';

export interface UsageMetrics {
  inputTokensEstimate: number;
  outputTokensEstimate: number;
  totalTokensEstimate: number;
  conversationTurns: number;
  toolUseCount: number;
  claudeExecutionMs?: number;
}

/**
 * Estimate token count from text length.
 * Approximation: ~4 characters per token for English text.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Extract usage metrics from Claude Code execution data.
 * Parses jsonLogs to count tool uses and conversation turns,
 * and estimates token usage from input/output text.
 */
export function extractUsageMetrics(
  jsonLogs: ClaudeCodeJsonLogEntry[] | undefined,
  question: string,
  response: string
): UsageMetrics {
  const inputTokensEstimate = estimateTokens(question);
  const outputTokensEstimate = estimateTokens(response);
  const totalTokensEstimate = inputTokensEstimate + outputTokensEstimate;

  let conversationTurns = 0;
  let toolUseCount = 0;
  let claudeExecutionMs: number | undefined;

  if (jsonLogs && jsonLogs.length > 0) {
    for (const log of jsonLogs) {
      // Count conversation turns (assistant messages)
      if (log.type === 'assistant') {
        conversationTurns++;

        // Count tool uses within assistant messages
        const message = log.message as { content?: unknown[] } | undefined;
        if (message?.content && Array.isArray(message.content)) {
          for (const block of message.content) {
            if (
              typeof block === 'object' &&
              block !== null &&
              'type' in block &&
              block.type === 'tool_use'
            ) {
              toolUseCount++;
            }
          }
        }
      }

      // Extract Claude's execution time from result log
      if (log.type === 'result' && log.duration_ms !== undefined) {
        claudeExecutionMs = log.duration_ms;
      }
    }
  }

  const result: UsageMetrics = {
    inputTokensEstimate,
    outputTokensEstimate,
    totalTokensEstimate,
    conversationTurns,
    toolUseCount,
  };

  if (claudeExecutionMs !== undefined) {
    result.claudeExecutionMs = claudeExecutionMs;
  }

  return result;
}
