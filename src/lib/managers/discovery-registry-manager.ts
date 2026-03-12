'use server';

/**
 * Discovery Registry Manager
 * Manages the persisted registry of discovered repositories from GitHub and GitLab.
 */

import { readFile, writeFile, access, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { getDataDir } from '@/lib/config/server-actions';
import { getAllWorkspaces } from '@/lib/managers/workspace-manager';
import type {
  Result,
  DiscoveredRepository,
  DiscoveredRepoRegistry,
  DiscoveryResult,
  GitProvider,
  WorkspaceId,
} from '@/lib/types/index';

const REGISTRY_FILENAME = '.discovery-registry.json';

const EMPTY_REGISTRY: DiscoveredRepoRegistry = {
  version: '1.0.0',
  lastDiscoveredAt: {},
  repositories: [],
};

/**
 * Get the path to the discovery registry file
 */
async function getRegistryPath(): Promise<string> {
  const dataDir = await getDataDir();
  return join(dataDir, REGISTRY_FILENAME);
}

/**
 * Load registry from disk or return empty default
 */
export async function loadRegistry(): Promise<Result<DiscoveredRepoRegistry>> {
  try {
    const registryPath = await getRegistryPath();

    try {
      await access(registryPath);
    } catch {
      return { success: true, data: { ...EMPTY_REGISTRY, repositories: [] } };
    }

    const data = await readFile(registryPath, 'utf-8');
    const registry = JSON.parse(data) as DiscoveredRepoRegistry;
    return { success: true, data: registry };
  } catch (error) {
    console.error('[DISCOVERY REGISTRY] Failed to load registry:', error);
    return {
      success: false,
      error: new Error(`Failed to load discovery registry: ${error}`),
    };
  }
}

/**
 * Save registry to disk
 */
export async function saveRegistry(registry: DiscoveredRepoRegistry): Promise<Result<void>> {
  try {
    const registryPath = await getRegistryPath();
    const dir = dirname(registryPath);
    await mkdir(dir, { recursive: true });
    await writeFile(registryPath, JSON.stringify(registry, null, 2), 'utf-8');
    return { success: true, data: undefined };
  } catch (error) {
    console.error('[DISCOVERY REGISTRY] Failed to save registry:', error);
    return {
      success: false,
      error: new Error(`Failed to save discovery registry: ${error}`),
    };
  }
}

/**
 * Merge discovered repos for a provider into the registry (full-replace for that provider)
 */
export async function mergeDiscoveredRepos(
  provider: GitProvider,
  repos: DiscoveredRepository[]
): Promise<Result<DiscoveryResult>> {
  const startTime = Date.now();
  try {
    const loadResult = await loadRegistry();
    if (!loadResult.success) {
      return { success: false, error: loadResult.error };
    }

    const registry = loadResult.data;

    // Get existing repos for this provider
    const existingForProvider = registry.repositories.filter((r) => r.provider === provider);
    const existingIds = new Set(existingForProvider.map((r) => r.id));
    const newIds = new Set(repos.map((r) => r.id));

    // Compute counts
    let added = 0;
    let updated = 0;
    for (const repo of repos) {
      if (existingIds.has(repo.id)) {
        updated++;
      } else {
        added++;
      }
    }
    const removed = existingForProvider.filter((r) => !newIds.has(r.id)).length;

    // Replace repos for this provider, keep others
    const otherRepos = registry.repositories.filter((r) => r.provider !== provider);
    registry.repositories = [...otherRepos, ...repos];
    registry.lastDiscoveredAt[provider] = new Date().toISOString();

    const saveResult = await saveRegistry(registry);
    if (!saveResult.success) {
      return { success: false, error: saveResult.error };
    }

    const result: DiscoveryResult = {
      provider,
      discovered: repos.length,
      added,
      updated,
      removed,
      errors: [],
      durationMs: Date.now() - startTime,
    };

    console.log(
      `[DISCOVERY REGISTRY] Merged ${provider}: ${added} added, ${updated} updated, ${removed} removed`
    );
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to merge discovered repos: ${error}`),
    };
  }
}

/**
 * Normalize a URL for comparison: strip .git, convert SSH to HTTPS, lowercase
 */
function normalizeRepoUrl(url: string): string {
  let normalized = url
    .trim()
    .toLowerCase()
    .replace(/\.git$/, '');

  // Convert SSH to HTTPS: git@github.com:owner/repo -> https://github.com/owner/repo
  if (normalized.startsWith('git@')) {
    normalized = normalized.replace(/^git@([^:]+):/, 'https://$1/');
  }

  // Remove trailing slash
  normalized = normalized.replace(/\/$/, '');

  return normalized;
}

/**
 * Annotate repositories with clone status by comparing against workspace index
 */
async function annotateWithCloneStatus(
  repos: DiscoveredRepository[]
): Promise<DiscoveredRepository[]> {
  try {
    const workspacesResult = await getAllWorkspaces();
    if (!workspacesResult.success) {
      return repos;
    }

    const workspaces = workspacesResult.data;

    // Build a map of normalized URLs to workspace IDs
    const urlToWorkspace = new Map<string, WorkspaceId>();
    for (const ws of workspaces) {
      const normalized = normalizeRepoUrl(ws.repoUrl as string);
      urlToWorkspace.set(normalized, ws.id);
    }

    return repos.map((repo): DiscoveredRepository => {
      const normalizedHttp = normalizeRepoUrl(repo.httpUrl);
      const normalizedSsh = repo.sshUrl ? normalizeRepoUrl(repo.sshUrl) : null;

      const matchedId =
        urlToWorkspace.get(normalizedHttp) ||
        (normalizedSsh ? urlToWorkspace.get(normalizedSsh) : undefined);

      if (matchedId) {
        return { ...repo, isCloned: true, workspaceId: matchedId };
      }
      return { ...repo, isCloned: false };
    });
  } catch (error) {
    console.warn('[DISCOVERY REGISTRY] Failed to annotate clone status:', error);
    return repos;
  }
}

/**
 * Get discovered repos, optionally filtered by provider, with clone status annotated
 */
export async function getDiscoveredRepos(
  provider?: GitProvider
): Promise<Result<DiscoveredRepository[]>> {
  try {
    const loadResult = await loadRegistry();
    if (!loadResult.success) {
      return { success: false, error: loadResult.error };
    }

    let repos = loadResult.data.repositories;

    // Filter out corrupt entries (e.g. "gitlab:undefined" from bad discovery runs)
    repos = repos.filter(
      (r) => r.id && !r.id.includes('undefined') && r.fullPath && r.fullPath !== 'undefined'
    );

    if (provider) {
      repos = repos.filter((r) => r.provider === provider);
    }

    const annotated = await annotateWithCloneStatus(repos);
    return { success: true, data: annotated };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to get discovered repos: ${error}`),
    };
  }
}

/**
 * Clear all repos for a specific provider
 */
export async function clearProviderRepos(provider: GitProvider): Promise<Result<void>> {
  try {
    const loadResult = await loadRegistry();
    if (!loadResult.success) {
      return { success: false, error: loadResult.error };
    }

    const registry = loadResult.data;
    registry.repositories = registry.repositories.filter((r) => r.provider !== provider);
    delete registry.lastDiscoveredAt[provider];

    const saveResult = await saveRegistry(registry);
    if (!saveResult.success) {
      return { success: false, error: saveResult.error };
    }

    console.log(`[DISCOVERY REGISTRY] Cleared all repos for provider: ${provider}`);
    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to clear provider repos: ${error}`),
    };
  }
}
