/**
 * Job executor — single code path driven by payload.execution_mode.
 *
 * - edit:     clone → branch → runAgent (edit) → commit → push
 * - readonly: clone → runAgent (read-only) → return analysis
 *
 * Includes one automatic retry on agent failure with error context.
 */

import { rm, mkdir } from 'node:fs/promises';
import { nanoid } from 'nanoid';
import { cloneRepository } from '@/lib/git/core';
import { cloneFromCache } from '@/lib/git/repo-cache';
import { createSandboxedGit } from '@/lib/git/sandbox';
import { hasUncommittedChanges, addAllFiles, commitChanges } from '@/lib/git/commits';
import { pushChanges } from '@/lib/git/remotes';
import { detectProviderFromUrl } from '@/lib/git/provider-detection';
import { getConfig } from '@/lib/config/server-actions';
import {
  dbAppendAgentEvent,
  dbGetTask,
  dbUpdateAgentRunSummary,
} from '@/lib/managers/ralph-task-db';
import type { RalphJob } from '@/lib/managers/ralph-task-db';
import type { FilePath, GitUrl } from '@/lib/common/types';
import type { AgentRunner } from '@/lib/agent';
import {
  getGitCredentials,
  buildBranchName,
  buildCommitMessage,
  buildWorkspaceDir,
  checkoutOrCreateBranch,
} from './git-helpers';

export interface JobResult {
  output: string;
  branch: string | null;
  commit_hash: string | null;
  execution_mode: 'readonly' | 'edit';
  retried: boolean;
  execution_time_ms: number;
  /** Per-stage breakdown for observability (all in ms, null when stage was skipped). */
  timings: {
    clone_ms: number | null;
    agent_ms: number | null;
    push_ms: number | null;
    total_ms: number;
  };
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
 *
 * @param runId optional agent_runs row id. When set, every AgentEvent emitted
 *   during the run is persisted to agent_events and usage_update events
 *   update the run's summary fields. Threaded from src/worker/src/index.ts:
 *   runJob, where the row is created.
 */
export async function executeV2Job(
  job: RalphJob,
  agent: AgentRunner,
  runId?: string,
  signal?: AbortSignal
): Promise<JobResult> {
  const startTime = Date.now();
  const payload = parsePayload(job);
  const task = await loadTask(payload.task_id);
  const executionMode = payload.execution_mode ?? 'edit';
  const isEdit = executionMode === 'edit';
  const logTag = `[WORKER:${executionMode}]`;

  const branchName = isEdit ? buildBranchName(task.id) : null;
  const tmpDir = buildWorkspaceDir(task.id, job.id);

  let cloneMs: number | null = null;
  let agentMs: number | null = null;
  let pushMs: number | null = null;

  try {
    await mkdir(tmpDir, { recursive: true });
    console.log(`${logTag} Temp dir: ${tmpDir}`);

    const config = await getConfig();
    const credentials = getGitCredentials(config, payload.repo_url);

    // Clone (via shared bare-clone cache when enabled — reduces wall-clock and
    // disk per job for repeated runs against the same repo)
    console.log(`${logTag} Cloning ${payload.repo_url}...`);
    const cloneOpts = credentials ? { credentials } : {};
    const useCache = process.env.OMNIDEV_REPO_CACHE !== '0';
    const cloneStart = Date.now();
    const cloneResult = useCache
      ? await cloneFromCache(payload.repo_url as GitUrl, tmpDir as FilePath, cloneOpts)
      : await cloneRepository(payload.repo_url as GitUrl, tmpDir as FilePath, cloneOpts);
    cloneMs = Date.now() - cloneStart;
    if (!cloneResult.success) {
      throw new Error(`Clone failed: ${cloneResult.error.message}`);
    }

    // Branch + unshallow (edit mode only). The cached path produces a full clone
    // via --reference so unshallow is a no-op there; the legacy path is shallow
    // and needs unshallow before push.
    if (isEdit && branchName) {
      const git = createSandboxedGit(tmpDir);
      console.log(`${logTag} Checking out branch: ${branchName}`);
      await checkoutOrCreateBranch(git, branchName);

      try {
        await git.fetch(['--unshallow']);
      } catch {
        // Already unshallow or not applicable
      }
    }

    // Run agent with one retry on failure
    console.log(`${logTag} Running agent (${executionMode} mode)...`);
    const agentStart = Date.now();
    const { output, retried } = await runAgentWithRetry(
      agent,
      task.description ?? payload.description,
      tmpDir,
      isEdit,
      logTag,
      runId,
      signal
    );
    agentMs = Date.now() - agentStart;

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
        const pushStart = Date.now();
        const pushResult = await pushChanges(tmpDir as FilePath, branchName!);
        pushMs = Date.now() - pushStart;
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

    const totalMs = Date.now() - startTime;
    console.log(
      `[WORKER:duration] ${JSON.stringify({
        job_id: job.id,
        task_id: task.id,
        agent_type: job.agent_type,
        repo_url: payload.repo_url,
        execution_mode: executionMode,
        clone_ms: cloneMs,
        agent_ms: agentMs,
        push_ms: pushMs,
        total_ms: totalMs,
        retried,
      })}`
    );

    return {
      output,
      branch: branchName,
      commit_hash: commitHash,
      execution_mode: executionMode,
      retried,
      execution_time_ms: totalMs,
      timings: {
        clone_ms: cloneMs,
        agent_ms: agentMs,
        push_ms: pushMs,
        total_ms: totalMs,
      },
    };
  } finally {
    await cleanupTmpDir(tmpDir);
  }
}

// ---------------------------------------------------------------------------
// Agent retry logic
// ---------------------------------------------------------------------------

/**
 * Drain a single AgentRunner.run() invocation. Persists events to
 * agent_events when runId is set; the workerSeq counter is shared across
 * attempts so retried runs continue the seq sequence rather than colliding
 * with the first attempt's seq=0.
 *
 * Returns: the assembled assistant text, any error event encountered (used
 * by the retry path), and the cumulative usage so the caller can write a
 * single per-run summary.
 */
async function consumeAttempt(
  agent: AgentRunner,
  question: string,
  workingDirectory: string,
  editRequest: boolean,
  runId: string | undefined,
  workerSeq: { next: () => number },
  signal?: AbortSignal
): Promise<{
  output: string;
  errorEvent: { message: string; recoverable: boolean } | null;
  usage: { inputTokens: number; outputTokens: number; model: string } | null;
}> {
  let output = '';
  let errorEvent: { message: string; recoverable: boolean } | null = null;
  let usage: { inputTokens: number; outputTokens: number; model: string } | null = null;

  const runOpts: Parameters<typeof agent.run>[0] = {
    question,
    workingDirectory,
    editRequest,
  };
  if (signal) runOpts.signal = signal;
  for await (const event of agent.run(runOpts)) {
    if (runId) {
      // Replace the agent's per-stream seq with the worker's per-run counter
      // so retry attempts produce a continuous seq sequence under one runId.
      const persistedSeq = workerSeq.next();
      try {
        await dbAppendAgentEvent({
          id: nanoid(12),
          run_id: runId,
          seq: persistedSeq,
          type: event.type,
          payload: JSON.stringify({ ...event, seq: persistedSeq }),
          created_at: event.timestamp,
        });
      } catch (err) {
        // Persistence is best-effort — the agent stream is canonical.
        console.warn(`[WORKER] Failed to persist event seq=${persistedSeq}:`, err);
      }
    }

    if (event.type === 'assistant_message') {
      output += event.text;
    } else if (event.type === 'usage_update') {
      usage = {
        inputTokens: event.inputTokens,
        outputTokens: event.outputTokens,
        model: event.model,
      };
    } else if (event.type === 'error') {
      errorEvent = { message: event.message, recoverable: event.recoverable };
    }
  }

  return { output, errorEvent, usage };
}

/**
 * Exported only for tests — internal helper that drives the retry-once
 * behavior on top of the streaming AgentRunner contract.
 */
export async function runAgentWithRetry(
  agent: AgentRunner,
  question: string,
  workingDirectory: string,
  editRequest: boolean,
  logTag: string,
  runId?: string,
  signal?: AbortSignal
): Promise<{ output: string; retried: boolean }> {
  const workerSeq = (() => {
    let s = 0;
    return { next: () => s++ };
  })();

  let firstAttemptError: Error | null = null;
  let firstAttempt: Awaited<ReturnType<typeof consumeAttempt>> | null = null;

  try {
    firstAttempt = await consumeAttempt(
      agent,
      question,
      workingDirectory,
      editRequest,
      runId,
      workerSeq,
      signal
    );
    if (firstAttempt.errorEvent) {
      firstAttemptError = new Error(firstAttempt.errorEvent.message);
    }
  } catch (caughtError) {
    firstAttemptError = caughtError instanceof Error ? caughtError : new Error(String(caughtError));
  }

  if (!firstAttemptError && firstAttempt) {
    if (runId && firstAttempt.usage) {
      await persistUsage(runId, firstAttempt.usage);
    }
    return { output: firstAttempt.output, retried: false };
  }

  const errorMsg = firstAttemptError?.message ?? 'unknown agent failure';
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

  const retryAttempt = await consumeAttempt(
    agent,
    retryQuestion,
    workingDirectory,
    editRequest,
    runId,
    workerSeq,
    signal
  );

  if (retryAttempt.errorEvent) {
    throw new Error(retryAttempt.errorEvent.message);
  }
  if (runId && retryAttempt.usage) {
    await persistUsage(runId, retryAttempt.usage);
  }
  console.log(`${logTag} Retry succeeded`);
  return { output: retryAttempt.output, retried: true };
}

async function persistUsage(
  runId: string,
  usage: { inputTokens: number; outputTokens: number; model: string }
): Promise<void> {
  try {
    await dbUpdateAgentRunSummary(runId, {
      model: usage.model,
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
      total_tokens: usage.inputTokens + usage.outputTokens,
    });
  } catch (err) {
    console.warn(`[WORKER] Failed to persist agent run summary for ${runId}:`, err);
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

async function cleanupTmpDir(tmpDir: string): Promise<void> {
  try {
    await rm(tmpDir, { recursive: true, force: true });
    console.log(`[WORKER] Cleaned up temp dir: ${tmpDir}`);
  } catch (err) {
    console.warn(`[WORKER] Failed to clean up temp dir:`, err);
  }
}
