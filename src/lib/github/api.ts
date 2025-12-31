/**
 * GitHub API utilities
 */

import { Octokit } from '@octokit/rest';
import type { AsyncResult, GitUrl, WorkspacePermissions } from '@/lib/types/index';

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

export interface GitHubBranchPushPermissionResult {
  canPush: boolean;
  isProtected: boolean;
  reason: string;
  userPermission?: string;
}

/**
 * Check if the current user can push directly to a branch
 * This checks branch protection rules and user's repository permissions
 */
export async function canPushToBranch(
  owner: string,
  repo: string,
  branchName: string,
  token: string
): Promise<AsyncResult<GitHubBranchPushPermissionResult>> {
  try {
    const octokit = new Octokit({ auth: token });

    // First check user's permission on the repository
    let userPermission = 'none';
    try {
      const { data: repoData } = await octokit.repos.get({ owner, repo });
      // permissions object contains admin, push, pull booleans
      const permissions = repoData.permissions;
      if (permissions?.admin) {
        userPermission = 'admin';
      } else if (permissions?.push) {
        userPermission = 'push';
      } else if (permissions?.pull) {
        userPermission = 'pull';
      }
    } catch (error) {
      console.warn('[GITHUB] Could not determine user permissions:', error);
      return {
        success: true,
        data: {
          canPush: false,
          isProtected: false,
          reason: 'Could not determine user repository permissions',
          userPermission: 'unknown',
        },
      };
    }

    // If user doesn't have push permission at all, they can't push
    if (userPermission !== 'admin' && userPermission !== 'push') {
      return {
        success: true,
        data: {
          canPush: false,
          isProtected: false,
          reason: `User only has '${userPermission}' permission on repository, need 'push' or 'admin'`,
          userPermission,
        },
      };
    }

    // Check if branch exists and if it's protected
    let isProtected = false;
    try {
      const { data: branchData } = await octokit.repos.getBranch({
        owner,
        repo,
        branch: branchName,
      });
      isProtected = branchData.protected === true;
    } catch (error) {
      // Branch might not exist yet
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('404') || errorMessage.includes('Not Found')) {
        return {
          success: true,
          data: {
            canPush: true,
            isProtected: false,
            reason: 'Branch does not exist yet, will be created on push',
            userPermission,
          },
        };
      }
      throw error;
    }

    // If not protected, user with push access can push
    if (!isProtected) {
      return {
        success: true,
        data: {
          canPush: true,
          isProtected: false,
          reason: 'Branch is not protected and user has push access',
          userPermission,
        },
      };
    }

    // Branch is protected - check specific protection rules
    // Admins can usually bypass protection rules
    if (userPermission === 'admin') {
      return {
        success: true,
        data: {
          canPush: true,
          isProtected: true,
          reason: 'User has admin access and can bypass branch protection',
          userPermission,
        },
      };
    }

    // For non-admin users, check if push is restricted
    try {
      const { data: protection } = await octokit.repos.getBranchProtection({
        owner,
        repo,
        branch: branchName,
      });

      // Check for restrictions on who can push
      const restrictions = protection.restrictions;
      if (restrictions) {
        // Push is restricted to specific users/teams
        // We'd need to check if current user is in the allowed list
        // For simplicity, assume they can't push if restrictions exist
        return {
          success: true,
          data: {
            canPush: false,
            isProtected: true,
            reason: 'Branch has push restrictions to specific users/teams',
            userPermission,
          },
        };
      }

      // Check for required pull request reviews
      const requiredPullRequestReviews = protection.required_pull_request_reviews;
      if (requiredPullRequestReviews) {
        return {
          success: true,
          data: {
            canPush: false,
            isProtected: true,
            reason: 'Branch requires pull request reviews before merging',
            userPermission,
          },
        };
      }

      // If we get here, protected but no specific restrictions blocking push
      return {
        success: true,
        data: {
          canPush: true,
          isProtected: true,
          reason: 'Branch is protected but user has push access',
          userPermission,
        },
      };
    } catch (error) {
      // Might not have permission to view protection rules
      // Assume we can't push to be safe
      console.warn('[GITHUB] Could not get branch protection rules:', error);
      return {
        success: true,
        data: {
          canPush: false,
          isProtected: true,
          reason: 'Could not determine branch protection rules, assuming no push access',
          userPermission,
        },
      };
    }
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to check branch push permission: ${error}`),
    };
  }
}

/**
 * GitHub access levels (numeric for comparison)
 */
export const GitHubAccessLevel = {
  NONE: 0,
  PULL: 1,
  PUSH: 2,
  ADMIN: 3,
} as const;

/**
 * Map GitHub permission to numeric access level
 */
function getAccessLevelFromPermission(permission: string): number {
  switch (permission) {
    case 'admin':
      return GitHubAccessLevel.ADMIN;
    case 'push':
    case 'write':
      return GitHubAccessLevel.PUSH;
    case 'pull':
    case 'read':
      return GitHubAccessLevel.PULL;
    default:
      return GitHubAccessLevel.NONE;
  }
}

/**
 * Map GitHub permission to human-readable name
 */
function getAccessLevelName(permission: string): string {
  switch (permission) {
    case 'admin':
      return 'Admin';
    case 'push':
    case 'write':
      return 'Write';
    case 'pull':
    case 'read':
      return 'Read';
    default:
      return 'None';
  }
}

/**
 * Get repository permissions for caching at workspace creation time
 * This checks user's permission level and branch protection status
 */
export async function getRepositoryPermissions(
  owner: string,
  repo: string,
  branchName: string,
  token: string
): Promise<AsyncResult<WorkspacePermissions>> {
  try {
    const octokit = new Octokit({ auth: token });

    // Get current user and repository permissions
    let authenticatedUser = 'unknown';
    let userPermission = 'none';

    try {
      // Get authenticated user
      const { data: user } = await octokit.users.getAuthenticated();
      authenticatedUser = user.login;

      // Get repository with permissions
      const { data: repoData } = await octokit.repos.get({ owner, repo });
      const permissions = repoData.permissions;
      if (permissions?.admin) {
        userPermission = 'admin';
      } else if (permissions?.push) {
        userPermission = 'push';
      } else if (permissions?.pull) {
        userPermission = 'pull';
      }
    } catch (error) {
      console.warn('[GITHUB] Could not get user/repo info:', error);
    }

    // Check if the target branch is protected
    let targetBranchProtected = false;
    let canPushToProtected = userPermission === 'admin' || userPermission === 'push';

    try {
      const { data: branchData } = await octokit.repos.getBranch({
        owner,
        repo,
        branch: branchName,
      });
      targetBranchProtected = branchData.protected === true;

      if (targetBranchProtected) {
        // Admins can bypass protection
        if (userPermission === 'admin') {
          canPushToProtected = true;
        } else if (userPermission === 'push') {
          // Check specific protection rules
          try {
            const { data: protection } = await octokit.repos.getBranchProtection({
              owner,
              repo,
              branch: branchName,
            });

            // If there are restrictions or required reviews, user can't push directly
            if (protection.restrictions || protection.required_pull_request_reviews) {
              canPushToProtected = false;
            }
          } catch {
            // Can't view protection rules, assume no push
            canPushToProtected = false;
          }
        } else {
          canPushToProtected = false;
        }
      }
    } catch {
      // Branch might not exist yet
      targetBranchProtected = false;
    }

    // Generate warning message if applicable
    let warning: string | undefined;
    if (targetBranchProtected && !canPushToProtected) {
      warning = `Branch '${branchName}' is protected. Your ${getAccessLevelName(userPermission)} access cannot push directly. Use createMR=true to create pull requests.`;
    }

    const permissions: WorkspacePermissions = {
      provider: 'github',
      accessLevel: getAccessLevelFromPermission(userPermission),
      accessLevelName: getAccessLevelName(userPermission),
      canPushToProtected,
      targetBranchProtected,
      authenticatedUser,
      checkedAt: new Date().toISOString(),
      ...(warning && { warning }),
    };

    return { success: true, data: permissions };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to get repository permissions: ${error}`),
    };
  }
}
