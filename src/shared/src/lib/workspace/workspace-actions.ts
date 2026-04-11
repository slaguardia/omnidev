'use server';

import type { Workspace, GitUrl, GitCredentials, WorkspaceId } from '@/lib/types/index';
import { validateGitUrl, extractRepoName } from '@/lib/git/core';
import {
  initializeWorkspaceManager,
  loadWorkspace,
  registerLogicalWorkspace,
} from '@/lib/managers/workspace-manager';
import { listWorkspaces } from '@/lib/managers/repository-manager';
import { loadAllWorkspacesFromStorage } from '@/lib/managers/repository-manager';
import { cloneRepository } from '@/lib/managers/repository-manager';
import { getConfig } from '@/lib/config/server-actions';
import { getGitCredentialsFromConfig } from '@/lib/git/repo-credentials';
import { detectProviderFromUrl } from '@/lib/git/provider-detection';
import { createSandboxedGit } from '@/lib/git/sandbox';
import { isPrismaConfigured } from '@/lib/db/prisma';
import { getAllRemoteBranches } from '@/lib/git/branches';
import { dbGetAllWorkspaces } from '@/lib/managers/workspace-db';
import { resolveWorkspaceGitRoot } from '@/lib/workspace/resolve-workspace-root';

/**
 * Resolve remote branch names for a workspace (server-only; for client hooks).
 */
export async function getRemoteBranchesForWorkspace(workspaceId: WorkspaceId): Promise<string[]> {
  const ws = await loadWorkspace(workspaceId);
  if (!ws.success) return [];
  const root = await resolveWorkspaceGitRoot(ws.data);
  const r = await getAllRemoteBranches(root);
  return r.success ? r.data : [];
}

export async function getWorkspaces(): Promise<Workspace[]> {
  console.log('[WORKSPACE ACTIONS] Starting getWorkspaces()');

  try {
    // Initialize workspace manager first
    console.log('[WORKSPACE ACTIONS] Initializing workspace manager...');
    const initResult = await initializeWorkspaceManager();

    if (!initResult.success) {
      console.error(
        '[WORKSPACE ACTIONS] Failed to initialize workspace manager:',
        initResult.error
      );
      return [];
    }
    console.log('[WORKSPACE ACTIONS] Workspace manager initialized successfully');

    // Load workspaces from storage
    console.log('[WORKSPACE ACTIONS] Loading workspaces from storage...');
    const loadResult = await loadAllWorkspacesFromStorage();

    if (!loadResult.success) {
      console.error(
        '[WORKSPACE ACTIONS] Failed to load workspaces from storage:',
        loadResult.error
      );
      return [];
    }
    console.log('[WORKSPACE ACTIONS] Workspaces loaded from storage successfully');

    // Get the workspace list
    console.log('[WORKSPACE ACTIONS] Getting workspace list...');
    const workspaceList = await listWorkspaces();
    console.log(
      `[WORKSPACE ACTIONS] Found ${workspaceList.length} workspaces:`,
      workspaceList.map((ws) => ({
        id: ws.id,
        repoUrl: ws.repoUrl,
        targetBranch: ws.targetBranch,
        path: ws.path,
        isActive: ws.metadata?.isActive,
      }))
    );

    return workspaceList;
  } catch (error) {
    console.error('[WORKSPACE ACTIONS] Error fetching workspaces:', error);
    return [];
  }
}

export async function getWorkspaceStats(): Promise<{
  total: number;
  active: number;
  inactive: number;
  totalSizeMB: number;
}> {
  console.log('[WORKSPACE ACTIONS] Starting getWorkspaceStats()');

  // Initialize workspace manager
  const initResult = await initializeWorkspaceManager();
  if (!initResult.success) {
    console.error(
      '[WORKSPACE ACTIONS] Failed to initialize workspace manager for stats:',
      initResult.error
    );
    throw new Error(`Failed to initialize workspace manager: ${initResult.error?.message}`);
  }

  const stats = await getWorkspaceStats();
  console.log('[WORKSPACE ACTIONS] Workspace stats:', stats);

  return {
    total: stats.total,
    active: stats.active,
    inactive: stats.inactive,
    totalSizeMB: Math.round(stats.totalSizeMB / 1024 / 1024),
  };
}

export async function cloneRepositoryAction(
  repoUrl: string,
  branch?: string
): Promise<{
  success: boolean;
  message: string;
  data?: {
    repoName: string;
    targetPath: string;
    workspaceId: string;
  };
  error?: unknown;
}> {
  console.log('[WORKSPACE ACTIONS] Starting cloneRepositoryAction');
  console.log('[WORKSPACE ACTIONS] Repo URL:', repoUrl);
  console.log('[WORKSPACE ACTIONS] Branch:', branch);

  try {
    // Validate repository URL
    console.log('[WORKSPACE ACTIONS] Validating Git URL...');
    if (!(await validateGitUrl(repoUrl as GitUrl))) {
      console.error('[WORKSPACE ACTIONS] Invalid Git URL:', repoUrl);
      return {
        success: false,
        message: 'Invalid Git repository URL',
      };
    }
    console.log('[WORKSPACE ACTIONS] Git URL is valid');

    // Initialize workspace manager
    console.log('[WORKSPACE ACTIONS] Initializing workspace manager...');
    const initResult = await initializeWorkspaceManager();
    if (!initResult.success) {
      console.error(
        '[WORKSPACE ACTIONS] Failed to initialize workspace manager:',
        initResult.error
      );
      return {
        success: false,
        message: `Failed to initialize workspace manager: ${initResult.error?.message}`,
      };
    }
    console.log('[WORKSPACE ACTIONS] Workspace manager initialized successfully');

    // Get credentials from config (supports both GitHub and GitLab based on URL)
    const config = await getConfig();
    const resolved = getGitCredentialsFromConfig(config, repoUrl);
    const credentials: GitCredentials | undefined = resolved ?? undefined;

    if (credentials) {
      console.log(
        '[WORKSPACE ACTIONS] Using credentials from config for user:',
        credentials.username
      );
    } else {
      console.log('[WORKSPACE ACTIONS] No credentials configured, attempting public clone');
    }

    // Postgres mode: register workspace record without cloning to disk
    if (isPrismaConfigured()) {
      console.log('[WORKSPACE ACTIONS] Postgres mode — registering logical workspace');

      // Check for duplicate workspace
      const existing = await dbGetAllWorkspaces();
      const duplicate = existing.find(
        (ws) => ws.repoUrl === repoUrl && (!branch || ws.targetBranch === branch)
      );
      if (duplicate) {
        return {
          success: false,
          message: `Workspace already exists for ${repoUrl} on branch ${duplicate.targetBranch} (ID: ${duplicate.id}). Use existing workspace or clean it first.`,
        };
      }

      // Lightweight validation: verify URL is accessible and resolve default branch
      const git = createSandboxedGit();
      let lsRemoteUrl = repoUrl;
      if (credentials) {
        try {
          const url = new URL(repoUrl);
          url.username = credentials.username;
          url.password = credentials.password;
          lsRemoteUrl = url.toString();
        } catch {
          /* use original URL for SSH or invalid format */
        }
      }

      let resolvedBranch = branch;
      try {
        const lsRemoteOutput = await git.raw(['ls-remote', '--heads', lsRemoteUrl]);
        if (!lsRemoteOutput || lsRemoteOutput.trim().length === 0) {
          return { success: false, message: 'Repository not accessible or empty' };
        }
        // If no branch specified, resolve the default branch
        if (!resolvedBranch) {
          try {
            const symsOutput = await git.raw(['ls-remote', '--symref', lsRemoteUrl, 'HEAD']);
            const match = symsOutput.match(/ref: refs\/heads\/(\S+)\s+HEAD/);
            if (match?.[1]) resolvedBranch = match[1];
          } catch {
            /* fallback below */
          }
          if (!resolvedBranch) {
            if (lsRemoteOutput.includes('refs/heads/main')) resolvedBranch = 'main';
            else if (lsRemoteOutput.includes('refs/heads/master')) resolvedBranch = 'master';
            else resolvedBranch = 'main';
          }
        }
      } catch (lsError) {
        return {
          success: false,
          message: `Repository not accessible: ${lsError instanceof Error ? lsError.message : String(lsError)}`,
        };
      }

      const provider = detectProviderFromUrl(repoUrl);
      const result = await registerLogicalWorkspace({
        repoUrl,
        targetBranch: resolvedBranch,
        provider,
      });

      if (!result.success) {
        return {
          success: false,
          message: result.error?.message || 'Failed to register workspace',
        };
      }

      const repoName = await extractRepoName(repoUrl as GitUrl);
      console.log('[WORKSPACE ACTIONS] Workspace registered:', {
        id: result.data.id,
        repoUrl,
        branch: resolvedBranch,
        provider,
      });

      return {
        success: true,
        message: 'Repository registered successfully!',
        data: {
          repoName,
          targetPath: '',
          workspaceId: result.data.id,
        },
      };
    }

    // SQLite mode: full clone to disk
    console.log('[WORKSPACE ACTIONS] Cloning repository...');
    const cloneOptions: {
      targetBranch?: string;
      credentials?: GitCredentials;
    } = {
      ...(credentials && { credentials }),
    };

    if (branch) {
      cloneOptions.targetBranch = branch;
    }

    const cloneResult = await cloneRepository(repoUrl as GitUrl, cloneOptions);

    if (!cloneResult.success) {
      console.error('[WORKSPACE ACTIONS] Clone failed:', cloneResult.error);
      return {
        success: false,
        message: cloneResult.error?.message || 'Failed to clone repository',
        error: cloneResult.error,
      };
    }

    const workspace = cloneResult.data;
    console.log('[WORKSPACE ACTIONS] Repository cloned successfully:', {
      id: workspace.id,
      repoUrl: workspace.repoUrl,
      path: workspace.path,
    });

    const repoName = await extractRepoName(repoUrl as GitUrl);

    return {
      success: true,
      message: 'Repository cloned successfully!',
      data: {
        repoName,
        targetPath: workspace.path ?? '',
        workspaceId: workspace.id,
      },
    };
  } catch (error) {
    console.error('[WORKSPACE ACTIONS] Error in cloneRepositoryAction:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Clone failed',
      error,
    };
  }
}
