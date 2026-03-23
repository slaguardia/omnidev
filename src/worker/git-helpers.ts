/**
 * Git helper utilities for the standalone worker.
 */

import type { AppConfig } from '@/lib/types/index';
import { detectProviderFromUrl } from '@/lib/git/provider-detection';
/**
 * Extract git credentials from app config based on the repo URL's provider.
 */
export function getGitCredentials(
  config: AppConfig,
  repoUrl: string
): { username: string; password: string } | null {
  const provider = detectProviderFromUrl(repoUrl);

  if (provider === 'github') {
    if (config.github.token && config.github.username) {
      return { username: config.github.username, password: config.github.token };
    }
  } else if (provider === 'gitlab') {
    if (config.gitlab.token && config.gitlab.username) {
      return { username: config.gitlab.username, password: config.gitlab.token };
    }
  }

  return null;
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
