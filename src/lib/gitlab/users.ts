/**
 * GitLab User Management API utilities using gitbeaker
 */

import { Gitlab } from '@gitbeaker/rest';
import type { AsyncResult } from '@/lib/types/index';

/**
 * Add a user to a project with specified access level
 */
export async function addUserToProject(
  userId: number,
  projectId: string | number,
  accessLevel: number,
  baseUrl: string,
  token: string
): Promise<AsyncResult<void>> {
  try {
    const gitlab = new Gitlab({
      host: baseUrl,
      token: token,
    });

    await gitlab.ProjectMembers.add(projectId, userId, accessLevel);
    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to add user to project: ${error}`),
    };
  }
}

/**
 * Add a user to a group with specified access level
 */
export async function addUserToGroup(
  userId: number,
  groupId: string | number,
  accessLevel: number,
  baseUrl: string,
  token: string
): Promise<AsyncResult<void>> {
  try {
    const gitlab = new Gitlab({
      host: baseUrl,
      token: token,
    });

    await gitlab.GroupMembers.add(groupId, userId, accessLevel);
    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to add user to group: ${error}`),
    };
  }
}

/**
 * GitLab access level constants
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
