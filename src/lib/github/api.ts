/**
 * GitHub API utilities
 */

import { Octokit } from '@octokit/rest';
import type { AsyncResult, GitUrl } from '@/lib/types/index';

/**
 * Extract owner and repo from a GitHub repository URL
 * Handles multiple URL formats:
 * - git@github.com:owner/repo.git
 * - https://github.com/owner/repo.git
 * - https://github.com/owner/repo
 */
export function extractOwnerRepoFromUrl(
  repoUrl: GitUrl | string
): { owner: string; repo: string } | null {
  try {
    let cleanUrl = String(repoUrl).replace(/\.git$/, '');

    // Handle SSH format: git@github.com:owner/repo
    if (cleanUrl.startsWith('git@')) {
      const match = cleanUrl.match(/git@[^:]+:(.+)\/(.+)$/);
      if (match && match[1] && match[2]) {
        return { owner: match[1], repo: match[2] };
      }
      return null;
    }

    // Handle HTTPS format: https://github.com/owner/repo
    const url = new URL(cleanUrl);
    const pathParts = url.pathname.split('/').filter(Boolean);

    if (pathParts.length >= 2 && pathParts[0] && pathParts[1]) {
      return { owner: pathParts[0], repo: pathParts[1] };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Get repository information from GitHub
 */
export async function getRepository(
  owner: string,
  repo: string,
  token: string
): Promise<AsyncResult<unknown>> {
  try {
    const octokit = new Octokit({ auth: token });
    const response = await octokit.repos.get({ owner, repo });
    return { success: true, data: response.data };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to get repository: ${error}`),
    };
  }
}

/**
 * Get branches from a GitHub repository
 */
export async function getRepositoryBranches(
  owner: string,
  repo: string,
  token: string
): Promise<AsyncResult<unknown[]>> {
  try {
    const octokit = new Octokit({ auth: token });
    const response = await octokit.repos.listBranches({ owner, repo });
    return { success: true, data: response.data };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to get repository branches: ${error}`),
    };
  }
}

/**
 * Get pull requests from a GitHub repository
 */
export async function getRepositoryPullRequests(
  owner: string,
  repo: string,
  token: string,
  options?: { state?: 'open' | 'closed' | 'all' }
): Promise<AsyncResult<unknown[]>> {
  try {
    const octokit = new Octokit({ auth: token });
    const response = await octokit.pulls.list({
      owner,
      repo,
      state: options?.state || 'open',
    });
    return { success: true, data: response.data };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to get pull requests: ${error}`),
    };
  }
}
