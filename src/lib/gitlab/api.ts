/**
 * GitLab API utilities using gitbeaker
 */

import { Gitlab } from '@gitbeaker/rest';
import type { AsyncResult, GitUrl, WorkspacePermissions } from '@/lib/types/index';

/**
 * Extract project ID from GitLab repository URL
 */
export function extractProjectIdFromUrl(repoUrl: GitUrl): string | null {
  try {
    // Handle different GitLab URL formats
    // https://gitlab.com/username/project.git
    // git@gitlab.com:username/project.git
    // https://gitlab.example.com/group/subgroup/project

    let cleanUrl = repoUrl.replace(/\.git$/, '');

    if (cleanUrl.startsWith('git@')) {
      // SSH format: git@gitlab.com:username/project
      cleanUrl = cleanUrl.replace(/^git@([^:]+):/, 'https://$1/');
    }

    const url = new URL(cleanUrl);
    const pathParts = url.pathname.split('/').filter(Boolean);

    if (pathParts.length >= 2) {
      // For GitLab, project path is usually namespace/project
      return pathParts.join('/');
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Get project information using gitbeaker
 */
export async function getProject(
  projectId: string,
  baseUrl: string,
  token: string
): Promise<AsyncResult<unknown>> {
  try {
    const gitlab = new Gitlab({
      host: baseUrl,
      token: token,
    });
    const project = await gitlab.Projects.show(projectId);

    return { success: true, data: project };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to get project: ${error}`),
    };
  }
}

/**
 * Get project branches using gitbeaker
 */
export async function getProjectBranches(
  projectId: string,
  baseUrl: string,
  token: string
): Promise<AsyncResult<unknown[]>> {
  try {
    const gitlab = new Gitlab({
      host: baseUrl,
      token: token,
    });
    const branches = await gitlab.Branches.all(projectId);

    return { success: true, data: branches };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to get project branches: ${error}`),
    };
  }
}

/**
 * Get project merge requests using gitbeaker
 */
export async function getProjectMergeRequests(
  projectId: string,
  baseUrl: string,
  token: string,
  options?: { state?: 'opened' | 'closed' | 'merged' | 'locked' }
): Promise<AsyncResult<unknown[]>> {
  try {
    const gitlab = new Gitlab({
      host: baseUrl,
      token: token,
    });
    const mergeRequests = await gitlab.MergeRequests.all({
      projectId,
      state: options?.state || 'opened',
    });

    return { success: true, data: mergeRequests };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to get project merge requests: ${error}`),
    };
  }
}

/**
 * GitLab access levels
 * @see https://docs.gitlab.com/ee/api/access_requests.html
 */
export const GitLabAccessLevel = {
  NO_ACCESS: 0,
  MINIMAL_ACCESS: 5,
  GUEST: 10,
  REPORTER: 20,
  DEVELOPER: 30,
  MAINTAINER: 40,
  OWNER: 50,
} as const;

export interface BranchPushPermissionResult {
  canPush: boolean;
  isProtected: boolean;
  reason: string;
  userAccessLevel?: number;
  requiredAccessLevel?: number;
}

/**
 * Check if the current user can push directly to a branch
 * This checks branch protection rules and user's access level
 */
export async function canPushToBranch(
  projectId: string,
  branchName: string,
  baseUrl: string,
  token: string
): Promise<AsyncResult<BranchPushPermissionResult>> {
  try {
    const gitlab = new Gitlab({
      host: baseUrl,
      token: token,
    });

    // Get branch info to check if it's protected
    let isProtected = false;
    try {
      const branch = await gitlab.Branches.show(projectId, branchName);
      isProtected = (branch as { protected?: boolean }).protected === true;
    } catch (error) {
      // Branch might not exist yet, which is fine for new branches
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('404') || errorMessage.includes('not found')) {
        return {
          success: true,
          data: {
            canPush: true,
            isProtected: false,
            reason: 'Branch does not exist yet, will be created on push',
          },
        };
      }
      throw error;
    }

    // If not protected, user can push
    if (!isProtected) {
      return {
        success: true,
        data: {
          canPush: true,
          isProtected: false,
          reason: 'Branch is not protected',
        },
      };
    }

    // Branch is protected - check if user has permission
    // First get current user's access level in the project
    let userAccessLevel: number = GitLabAccessLevel.NO_ACCESS;
    try {
      // Get current user
      const currentUser = await gitlab.Users.showCurrentUser();
      const userId = (currentUser as { id: number }).id;

      // Get user's membership in the project
      try {
        const member = await gitlab.ProjectMembers.show(projectId, userId, {
          includeInherited: true,
        });
        userAccessLevel = (member as { access_level: number }).access_level;
      } catch {
        // User might not be a direct member but could have access through group
        // Try to get effective access level from project
        const project = await gitlab.Projects.show(projectId);
        const permissions = (project as unknown as { permissions?: { project_access?: { access_level: number } | null; group_access?: { access_level: number } | null } }).permissions;
        if (permissions?.project_access?.access_level) {
          userAccessLevel = permissions.project_access.access_level;
        } else if (permissions?.group_access?.access_level) {
          userAccessLevel = permissions.group_access.access_level;
        }
      }
    } catch (error) {
      console.warn('[GITLAB] Could not determine user access level:', error);
      // If we can't determine access level, assume no push access to protected branch
      return {
        success: true,
        data: {
          canPush: false,
          isProtected: true,
          reason: 'Could not determine user access level for protected branch',
        },
      };
    }

    // Get protected branch rules to check required access level for push
    let requiredAccessLevel: number = GitLabAccessLevel.MAINTAINER; // Default to maintainer if we can't determine
    try {
      const protectedBranch = await gitlab.ProtectedBranches.show(projectId, branchName);
      const pushAccessLevels = (protectedBranch as { push_access_levels?: Array<{ access_level: number }> }).push_access_levels;

      if (pushAccessLevels && pushAccessLevels.length > 0) {
        // Find the minimum required access level
        // Note: access_level of 0 means "No one" can push
        const levels = pushAccessLevels
          .map((l) => l.access_level)
          .filter((l) => l > 0);

        if (levels.length === 0) {
          // No one can push directly
          return {
            success: true,
            data: {
              canPush: false,
              isProtected: true,
              reason: 'Branch protection rules prevent any direct pushes',
              userAccessLevel,
              requiredAccessLevel: 0,
            },
          };
        }

        requiredAccessLevel = Math.min(...levels);
      }
    } catch (error) {
      console.warn('[GITLAB] Could not get protected branch rules:', error);
      // Continue with default required level
    }

    const canPush = userAccessLevel >= requiredAccessLevel;

    return {
      success: true,
      data: {
        canPush,
        isProtected: true,
        reason: canPush
          ? `User has sufficient access level (${userAccessLevel} >= ${requiredAccessLevel})`
          : `User access level (${userAccessLevel}) is below required level (${requiredAccessLevel}) for protected branch`,
        userAccessLevel,
        requiredAccessLevel,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to check branch push permission: ${error}`),
    };
  }
}

/**
 * Map GitLab access level to human-readable name
 */
function getAccessLevelName(level: number): string {
  if (level >= GitLabAccessLevel.OWNER) return 'Owner';
  if (level >= GitLabAccessLevel.MAINTAINER) return 'Maintainer';
  if (level >= GitLabAccessLevel.DEVELOPER) return 'Developer';
  if (level >= GitLabAccessLevel.REPORTER) return 'Reporter';
  if (level >= GitLabAccessLevel.GUEST) return 'Guest';
  if (level >= GitLabAccessLevel.MINIMAL_ACCESS) return 'Minimal Access';
  return 'No Access';
}

/**
 * Get repository permissions for caching at workspace creation time
 * This checks user's access level and branch protection status
 */
export async function getRepositoryPermissions(
  projectId: string,
  branchName: string,
  baseUrl: string,
  token: string
): Promise<AsyncResult<WorkspacePermissions>> {
  try {
    const gitlab = new Gitlab({
      host: baseUrl,
      token: token,
    });

    // Get current user info
    let authenticatedUser = 'unknown';
    let userAccessLevel: number = GitLabAccessLevel.NO_ACCESS;

    try {
      const currentUser = await gitlab.Users.showCurrentUser();
      authenticatedUser = (currentUser as { username: string }).username;
      const userId = (currentUser as { id: number }).id;

      // Get user's membership in the project
      try {
        const member = await gitlab.ProjectMembers.show(projectId, userId, {
          includeInherited: true,
        });
        userAccessLevel = (member as { access_level: number }).access_level;
      } catch {
        // User might not be a direct member but could have access through group
        const project = await gitlab.Projects.show(projectId);
        const permissions = (
          project as unknown as {
            permissions?: {
              project_access?: { access_level: number } | null;
              group_access?: { access_level: number } | null;
            };
          }
        ).permissions;
        if (permissions?.project_access?.access_level) {
          userAccessLevel = permissions.project_access.access_level;
        } else if (permissions?.group_access?.access_level) {
          userAccessLevel = permissions.group_access.access_level;
        }
      }
    } catch (error) {
      console.warn('[GITLAB] Could not get current user info:', error);
    }

    // Check if the target branch is protected
    let targetBranchProtected = false;
    let requiredAccessLevel: number = GitLabAccessLevel.MAINTAINER;

    try {
      const branch = await gitlab.Branches.show(projectId, branchName);
      targetBranchProtected = (branch as { protected?: boolean }).protected === true;

      if (targetBranchProtected) {
        // Get protected branch rules
        try {
          const protectedBranch = await gitlab.ProtectedBranches.show(projectId, branchName);
          const pushAccessLevels = (
            protectedBranch as { push_access_levels?: Array<{ access_level: number }> }
          ).push_access_levels;

          if (pushAccessLevels && pushAccessLevels.length > 0) {
            const levels = pushAccessLevels.map((l) => l.access_level).filter((l) => l > 0);
            if (levels.length > 0) {
              requiredAccessLevel = Math.min(...levels);
            } else {
              // No one can push - set to impossible level
              requiredAccessLevel = 999;
            }
          }
        } catch {
          // Can't get protection rules, use default
        }
      }
    } catch {
      // Branch might not exist yet
      targetBranchProtected = false;
    }

    // Determine if user can push to protected branches
    const canPushToProtected = userAccessLevel >= requiredAccessLevel;

    // Generate warning message if applicable
    let warning: string | undefined;
    if (targetBranchProtected && !canPushToProtected) {
      warning = `Branch '${branchName}' is protected. Your ${getAccessLevelName(userAccessLevel)} access cannot push directly. Use createMR=true to create merge requests.`;
    }

    const permissions: WorkspacePermissions = {
      provider: 'gitlab',
      accessLevel: userAccessLevel,
      accessLevelName: getAccessLevelName(userAccessLevel),
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
