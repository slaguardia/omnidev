import { useState } from 'react';
import { ClaudeForm } from '@/lib/dashboard/types';

const initialClaudeForm: ClaudeForm = {
  workspaceId: '',
  question: '',
  context: '',
  sourceBranch: '',
};

interface JobResult {
  output?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationInputTokens?: number;
    cacheReadInputTokens?: number;
    costUsd?: number;
  };
}

interface JobResponse {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: JobResult;
  error?: string;
}

/**
 * Poll for job completion with exponential backoff
 */
async function pollForJobResult(jobId: string, maxAttempts = 60): Promise<JobResponse> {
  const pollIntervalMs = 2000; // 2 seconds between polls

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await fetch(`/api/jobs/${jobId}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch job status: ${response.statusText}`);
    }

    const job: JobResponse = await response.json();

    if (job.status === 'completed' || job.status === 'failed') {
      return job;
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error('Job polling timed out');
}

/**
 * Format usage info for display
 */
function formatUsageInfo(usage: JobResult['usage']): string {
  if (!usage) return '';

  const parts: string[] = [];

  // Token info
  const totalInput =
    usage.inputTokens + (usage.cacheCreationInputTokens || 0) + (usage.cacheReadInputTokens || 0);
  parts.push(`${totalInput.toLocaleString()} input`);
  parts.push(`${usage.outputTokens.toLocaleString()} output tokens`);

  // Cost info
  if (usage.costUsd !== undefined && usage.costUsd > 0) {
    parts.push(`$${usage.costUsd.toFixed(4)}`);
  }

  return ` (${parts.join(', ')})`;
}

export const useClaudeOperations = () => {
  const [claudeForm, setClaudeForm] = useState<ClaudeForm>(initialClaudeForm);
  const [claudeResponse, setClaudeResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAskClaude = async () => {
    try {
      setLoading(true);
      setClaudeResponse(null);

      // Omit optional fields when empty so the API can apply defaults.
      const payload: Record<string, unknown> = {
        workspaceId: claudeForm.workspaceId,
        question: claudeForm.question,
        context: claudeForm.context,
      };
      if (claudeForm.sourceBranch && claudeForm.sourceBranch.trim().length > 0) {
        payload.sourceBranch = claudeForm.sourceBranch.trim();
      }

      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Claude request failed');
      }

      // API returns queued job - poll for result
      if (data.queued && data.jobId) {
        const job = await pollForJobResult(data.jobId);

        if (job.status === 'failed') {
          throw new Error(job.error || 'Job execution failed');
        }

        const output = job.result?.output || '';
        setClaudeResponse(output);

        const usageInfo = formatUsageInfo(job.result?.usage);
        return {
          success: true,
          message: `Claude Code responded successfully!${usageInfo}`,
          response: output,
          usage: job.result?.usage,
        };
      }

      // Fallback for immediate response (legacy/direct mode)
      setClaudeResponse(data.response);
      const usageInfo = formatUsageInfo(data.usage);
      return {
        success: true,
        message: `Claude Code responded successfully!${usageInfo}`,
        response: data.response,
        usage: data.usage,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        message: `Claude request failed: ${errorMessage}`,
        error,
      };
    } finally {
      setLoading(false);
    }
  };

  const resetClaudeForm = () => {
    setClaudeForm(initialClaudeForm);
    setClaudeResponse(null);
  };

  return {
    claudeForm,
    setClaudeForm,
    claudeResponse,
    setClaudeResponse,
    loading,
    handleAskClaude,
    resetClaudeForm,
  };
};
