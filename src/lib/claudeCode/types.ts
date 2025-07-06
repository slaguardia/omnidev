/**
 * Types and interfaces for Claude Code integration
 */

import type { FilePath, WorkspaceId } from '@/lib/common/types';

export interface ClaudeCodeOptions {
  editRequest: boolean;
  question: string;
  context?: string;
  workingDirectory: FilePath;
  workspaceId: WorkspaceId;
}

export interface ClaudeCodeResult {
  output: string;
}

export interface PostExecutionResult {
  hasChanges: boolean;
  commitHash?: string;
  mergeRequestUrl?: string;
  pushedBranch?: string;
} 