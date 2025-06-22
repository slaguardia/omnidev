/**
 * GitLab API utilities for merge request operations
 */

import type { 
  GitLabMergeRequest, 
  CreateMergeRequestOptions, 
  AsyncResult,
  GitUrl 
} from '@/types/index';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

export interface GitLabAPIConfig {
  baseUrl: string;
  token: string;
}

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
   * Create a merge request
   */
  async createMergeRequest(options: CreateMergeRequestOptions): Promise<AsyncResult<GitLabMergeRequest>> {
    try {
      const url = `${this.baseUrl}/api/v4/projects/${encodeURIComponent(options.projectId)}/merge_requests`;
      
      const payload = {
        source_branch: options.sourceBranch,
        target_branch: options.targetBranch,
        title: options.title,
        description: options.description,
        ...(options.assigneeId && { assignee_id: options.assigneeId }),
        ...(options.labels && { labels: options.labels.join(',') }),
        should_remove_source_branch: options.removeSourceBranch ?? true,
        ...(options.squash !== undefined && { squash: options.squash })
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'PRIVATE-TOKEN': this.token,
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
      
      const mergeRequest: GitLabMergeRequest = {
        id: data.id,
        iid: data.iid,
        title: data.title,
        description: data.description,
        state: data.state,
        sourceBranch: data.source_branch,
        targetBranch: data.target_branch,
        webUrl: data.web_url,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at),
        author: {
          id: data.author.id,
          name: data.author.name,
          username: data.author.username
        }
      };

      return { success: true, data: mergeRequest };
    } catch (error) {
      return {
        success: false,
        error: new Error(`Failed to create merge request: ${error}`)
      };
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

/**
 * Load configuration from saved config file
 */
async function loadSavedConfig(): Promise<{ GITLAB_URL?: string; GITLAB_TOKEN?: string } | null> {
  try {
    const CONFIG_FILE = join(process.cwd(), '.config', 'environment.json');
    
    if (!existsSync(CONFIG_FILE)) {
      return null;
    }
    
    const fileContent = await readFile(CONFIG_FILE, 'utf-8');
    const config = JSON.parse(fileContent);
    
    return {
      GITLAB_URL: config.GITLAB_URL,
      GITLAB_TOKEN: config.GITLAB_TOKEN
    };
  } catch (error) {
    console.warn('Failed to load saved configuration:', error);
    return null;
  }
}

/**
 * Create GitLab API instance from saved config file only
 */
export async function createGitLabAPI(): Promise<GitLabAPI | null> {
  // Load from saved configuration only
  const savedConfig = await loadSavedConfig();
  
  if (!savedConfig) {
    console.warn('No saved GitLab configuration found. Please configure GitLab settings in the UI.');
    return null;
  }

  const baseUrl = savedConfig.GITLAB_URL || 'https://gitlab.com';
  const token = savedConfig.GITLAB_TOKEN;

  if (!token) {
    console.warn('GitLab token not found in saved configuration. Please set it in the settings.');
    return null;
  }

  return new GitLabAPI({ baseUrl, token });
}