/**
 * Git provider detection utilities
 */

import type { GitProvider } from '@/lib/types/index';

/**
 * Detect the git provider from a repository URL
 * Handles SSH (git@) and HTTPS formats
 */
export function detectProviderFromUrl(url: string): GitProvider {
  const normalized = url.toLowerCase();

  // Check for GitHub
  if (normalized.includes('github.com') || normalized.includes('github.')) {
    return 'github';
  }

  // Check for GitLab
  if (normalized.includes('gitlab.com') || normalized.includes('gitlab.')) {
    return 'gitlab';
  }

  // Could add more providers here (bitbucket, etc.)
  return 'other';
}

/**
 * Extract owner and repo from a GitHub URL
 * Handles both SSH and HTTPS formats:
 * - git@github.com:owner/repo.git
 * - https://github.com/owner/repo.git
 * - https://github.com/owner/repo
 */
export function extractGitHubOwnerRepo(url: string): { owner: string; repo: string } | null {
  try {
    let cleanUrl = url.replace(/\.git$/, '');

    // Handle SSH format: git@github.com:owner/repo
    if (cleanUrl.startsWith('git@')) {
      const match = cleanUrl.match(/git@[^:]+:(.+)\/(.+)$/);
      if (match && match[1] && match[2]) {
        return { owner: match[1], repo: match[2] };
      }
      return null;
    }

    // Handle HTTPS format: https://github.com/owner/repo
    const urlObj = new URL(cleanUrl);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);

    if (pathParts.length >= 2 && pathParts[0] && pathParts[1]) {
      return { owner: pathParts[0], repo: pathParts[1] };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Check if a URL is a valid GitHub repository URL
 */
export function isGitHubUrl(url: string): boolean {
  return detectProviderFromUrl(url) === 'github';
}

/**
 * Check if a URL is a valid GitLab repository URL
 */
export function isGitLabUrl(url: string): boolean {
  return detectProviderFromUrl(url) === 'gitlab';
}
