/**
 * Git helper utilities for the standalone worker.
 */

import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import type { AppConfig } from '@/lib/types/index';
import { getGitCredentialsFromConfig } from '@/lib/git/repo-credentials';
import type { createSandboxedGit } from '@/lib/git/sandbox';

type SandboxedGit = ReturnType<typeof createSandboxedGit>;

export function getGitCredentials(
  config: AppConfig,
  repoUrl: string
): { username: string; password: string } | null {
  return getGitCredentialsFromConfig(config, repoUrl);
}

/**
 * Build a branch name for a task. Branch name is keyed by task ID only so that
 * subsequent runs of the same task push to the same remote branch.
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

/**
 * Build a per-job workspace directory. Keyed by both task ID and job ID so that
 * concurrent runs of the same task get isolated working trees.
 */
export function buildWorkspaceDir(taskId: string, jobId: string): string {
  return resolve(tmpdir(), 'omnidev', `task-${taskId}`, `job-${jobId}`);
}

/**
 * Check out a local branch, creating it if it does not already exist.
 * Mirrors the existence-check pattern used by the Ralph stage runner so that a
 * pre-existing branch (e.g. carried over from a cached/reference clone) does
 * not crash the V2 pipeline.
 */
export async function checkoutOrCreateBranch(
  git: SandboxedGit,
  branchName: string
): Promise<void> {
  const branches = await git.branchLocal();
  if (branches.all.includes(branchName)) {
    await git.checkout(branchName);
  } else {
    await git.checkoutLocalBranch(branchName);
  }
}
