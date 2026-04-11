'use server';

/**
 * GitHub repository discovery
 */

import { Octokit } from '@octokit/rest';
import type { Result, DiscoveredRepository } from '@/lib/types/index';
import { getGitHubConfig } from '@/lib/github/config';

/**
 * Discover all GitHub repositories accessible to the authenticated user
 */
export async function discoverGitHubRepositories(
  token?: string
): Promise<Result<DiscoveredRepository[]>> {
  try {
    let resolvedToken = token;

    if (!resolvedToken) {
      const config = await getGitHubConfig();
      resolvedToken = config.token || undefined;
    }

    if (!resolvedToken) {
      return {
        success: false,
        error: new Error('GitHub token is required for repository discovery'),
      };
    }

    const octokit = new Octokit({ auth: resolvedToken });

    const repos = await octokit.paginate(octokit.repos.listForAuthenticatedUser, {
      per_page: 100,
      sort: 'updated',
    });

    const repositories: DiscoveredRepository[] = repos.map((repo) => ({
      id: `github:${repo.full_name}`,
      provider: 'github' as const,
      name: repo.name,
      fullPath: repo.full_name,
      description: repo.description || null,
      httpUrl: repo.clone_url || repo.html_url,
      sshUrl: repo.ssh_url || null,
      defaultBranch: repo.default_branch || 'main',
      visibility: repo.private ? ('private' as const) : ('public' as const),
      lastActivityAt: repo.updated_at || new Date().toISOString(),
      topics: repo.topics || [],
      language: repo.language || null,
      starCount: repo.stargazers_count ?? 0,
      forksCount: repo.forks_count ?? 0,
      archived: repo.archived ?? false,
    }));

    console.log(`[GITHUB DISCOVERY] Discovered ${repositories.length} repositories`);
    return { success: true, data: repositories };
  } catch (error) {
    console.error('[GITHUB DISCOVERY] Failed to discover repositories:', error);
    return {
      success: false,
      error: new Error(
        `GitHub discovery failed: ${error instanceof Error ? error.message : String(error)}`
      ),
    };
  }
}
