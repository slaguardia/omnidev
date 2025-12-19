'use server';

import { ExecutionHistoryEntry } from './types';
import { listJobs, deleteFinishedJob, createJobId } from '@/lib/queue';
import type { ClaudeCodeJobPayload, ClaudeCodeJobResult } from '@/lib/queue';
import { getProjectDisplayName } from './helpers';

/**
 * Load execution history from finished Claude Code jobs
 */
export async function loadExecutionHistory(): Promise<ExecutionHistoryEntry[]> {
  try {
    // Get all completed and failed jobs
    const allJobs = await listJobs(['completed', 'failed']);

    // Filter to only Claude Code jobs and convert to ExecutionHistoryEntry
    const history: ExecutionHistoryEntry[] = [];

    for (const job of allJobs) {
      if (job.type !== 'claude-code') continue;

      const payload = job.payload as ClaudeCodeJobPayload;
      const workspaceName = payload.repoUrl
        ? getProjectDisplayName(payload.repoUrl)
        : String(payload.workspaceId);

      const entry: ExecutionHistoryEntry = {
        id: job.id, // Use job ID as execution ID
        workspaceId: String(payload.workspaceId),
        workspaceName,
        question: payload.question,
        response: '',
        status: job.status === 'completed' ? 'success' : 'error',
        executedAt: job.completedAt || job.createdAt,
      };

      if (job.status === 'completed' && job.result) {
        const result = job.result as ClaudeCodeJobResult;
        entry.response = result.output || '';
        entry.executionTimeMs = result.executionTimeMs;
        if (result.jsonLogs) {
          entry.jsonLogs = result.jsonLogs;
        }
        if (result.rawOutput) {
          entry.rawOutput = result.rawOutput;
        }
      } else if (job.status === 'failed' && job.error) {
        entry.errorMessage = job.error;
      }

      history.push(entry);
    }

    // Sort by executedAt (newest first) and limit to 100
    return history
      .sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime())
      .slice(0, 100);
  } catch (error) {
    console.error('Failed to load execution history:', error);
    return [];
  }
}

/**
 * Save a new execution to history
 *
 * NOTE: This is now a no-op since history is derived from finished jobs.
 * Kept for backward compatibility with existing code that may call it.
 */
export async function saveExecutionToHistory(
  _entry: Omit<ExecutionHistoryEntry, 'id' | 'executedAt'>
): Promise<{ success: boolean; message: string }> {
  // History is now derived from finished jobs, so this is a no-op
  return { success: true, message: 'Execution will appear in history when job completes' };
}

/**
 * Clear all execution history (deletes all finished Claude Code jobs)
 */
export async function clearExecutionHistory(): Promise<{ success: boolean; message: string }> {
  try {
    // Get all finished Claude Code jobs
    const allJobs = await listJobs(['completed', 'failed']);
    const claudeJobs = allJobs.filter((j) => j.type === 'claude-code');

    let deleted = 0;
    let errors = 0;

    for (const job of claudeJobs) {
      const result = await deleteFinishedJob(job.id);
      if (result.success) {
        deleted++;
      } else {
        errors++;
      }
    }

    if (errors > 0) {
      return {
        success: false,
        message: `Cleared ${deleted} executions, ${errors} errors`,
      };
    }

    return { success: true, message: `Cleared ${deleted} execution${deleted !== 1 ? 's' : ''}` };
  } catch (error) {
    console.error('Failed to clear execution history:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to clear history',
    };
  }
}

/**
 * Delete a specific execution from history (deletes the corresponding finished job)
 */
export async function deleteExecutionFromHistory(
  executionId: string
): Promise<{ success: boolean; message: string }> {
  try {
    // executionId is the job ID
    const jobId = createJobId(executionId);
    const result = await deleteFinishedJob(jobId);

    if (result.success) {
      return { success: true, message: 'Execution deleted' };
    }

    if (result.reason === 'not_found') {
      return { success: false, message: 'Execution not found' };
    }

    if (result.reason === 'not_finished') {
      return {
        success: false,
        message: 'Execution is not finished (cannot delete pending/processing jobs)',
      };
    }

    return { success: false, message: 'Failed to delete execution' };
  } catch (error) {
    console.error('Failed to delete execution from history:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to delete execution',
    };
  }
}
