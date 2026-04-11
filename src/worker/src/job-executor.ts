/**
 * Job executor — single code path driven by payload.execution_mode.
 *
 * - edit:     clone → branch → runAgent (edit) → commit → push
 * - readonly: clone → runAgent (read-only) → return analysis
 *
 * Includes one automatic retry on agent failure with error context.
 */

import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { rm, mkdir } from 'node:fs/promises';
import { cloneRepository } from '@/lib/git/core';
import { createSandboxedGit } from '@/lib/git/sandbox';
import { hasUncommittedChanges, addAllFiles, commitChanges } from '@/lib/git/commits';
import { pushChanges } from '@/lib/git/remotes';
import { detectProviderFromUrl } from '@/lib/git/provider-detection';
import { getConfig } from '@/lib/config/server-actions';
import { dbGetTask } from '@/lib/managers/ralph-task-db';
import type { RalphJob } from '@/lib/managers/ralph-task-db';
import type { FilePath, GitUrl } from '@/lib/common/types';
import type { AgentRunner } from '@/lib/agent/claude-code-agent';
import { getGitCredentials, buildBranchName, buildCommitMessage } from './git-helpers';

export interface JobResult {
  output: string;
  branch: string | null;
  commit_hash: string | null;
  execution_mode: 'readonly' | 'edit';
  retried: boolean;
  execution_time_ms: number;
}

interface JobPayload {
  task_id: string;
  description: string;
  repo_url: string;
  branch?: string;
  execution_mode?: 'readonly' | 'edit';
}

/**
 * Execute a V2 job — single code path, branched by payload.execution_mode.
 */
export async function executeV2Job(job: RalphJob, agent: AgentRunner): Promise<JobResult> {
  const startTime = Date.now();
  const payload = parsePayload(job);
  const task = await loadTask(payload.task_id);
  const executionMode = payload.execution_mode ?? 'edit';
  const isEdit = executionMode === 'edit';
  const logTag = `[WORKER:${executionMode}]`;

  const branchName = isEdit ? buildBranchName(task.id) : null;
  const tmpDir = makeTmpDir(task.id);

  try {
    await mkdir(tmpDir, { recursive: true });
    console.log(`${logTag} Temp dir: ${tmpDir}`);

    const config = await getConfig();
    const credentials = getGitCredentials(config, payload.repo_url);

    // Clone
    console.log(`${logTag} Cloning ${payload.repo_url}...`);
    const cloneOpts = credentials ? { credentials } : {};
    const cloneResult = await cloneRepository(
      payload.repo_url as GitUrl,
      tmpDir as FilePath,
      cloneOpts
    );
    if (!cloneResult.success) {
      throw new Error(`Clone failed: ${cloneResult.error.message}`);
    }

    // Branch + unshallow (edit mode only)
    if (isEdit && branchName) {
      const git = createSandboxedGit(tmpDir);
      console.log(`${logTag} Checking out branch: ${branchName}`);
      await git.checkoutLocalBranch(branchName);

      try {
        await git.fetch(['--unshallow']);
      } catch {
        // Already unshallow or not applicable
      }
    }

    // Run agent with one retry on failure
    console.log(`${logTag} Running agent (${executionMode} mode)...`);
    const { output, retried } = await runAgentWithRetry(
      agent,
      task.description ?? payload.description,
      tmpDir,
      isEdit,
      logTag
    );

    // Commit + push if edit mode and changes exist
    let commitHash: string | null = null;
    if (isEdit) {
      const changesResult = await hasUncommittedChanges(tmpDir as FilePath);
      if (changesResult.success && changesResult.data) {
        console.log(`${logTag} Changes detected, staging and committing...`);

        const addResult = await addAllFiles(tmpDir as FilePath);
        if (!addResult.success) {
          throw new Error(`Failed to stage files: ${addResult.error.message}`);
        }

        // Set git identity
        const git = createSandboxedGit(tmpDir);
        const provider = detectProviderFromUrl(payload.repo_url);
        const commitName =
          provider === 'github' ? config.github.commitName : config.gitlab.commitName;
        const commitEmail =
          provider === 'github' ? config.github.commitEmail : config.gitlab.commitEmail;
        if (commitName) await git.addConfig('user.name', commitName);
        if (commitEmail) await git.addConfig('user.email', commitEmail);

        const commitMessage = buildCommitMessage(task);
        const commitResult = await commitChanges(tmpDir as FilePath, commitMessage);
        if (!commitResult.success) {
          throw new Error(`Commit failed: ${commitResult.error.message}`);
        }
        commitHash = commitResult.data;
        console.log(`${logTag} Committed: ${commitHash}`);

        // Push
        console.log(`${logTag} Pushing branch ${branchName}...`);
        const pushResult = await pushChanges(tmpDir as FilePath, branchName!);
        if (!pushResult.success) {
          throw new Error(`Push failed: ${pushResult.error.message}`);
        }
        console.log(`${logTag} Branch pushed: ${branchName}. PR creation: TODO`);
      } else {
        console.log(`${logTag} No changes detected after agent execution`);
      }
    } else {
      console.log(`${logTag} Read-only mode — skipping git operations`);
    }

    return {
      output,
      branch: branchName,
      commit_hash: commitHash,
      execution_mode: executionMode,
      retried,
      execution_time_ms: Date.now() - startTime,
    };
  } finally {
    await cleanupTmpDir(tmpDir);
  }
}

// ---------------------------------------------------------------------------
// Agent retry logic
// ---------------------------------------------------------------------------

async function runAgentWithRetry(
  agent: AgentRunner,
  question: string,
  workingDirectory: string,
  editRequest: boolean,
  logTag: string
): Promise<{ output: string; retried: boolean }> {
  try {
    const result = await agent.run({ question, workingDirectory, editRequest });
    return { output: result.output, retried: false };
  } catch (firstError) {
    const errorMsg = firstError instanceof Error ? firstError.message : String(firstError);
    console.warn(`${logTag} First attempt failed: ${errorMsg}. Retrying with error context...`);

    const retryQuestion = [
      question,
      '',
      '---',
      'The previous attempt to complete this task failed with this error:',
      errorMsg,
      '',
      'Please try again, addressing the error above.',
    ].join('\n');

    const result = await agent.run({
      question: retryQuestion,
      workingDirectory,
      editRequest,
    });
    console.log(`${logTag} Retry succeeded`);
    return { output: result.output, retried: true };
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function parsePayload(job: RalphJob): JobPayload {
  const payload = JSON.parse(job.payload) as JobPayload;
  if (!payload.repo_url) {
    throw new Error('Job payload missing repo_url');
  }
  return payload;
}

async function loadTask(taskId: string) {
  const task = await dbGetTask(taskId);
  if (!task) {
    throw new Error(`Task ${taskId} not found`);
  }
  return task;
}

function makeTmpDir(taskId: string): string {
  return resolve(tmpdir(), 'omnidev', `task-${taskId}`);
}

async function cleanupTmpDir(tmpDir: string): Promise<void> {
  try {
    await rm(tmpDir, { recursive: true, force: true });
    console.log(`[WORKER] Cleaned up temp dir: ${tmpDir}`);
  } catch (err) {
    console.warn(`[WORKER] Failed to clean up temp dir:`, err);
  }
}
