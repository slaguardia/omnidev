/**
 * Agent runner interface — abstracts the AI execution backend.
 *
 * Default implementation wraps Claude Code CLI.
 * Swap to OpenClaw, a custom loop, or any other backend by implementing AgentRunner.
 */

import { askClaudeCode } from '@/lib/claudeCode/orchestrator';
import type { FilePath } from '@/lib/common/types';

export interface AgentRunnerOptions {
  question: string;
  workingDirectory: string;
  editRequest: boolean;
  /** Extra environment variables to pass to the agent subprocess */
  extraEnv?: Record<string, string> | undefined;
}

export interface AgentRunnerResult {
  output: string;
}

export interface AgentRunner {
  run(options: AgentRunnerOptions): Promise<AgentRunnerResult>;
}

/**
 * Default agent runner — delegates to Claude Code CLI.
 */
export class ClaudeCodeAgent implements AgentRunner {
  async run(options: AgentRunnerOptions): Promise<AgentRunnerResult> {
    const result = await askClaudeCode({
      question: options.question,
      workingDirectory: options.workingDirectory as FilePath,
      editRequest: options.editRequest,
      extraEnv: options.extraEnv,
    });
    if (!result.success) {
      throw new Error(result.error.message);
    }
    return { output: result.data.output };
  }
}
