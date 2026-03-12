/**
 * Stage executor — abstraction layer between Ralph workflow engine and AI backends.
 */

export type { StageExecutorOptions, StageExecutorResult, StageExecutor } from './types';
export { executeStage } from './claude-code-executor';

import { executeStage } from './claude-code-executor';
import type { StageExecutor } from './types';

/** Factory that returns the default Claude Code executor. */
export function createStageExecutor(): StageExecutor {
  return { execute: executeStage };
}
