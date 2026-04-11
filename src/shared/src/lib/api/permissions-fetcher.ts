/**
 * Shared permissions fetcher for GitHub/GitLab repositories
 * Consolidates duplicated permissions logic from workspace routes
 */

import { isGitLabUrl, isGitHubUrl } from '@/lib/git';
import {
  extractProjectIdFromUrl as extractGitLabProjectId,
  getGitLabConfig,
  getRepositoryPermissions as getGitLabRepositoryPermissions,
} from '@/lib/gitlab';
import {
  extractOwnerRepoFromUrl as extractGitHubOwnerRepo,
  getGitHubConfig,
  getRepositoryPermissions as getGitHubRepositoryPermissions,
} from '@/lib/github';
import type { WorkspacePermissions, GitUrl, Result } from '@/lib/types/index';

export type GitProvider = 'github' | 'gitlab' | 'unknown';

export interface FetchPermissionsOptions {
  /** Repository URL (GitHub or GitLab) */
  repoUrl: string;
  /** Branch to check permissions for */
  branch: string;
  /** Optional log prefix for consistent logging */
  logPrefix?: string;
}

export interface FetchPermissionsResult {
  /** The detected git provider */
  provider: GitProvider;
  /** The fetched permissions (if successful) */
  permissions?: WorkspacePermissions;
  /** Error message if the fetch failed */
  error?: string;
  /** Whether the failure is due to missing configuration (not an actual error) */
  missingConfig?: boolean;
}

/**
 * Detect the git provider from a repository URL
 */
export function detectProvider(repoUrl: string): GitProvider {
  // Cast to GitUrl for the type-safe functions
  const url = repoUrl as GitUrl;
  if (isGitHubUrl(url)) return 'github';
  if (isGitLabUrl(url)) return 'gitlab';
  return 'unknown';
}

/**
 * Fetch repository permissions for a GitHub or GitLab repository
 * Returns permissions data or an error result
 */
export async function fetchRepositoryPermissions(
  options: FetchPermissionsOptions
): Promise<Result<FetchPermissionsResult>> {
  const { repoUrl, branch, logPrefix = 'PERMISSIONS' } = options;
  const provider = detectProvider(repoUrl);

  if (provider === 'unknown') {
    return {
      success: false,
      error: new Error('Unknown repository provider. Only GitHub and GitLab are supported.'),
    };
  }

  try {
    if (provider === 'gitlab') {
      return await fetchGitLabPermissions(repoUrl, branch, logPrefix);
    } else {
      return await fetchGitHubPermissions(repoUrl, branch, logPrefix);
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

async function fetchGitLabPermissions(
  repoUrl: string,
  branch: string,
  logPrefix: string
): Promise<Result<FetchPermissionsResult>> {
  const gitlabConfig = await getGitLabConfig();

  if (!gitlabConfig.token) {
    console.log(`[${logPrefix}] No GitLab token configured, skipping permission check`);
    return {
      success: true,
      data: {
        provider: 'gitlab',
        missingConfig: true,
        error: 'No GitLab token configured. Configure credentials in Git Source Config.',
      },
    };
  }

  const projectId = extractGitLabProjectId(repoUrl as GitUrl);
  if (!projectId) {
    return {
      success: false,
      error: new Error('Could not extract GitLab project ID from repository URL'),
    };
  }

  const permResult = await getGitLabRepositoryPermissions(
    projectId,
    branch,
    gitlabConfig.baseUrl,
    gitlabConfig.token
  );

  if (permResult.success) {
    console.log(`[${logPrefix}] GitLab permissions fetched:`, {
      accessLevel: permResult.data.accessLevelName,
      targetBranchProtected: permResult.data.targetBranchProtected,
      canPushToProtected: permResult.data.canPushToProtected,
    });
    return {
      success: true,
      data: {
        provider: 'gitlab',
        permissions: permResult.data,
      },
    };
  }

  console.warn(`[${logPrefix}] Could not check GitLab permissions:`, permResult.error?.message);
  return {
    success: false,
    error: permResult.error || new Error('Failed to check GitLab permissions'),
  };
}

async function fetchGitHubPermissions(
  repoUrl: string,
  branch: string,
  logPrefix: string
): Promise<Result<FetchPermissionsResult>> {
  const githubConfig = await getGitHubConfig();

  if (!githubConfig.token) {
    console.log(`[${logPrefix}] No GitHub token configured, skipping permission check`);
    return {
      success: true,
      data: {
        provider: 'github',
        missingConfig: true,
        error: 'No GitHub token configured. Configure credentials in Git Source Config.',
      },
    };
  }

  const ownerRepo = extractGitHubOwnerRepo(repoUrl as GitUrl);
  if (!ownerRepo) {
    return {
      success: false,
      error: new Error('Could not extract GitHub owner/repo from repository URL'),
    };
  }

  const permResult = await getGitHubRepositoryPermissions(
    ownerRepo.owner,
    ownerRepo.repo,
    branch,
    githubConfig.token
  );

  if (permResult.success) {
    console.log(`[${logPrefix}] GitHub permissions fetched:`, {
      accessLevel: permResult.data.accessLevelName,
      targetBranchProtected: permResult.data.targetBranchProtected,
      canPushToProtected: permResult.data.canPushToProtected,
    });
    return {
      success: true,
      data: {
        provider: 'github',
        permissions: permResult.data,
      },
    };
  }

  console.warn(`[${logPrefix}] Could not check GitHub permissions:`, permResult.error?.message);
  return {
    success: false,
    error: permResult.error || new Error('Failed to check GitHub permissions'),
  };
}
