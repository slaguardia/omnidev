import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import {
  validateAndParseDiscoveryRouteParams,
  parseDiscoveryProviderParam,
} from '@/lib/api/route-validation';
import { discoverGitLabRepositories } from '@/lib/gitlab/discovery';
import { discoverGitHubRepositories } from '@/lib/github/discovery';
import {
  getDiscoveredRepos,
  mergeDiscoveredRepos,
  loadRegistry,
} from '@/lib/managers/discovery-registry-manager';
import type { DiscoveryResult } from '@/lib/types/index';

/**
 * GET /api/discovery?provider=github|gitlab
 * Returns discovered repos from registry, optionally filtered by provider
 */
export async function GET(request: NextRequest) {
  const authResult = await withAuth(request);
  if (!authResult.success) {
    return authResult.response!;
  }

  try {
    const providerParam = request.nextUrl.searchParams.get('provider');
    const provider = parseDiscoveryProviderParam(providerParam);

    const reposResult = await getDiscoveredRepos(provider);
    if (!reposResult.success) {
      return NextResponse.json(
        { success: false, error: reposResult.error.message },
        { status: 500 }
      );
    }

    // Also load timestamps
    const registryResult = await loadRegistry();
    const lastDiscoveredAt = registryResult.success ? registryResult.data.lastDiscoveredAt : {};

    return NextResponse.json({
      success: true,
      data: {
        repositories: reposResult.data,
        lastDiscoveredAt,
      },
    });
  } catch (error) {
    console.error('[DISCOVERY API] GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load discovered repositories' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/discovery
 * Triggers discovery for the specified provider(s)
 * Body: { provider: 'github' | 'gitlab' | 'all', token?: string, gitlabUrl?: string }
 */
export async function POST(request: NextRequest) {
  const authResult = await withAuth(request);
  if (!authResult.success) {
    return authResult.response!;
  }

  try {
    const body = await request.json();
    const validation = validateAndParseDiscoveryRouteParams(body, 'DISCOVERY API');

    if (!validation.success) {
      return validation.error!;
    }

    const { provider, token, gitlabUrl } = validation.data!;
    const results: DiscoveryResult[] = [];
    const errors: string[] = [];

    // Discover GitHub
    if (provider === 'github' || provider === 'all') {
      const ghResult = await discoverGitHubRepositories(token);
      if (ghResult.success) {
        const mergeResult = await mergeDiscoveredRepos('github', ghResult.data);
        if (mergeResult.success) {
          results.push(mergeResult.data);
        } else {
          errors.push(`GitHub merge failed: ${mergeResult.error.message}`);
        }
      } else {
        errors.push(`GitHub discovery failed: ${ghResult.error.message}`);
      }
    }

    // Discover GitLab
    if (provider === 'gitlab' || provider === 'all') {
      const glResult = await discoverGitLabRepositories(gitlabUrl, token);
      if (glResult.success) {
        const mergeResult = await mergeDiscoveredRepos('gitlab', glResult.data);
        if (mergeResult.success) {
          results.push(mergeResult.data);
        } else {
          errors.push(`GitLab merge failed: ${mergeResult.error.message}`);
        }
      } else {
        errors.push(`GitLab discovery failed: ${glResult.error.message}`);
      }
    }

    return NextResponse.json({
      success: errors.length === 0,
      data: {
        results,
        errors,
      },
    });
  } catch (error) {
    console.error('[DISCOVERY API] POST error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to trigger discovery' },
      { status: 500 }
    );
  }
}
