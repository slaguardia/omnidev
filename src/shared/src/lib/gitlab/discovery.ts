'use server';

/**
 * GitLab repository discovery
 */

import { Gitlab } from '@gitbeaker/rest';
import type { Result, DiscoveredRepository } from '@/lib/types/index';
import { getGitLabConfig } from '@/lib/gitlab/config';

/**
 * Safely read a property from a Gitbeaker project object.
 * Gitbeaker may return camelCase or snake_case depending on pagination path.
 */
function prop(obj: Record<string, unknown>, camel: string, snake: string): unknown {
  return obj[camel] !== undefined ? obj[camel] : obj[snake];
}

/**
 * Discover all GitLab repositories accessible to the authenticated user
 */
export async function discoverGitLabRepositories(
  baseUrl?: string,
  token?: string
): Promise<Result<DiscoveredRepository[]>> {
  try {
    // Fall back to saved config if no args provided
    let resolvedBaseUrl = baseUrl;
    let resolvedToken = token;

    if (!resolvedToken) {
      const config = await getGitLabConfig();
      resolvedBaseUrl = resolvedBaseUrl || config.baseUrl;
      resolvedToken = config.token || undefined;
    }

    if (!resolvedToken) {
      return {
        success: false,
        error: new Error('GitLab token is required for repository discovery'),
      };
    }

    const gitlab = new Gitlab({
      host: resolvedBaseUrl || 'https://gitlab.com',
      token: resolvedToken,
    });

    // Gitbeaker's .all() auto-paginates
    const projects = await gitlab.Projects.all({
      membership: true,
      perPage: 100,
    });

    const repositories: DiscoveredRepository[] = [];
    for (const raw of projects) {
      const p = raw as unknown as Record<string, unknown>;
      const fullPath = String(
        prop(p, 'pathWithNamespace', 'path_with_namespace') || prop(p, 'path', 'path') || ''
      );

      if (!fullPath) continue;

      const httpUrl = String(prop(p, 'httpUrlToRepo', 'http_url_to_repo') || '');
      const sshUrl = prop(p, 'sshUrlToRepo', 'ssh_url_to_repo');
      const defaultBranch = String(prop(p, 'defaultBranch', 'default_branch') || 'main');
      const lastActivity = prop(p, 'lastActivityAt', 'last_activity_at');
      const starCount = prop(p, 'starCount', 'star_count');
      const forksCount = prop(p, 'forksCount', 'forks_count');

      repositories.push({
        id: `gitlab:${fullPath}`,
        provider: 'gitlab',
        name: String(p.name || ''),
        fullPath,
        description: (prop(p, 'description', 'description') as string) || null,
        httpUrl,
        sshUrl: sshUrl ? String(sshUrl) : null,
        defaultBranch,
        visibility: String(prop(p, 'visibility', 'visibility') || 'private') as
          | 'public'
          | 'private'
          | 'internal',
        lastActivityAt: lastActivity
          ? new Date(String(lastActivity)).toISOString()
          : new Date().toISOString(),
        topics: (prop(p, 'topics', 'topics') as string[]) || [],
        language: null,
        starCount: Number(starCount) || 0,
        forksCount: Number(forksCount) || 0,
        archived: Boolean(prop(p, 'archived', 'archived')),
      });
    }

    console.log(`[GITLAB DISCOVERY] Discovered ${repositories.length} repositories`);
    return { success: true, data: repositories };
  } catch (error) {
    console.error('[GITLAB DISCOVERY] Failed to discover repositories:', error);
    return {
      success: false,
      error: new Error(
        `GitLab discovery failed: ${error instanceof Error ? error.message : String(error)}`
      ),
    };
  }
}
