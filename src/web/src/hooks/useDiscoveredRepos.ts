'use client';

import { useState, useCallback, useMemo } from 'react';
import type { DiscoveredRepository, DiscoveryResult, GitProvider } from '@/lib/types/index';

interface UseDiscoveredReposReturn {
  repos: DiscoveredRepository[];
  loading: boolean;
  discovering: boolean;
  error: string | null;
  lastDiscoveredAt: Partial<Record<GitProvider, string>>;
  loadRepos: () => Promise<void>;
  discover: (provider: 'github' | 'gitlab' | 'all') => Promise<DiscoveryResult[] | null>;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  providerFilter: 'all' | 'github' | 'gitlab';
  setProviderFilter: (p: 'all' | 'github' | 'gitlab') => void;
  filteredRepos: DiscoveredRepository[];
}

export function useDiscoveredRepos(): UseDiscoveredReposReturn {
  const [repos, setRepos] = useState<DiscoveredRepository[]>([]);
  const [loading, setLoading] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastDiscoveredAt, setLastDiscoveredAt] = useState<Partial<Record<GitProvider, string>>>(
    {}
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [providerFilter, setProviderFilter] = useState<'all' | 'github' | 'gitlab'>('all');

  const loadRepos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/discovery');
      const data = await response.json();

      if (data.success) {
        setRepos(data.data.repositories);
        setLastDiscoveredAt(data.data.lastDiscoveredAt || {});
      } else {
        setError(data.error || 'Failed to load repositories');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load repositories');
    } finally {
      setLoading(false);
    }
  }, []);

  const discover = useCallback(
    async (provider: 'github' | 'gitlab' | 'all'): Promise<DiscoveryResult[] | null> => {
      setDiscovering(true);
      setError(null);
      try {
        const response = await fetch('/api/discovery', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider }),
        });
        const data = await response.json();

        if (data.success) {
          // Reload repos to get fresh annotated data
          await loadRepos();
          return data.data.results as DiscoveryResult[];
        } else {
          const errorMsg = data.data?.errors?.join('; ') || data.error || 'Discovery failed';
          setError(errorMsg);
          // Still reload in case partial results were saved
          await loadRepos();
          return null;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Discovery failed');
        return null;
      } finally {
        setDiscovering(false);
      }
    },
    [loadRepos]
  );

  const filteredRepos = useMemo(() => {
    let filtered = repos;

    // Deduplicate by id (defensive against bad data)
    const seen = new Set<string>();
    filtered = filtered.filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });

    // Filter by provider
    if (providerFilter !== 'all') {
      filtered = filtered.filter((r) => r.provider === providerFilter);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.fullPath.toLowerCase().includes(q) ||
          (r.description && r.description.toLowerCase().includes(q))
      );
    }

    // Sort: non-archived first, then by last activity
    filtered.sort((a, b) => {
      if (a.archived !== b.archived) return a.archived ? 1 : -1;
      return new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime();
    });

    return filtered;
  }, [repos, providerFilter, searchQuery]);

  return {
    repos,
    loading,
    discovering,
    error,
    lastDiscoveredAt,
    loadRepos,
    discover,
    searchQuery,
    setSearchQuery,
    providerFilter,
    setProviderFilter,
    filteredRepos,
  };
}
