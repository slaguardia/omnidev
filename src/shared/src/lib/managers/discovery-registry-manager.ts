'use server';

/**
 * Discovery Registry Manager
 * Persists GitHub/GitLab discovery results:
 * - PostgreSQL `ralph_meta` when DATABASE_URL is set
 * - Else `data/.discovery-registry.json`
 */

import { readFile, writeFile, access, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { getDataDir } from '@/lib/config/server-actions';
import { isPrismaConfigured } from '@/lib/db/prisma';
import { getRalphMetaValue, RALPH_META_KEYS, setRalphMetaValue } from '@/lib/db/ralph-meta-store';
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

async function getRegistryPath(): Promise<string> {
  const dataDir = await getDataDir();
  return join(dataDir, REGISTRY_FILENAME);
}

function normalizeRegistry(raw: unknown): DiscoveredRepoRegistry {
  if (!raw || typeof raw !== 'object') {
    return { ...EMPTY_REGISTRY, repositories: [] };
  }
  const o = raw as Record<string, unknown>;
  return {
    version: typeof o.version === 'string' ? o.version : EMPTY_REGISTRY.version,
    lastDiscoveredAt:
      o.lastDiscoveredAt && typeof o.lastDiscoveredAt === 'object'
        ? (o.lastDiscoveredAt as DiscoveredRepoRegistry['lastDiscoveredAt'])
        : {},
    repositories: Array.isArray(o.repositories) ? (o.repositories as DiscoveredRepository[]) : [],
  };
}

async function loadFromPostgres(): Promise<DiscoveredRepoRegistry | null> {
  if (!isPrismaConfigured()) return null;
  const raw = await getRalphMetaValue(RALPH_META_KEYS.DISCOVERY_REGISTRY);
  if (!raw) return null;
  try {
    return normalizeRegistry(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function migrateFileToPostgres(): Promise<DiscoveredRepoRegistry | null> {
  if (!isPrismaConfigured()) return null;
  const registryPath = await getRegistryPath();
  try {
    await access(registryPath);
  } catch {
    return null;
  }
  try {
    const data = await readFile(registryPath, 'utf-8');
    const registry = normalizeRegistry(JSON.parse(data));
    await setRalphMetaValue(RALPH_META_KEYS.DISCOVERY_REGISTRY, JSON.stringify(registry));
    console.log('[DISCOVERY REGISTRY] Migrated discovery registry from file to Postgres');
    return registry;
  } catch (e) {
    console.warn('[DISCOVERY REGISTRY] File→Postgres migration failed:', e);
    return null;
  }
}

export async function loadRegistry(): Promise<Result<DiscoveredRepoRegistry>> {
  try {
    if (isPrismaConfigured()) {
      const fromPg = await loadFromPostgres();
      if (fromPg) {
        return { success: true, data: fromPg };
      }
      const migrated = await migrateFileToPostgres();
      if (migrated) {
        return { success: true, data: migrated };
      }
      return { success: true, data: { ...EMPTY_REGISTRY, repositories: [] } };
    }

    const registryPath = await getRegistryPath();
    try {
      await access(registryPath);
    } catch {
      return { success: true, data: { ...EMPTY_REGISTRY, repositories: [] } };
    }

    const data = await readFile(registryPath, 'utf-8');
    const registry = normalizeRegistry(JSON.parse(data));
    return { success: true, data: registry };
  } catch (error) {
    console.error('[DISCOVERY REGISTRY] Failed to load registry:', error);
    return {
      success: false,
      error: new Error(`Failed to load discovery registry: ${error}`),
    };
  }
}

export async function saveRegistry(registry: DiscoveredRepoRegistry): Promise<Result<void>> {
  try {
    if (isPrismaConfigured()) {
      await setRalphMetaValue(RALPH_META_KEYS.DISCOVERY_REGISTRY, JSON.stringify(registry));
      return { success: true, data: undefined };
    }

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

    const existingForProvider = registry.repositories.filter((r) => r.provider === provider);
    const existingIds = new Set(existingForProvider.map((r) => r.id));
    const newIds = new Set(repos.map((r) => r.id));

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

function normalizeRepoUrl(url: string): string {
  let normalized = url
    .trim()
    .toLowerCase()
    .replace(/\.git$/, '');

  if (normalized.startsWith('git@')) {
    normalized = normalized.replace(/^git@([^:]+):/, 'https://$1/');
  }

  normalized = normalized.replace(/\/$/, '');

  return normalized;
}

async function annotateWithCloneStatus(
  repos: DiscoveredRepository[]
): Promise<DiscoveredRepository[]> {
  try {
    const workspacesResult = await getAllWorkspaces();
    if (!workspacesResult.success) {
      return repos;
    }

    const workspaces = workspacesResult.data;

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

export async function getDiscoveredRepos(
  provider?: GitProvider
): Promise<Result<DiscoveredRepository[]>> {
  try {
    const loadResult = await loadRegistry();
    if (!loadResult.success) {
      return { success: false, error: loadResult.error };
    }

    let repos = loadResult.data.repositories;

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
