/**
 * GitLab utilities for merge request formatting and git context
 */

import { getCurrentBranch } from '@/lib/git/branches';
import { getStatus } from '@/lib/git/core';
import type { AsyncResult, FilePath } from '@/lib/types/index';
import type { MergeRequestContext } from './types';

/**
 * Format the merge request description with proper markdown
 * @deprecated Auto-generated summaries are no longer supported. Use manual descriptions.
 */
export function formatMergeRequestDescription(context: MergeRequestContext): string {
  console.warn('formatMergeRequestDescription is deprecated. Use manual descriptions instead.');

  const sections = [
    '## Summary',
    'Please provide a manual description for this merge request.',
    '',
    '## Changes',
    'Please list the key changes made in this merge request.',
    '',
  ];

  if (context.originalQuestion) {
    sections.push('## Original Request', '```', context.originalQuestion, '```', '');
  }

  if (context.modifiedFiles && context.modifiedFiles.length > 0) {
    sections.push('## Modified Files', ...context.modifiedFiles.map((file) => `- \`${file}\``), '');
  }

  sections.push('---', '*This merge request was created via GitLab integration.*');

  return sections.join('\n');
}

/**
 * Get git context for merge request creation
 */
export async function getGitContextForMR(workspacePath: FilePath): Promise<
  AsyncResult<{
    currentBranch: string;
    modifiedFiles: string[];
    hasChanges: boolean;
  }>
> {
  try {
    // Get current branch
    const branchResult = await getCurrentBranch(workspacePath);
    if (!branchResult.success) {
      return {
        success: false,
        error: new Error(`Failed to get current branch: ${branchResult.error.message}`),
      };
    }

    // Get git status to see modified files
    const statusResult = await getStatus(workspacePath);
    if (!statusResult.success) {
      return {
        success: false,
        error: new Error(`Failed to get git status: ${statusResult.error.message}`),
      };
    }

    const { staged, modified, untracked } = statusResult.data;
    const modifiedFiles = [...staged, ...modified, ...untracked];
    const hasChanges = modifiedFiles.length > 0;

    return {
      success: true,
      data: {
        currentBranch: branchResult.data,
        modifiedFiles,
        hasChanges,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to get git context: ${error}`),
    };
  }
}
