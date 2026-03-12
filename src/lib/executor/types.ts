'use server';

/**
 * Stage executor interface — the seam between Ralph's workflow engine
 * and whatever AI backend actually runs the stage prompt.
 */

import type { FilePath, Result, WorkspaceId } from '@/lib/types/index';

export interface StageExecutorOptions {
  prompt: string;
  workingDirectory: FilePath;
  workspaceId: WorkspaceId;
  editMode: boolean;
  sourceBranch?: string | undefined;
}

export interface StageExecutorResult {
  output: string;
}

export interface StageExecutor {
  execute(options: StageExecutorOptions): Promise<Result<StageExecutorResult, Error>>;
}
