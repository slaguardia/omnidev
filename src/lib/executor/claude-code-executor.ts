'use server';

/**
 * Claude Code CLI executor — adapts askClaudeCode() to the StageExecutor interface.
 */

import { askClaudeCode } from '@/lib/claudeCode';
import type { ClaudeCodeOptions } from '@/lib/claudeCode';
import type { Result } from '@/lib/types/index';
import type { StageExecutorOptions, StageExecutorResult } from './types';

export async function executeStage(
  options: StageExecutorOptions
): Promise<Result<StageExecutorResult, Error>> {
  const ccOptions: ClaudeCodeOptions = {
    question: options.prompt,
    workingDirectory: options.workingDirectory,
    workspaceId: options.workspaceId,
    editRequest: options.editMode,
  };

  if (options.sourceBranch) {
    ccOptions.sourceBranch = options.sourceBranch;
  }

  const result = await askClaudeCode(ccOptions);

  if (!result.success) {
    return { success: false, error: result.error };
  }

  return { success: true, data: { output: result.data.output } };
}
