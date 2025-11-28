/**
 * Merge request automation and creation
 */
import { Gitlab } from '@gitbeaker/rest';
import type { GitLabMergeRequest, AsyncResult } from '@/lib/types/index';

interface CreateMergeRequestParams {
  projectId: string | number;
  title: string;
  description: string;
  sourceBranch: string;
  targetBranch: string;
  assigneeId?: number;
  labels?: string[];
  removeSourceBranch?: boolean;
  squash?: boolean;
  // Optional GitLab configuration - if not provided, will load from environment
  baseUrl?: string;
  token?: string;
}

/**
 * Create a merge request using gitbeaker
 */
export async function createMergeRequest(
  params: CreateMergeRequestParams
): Promise<AsyncResult<GitLabMergeRequest>> {
  try {
    let baseUrl: string;
    let token: string;

    // Get configuration
    if (params.baseUrl && params.token) {
      baseUrl = params.baseUrl;
      token = params.token;
    } else {
      const { getConfig } = await import('@/lib/config/server-actions');
      const config = await getConfig();
      baseUrl = config.gitlab.url;
      token = config.gitlab.token;
    }

    // Validate configuration
    if (!baseUrl || !token) {
      return {
        success: false,
        error: new Error(
          'GitLab API not configured. Please check GitLab configuration in settings.'
        ),
      };
    }

    // Initialize GitBeaker client
    const gitlab = new Gitlab({
      host: baseUrl,
      token: token,
    });

    // Create merge request using gitbeaker
    const mergeRequest = await gitlab.MergeRequests.create(
      params.projectId,
      params.sourceBranch,
      params.targetBranch,
      params.title,
      {
        description: params.description,
        ...(params.assigneeId && { assigneeId: params.assigneeId }),
        ...(params.labels && params.labels.length > 0 && { labels: params.labels }),
        removeSourceBranch: params.removeSourceBranch ?? true,
        ...(params.squash !== undefined && { squash: params.squash }),
      }
    );

    // Transform gitbeaker response to match our GitLabMergeRequest interface
    const transformedData: GitLabMergeRequest = {
      id: mergeRequest.id,
      iid: mergeRequest.iid,
      title: mergeRequest.title,
      description: mergeRequest.description || '',
      state: mergeRequest.state as 'opened' | 'closed' | 'merged',
      sourceBranch: mergeRequest.source_branch,
      targetBranch: mergeRequest.target_branch,
      webUrl: mergeRequest.web_url,
      createdAt: new Date(mergeRequest.created_at),
      updatedAt: new Date(mergeRequest.updated_at),
      author: {
        id: mergeRequest.author.id,
        name: mergeRequest.author.name,
        username: mergeRequest.author.username,
      },
    };

    return { success: true, data: transformedData };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to create merge request: ${error}`),
    };
  }
}
