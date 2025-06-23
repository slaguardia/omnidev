/**
 * GitLab API client for merge request operations
 */

import type { 
  GitLabMergeRequest, 
  CreateMergeRequestOptions, 
  AsyncResult,
  GitUrl 
} from '@/lib/types/index';
import type { GitLabAPIConfig } from '@/lib/gitlab/types';

/**
 * GitLab API client for merge request operations
 */
export class GitLabAPI {
  private baseUrl: string;
  private token: string;

  constructor(config: GitLabAPIConfig) {
    this.baseUrl = config.baseUrl.endsWith('/') ? config.baseUrl.slice(0, -1) : config.baseUrl;
    this.token = config.token;
  }

  /**
   * Extract project ID from GitLab repository URL
   */
  static extractProjectIdFromUrl(repoUrl: GitUrl): string | null {
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
   * Get project information
   */
  async getProject(projectId: string): Promise<AsyncResult<any>> {
    try {
      const url = `${this.baseUrl}/api/v4/projects/${encodeURIComponent(projectId)}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'PRIVATE-TOKEN': this.token
        }
      });

      if (!response.ok) {
        return {
          success: false,
          error: new Error(`Failed to get project: ${response.status} ${response.statusText}`)
        };
      }

      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      return {
        success: false,
        error: new Error(`Failed to get project: ${error}`)
      };
    }
  }
} 