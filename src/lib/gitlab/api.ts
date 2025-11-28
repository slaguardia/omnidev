/**
 * GitLab API utilities using gitbeaker
 */

import { Gitlab } from '@gitbeaker/rest';
import type { AsyncResult, GitUrl } from '@/lib/types/index';

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
