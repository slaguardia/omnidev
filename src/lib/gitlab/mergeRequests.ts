/**
 * Merge request automation and creation
 */

import { GitLabAPI } from '@/lib/gitlab/api';
import { formatMergeRequestDescription } from '@/lib/gitlab/utils';
import type { 
  CreateMergeRequestOptions,
  GitLabMergeRequest,
  AsyncResult,
  GitUrl,
  WorkspaceId,
  FilePath
} from '@/lib/types/index';
import type { MergeRequestContext, AutoMergeRequestOptions } from '@/lib/gitlab/types';

interface MergeRequestParams extends CreateMergeRequestOptions {
  baseUrl?: string;
  token?: string;
  // Auto mode specific fields
  repoUrl?: GitUrl;
  workspaceId?: WorkspaceId;
  workspacePath?: FilePath;
  modifiedFiles?: string[];
  originalQuestion?: string;
  claudeResponse?: string;
}

/**
 * Create a merge request
 * @param options - Merge request options
 * @param auto - Whether to use automatic mode (DEPRECATED - auto summary generation removed)
 */
export async function createMergeRequest(
  options: MergeRequestParams & (AutoMergeRequestOptions | {}),
  auto: boolean = false
): Promise<AsyncResult<GitLabMergeRequest>> {
  try {
    let finalOptions: CreateMergeRequestOptions;
    let baseUrl: string;
    let token: string;

    // Get configuration
    if (options.baseUrl && options.token) {
      baseUrl = options.baseUrl;
      token = options.token;
    } else {
      const { getEnvironmentConfig } = await import('@/lib/workspace/environmentConfig');
      const envConfig = await getEnvironmentConfig();
      baseUrl = envConfig.GITLAB_URL;
      token = envConfig.GITLAB_TOKEN;
    }

    if (auto) {
      // Auto mode deprecated - require manual title and description
      console.warn('Auto mode for merge request creation is deprecated. Please provide title and description manually.');
      
      if (!options.title || !options.description) {
        return {
          success: false,
          error: new Error('Auto mode is deprecated. Please provide title and description manually.')
        };
      }

      if (!options.repoUrl) {
        return {
          success: false,
          error: new Error('repoUrl is required for merge request creation')
        };
      }

      // Extract project ID from repo URL
      const projectId = GitLabAPI.extractProjectIdFromUrl(options.repoUrl);
      if (!projectId) {
        return {
          success: false,
          error: new Error(`Failed to extract project ID from repository URL: ${options.repoUrl}`)
        };
      }

      // Create final options with provided content
      finalOptions = {
        projectId,
        title: options.title,
        description: options.description,
        sourceBranch: options.sourceBranch,
        targetBranch: options.targetBranch,
        labels: options.labels || [],
        ...(options.assigneeId !== undefined && { assigneeId: options.assigneeId }),
        removeSourceBranch: options.removeSourceBranch ?? true,
        ...(options.squash !== undefined && { squash: options.squash })
      };
    } else {
      // Manual mode - use provided options directly
      const { baseUrl: _, token: __, repoUrl: ___, workspaceId: ____, workspacePath: _____, modifiedFiles: ______, originalQuestion: _______, claudeResponse: ________, ...directOptions } = options;
      finalOptions = directOptions;
    }

    // Validate configuration
    if (!baseUrl || !token) {
      return {
        success: false,
        error: new Error('GitLab API not configured. Please check GitLab configuration in settings.')
      };
    }

    // Make API request to create merge request
    const apiUrl = `${baseUrl}/api/v4/projects/${encodeURIComponent(finalOptions.projectId)}/merge_requests`;
    
    const payload = {
      source_branch: finalOptions.sourceBranch,
      target_branch: finalOptions.targetBranch,
      title: finalOptions.title,
      description: finalOptions.description,
      ...(finalOptions.assigneeId && { assignee_id: finalOptions.assigneeId }),
      ...(finalOptions.labels && { labels: finalOptions.labels.join(',') }),
      should_remove_source_branch: finalOptions.removeSourceBranch ?? true,
      ...(finalOptions.squash !== undefined && { squash: finalOptions.squash })
    };

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'PRIVATE-TOKEN': token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: new Error(`GitLab API error: ${response.status} ${response.statusText}. ${JSON.stringify(errorData)}`)
      };
    }

    const data = await response.json();
    return { success: true, data };

  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to create merge request: ${error}`)
    };
  }
}