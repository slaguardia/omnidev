/**
 * Git helper utilities for the standalone worker.
 */

import type { AppConfig } from '@/lib/types/index';
import { getGitCredentialsFromConfig } from '@/lib/git/repo-credentials';

export function getGitCredentials(
  config: AppConfig,
  repoUrl: string
): { username: string; password: string } | null {
  return getGitCredentialsFromConfig(config, repoUrl);
}

/**
 * Build a branch name for a task.
 */
export function buildBranchName(taskId: string): string {
  return `omnidev/task-${taskId}`;
}

/**
 * Build a commit message for a task.
 */
export function buildCommitMessage(task: { id: string; title: string }): string {
  return `feat: [TASK-${task.id}] ${task.title}\n\nCo-Authored-By: Claude <noreply@anthropic.com>`;
}
