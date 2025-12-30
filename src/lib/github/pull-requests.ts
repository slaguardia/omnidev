'use server';

/**
 * GitHub Pull Request operations
 */

import { Octokit } from '@octokit/rest';
import type { AsyncResult, GitHubPullRequest } from '@/lib/types/index';
import type { CreatePullRequestParams } from './types';

/**
 * Create a pull request on GitHub
 */
export async function createPullRequest(
  params: CreatePullRequestParams
): Promise<AsyncResult<GitHubPullRequest>> {
  try {
    let token: string;

    // Get configuration from params OR load from saved config
    if (params.token) {
      token = params.token;
    } else {
      const { getConfig } = await import('@/lib/config/server-actions');
      const config = await getConfig();
      token = config.github?.token || '';
    }

    // Validate configuration
    if (!token) {
      return {
        success: false,
        error: new Error(
          'GitHub API not configured. Please add your GitHub token in settings.'
        ),
      };
    }

    // Initialize Octokit client
    const octokit = new Octokit({ auth: token });

    // Create pull request
    const response = await octokit.pulls.create({
      owner: params.owner,
      repo: params.repo,
      title: params.title,
      body: params.body,
      head: params.head,
      base: params.base,
      draft: params.draft ?? false,
    });

    const pr = response.data;

    // Transform Octokit response to match our interface
    const transformedData: GitHubPullRequest = {
      id: pr.id,
      number: pr.number,
      title: pr.title,
      body: pr.body || '',
      state: pr.state as 'open' | 'closed',
      head: {
        ref: pr.head.ref,
        sha: pr.head.sha,
      },
      base: {
        ref: pr.base.ref,
        sha: pr.base.sha,
      },
      htmlUrl: pr.html_url,
      createdAt: new Date(pr.created_at),
      updatedAt: new Date(pr.updated_at),
      user: {
        id: pr.user?.id || 0,
        login: pr.user?.login || '',
      },
      merged: pr.merged || false,
      ...(pr.merged_at && { mergedAt: new Date(pr.merged_at) }),
    };

    console.log(`[GITHUB] Pull request created: ${transformedData.htmlUrl}`);

    return { success: true, data: transformedData };
  } catch (error) {
    console.error('[GITHUB] Failed to create pull request:', error);
    return {
      success: false,
      error: new Error(`Failed to create pull request: ${error}`),
    };
  }
}

/**
 * Format a pull request description with standard metadata
 */
export async function formatPullRequestDescription(
  commitHash: string,
  originalQuestion?: string
): Promise<string> {
  const lines = [
    '## Automated Changes',
    '',
    'This pull request contains automated changes made by Claude Code.',
    '',
    '### Details',
    '',
    `- **Commit:** \`${commitHash}\``,
    `- **Timestamp:** ${new Date().toISOString()}`,
  ];

  if (originalQuestion) {
    lines.push('', '### Original Request', '', originalQuestion);
  }

  return lines.join('\n');
}
