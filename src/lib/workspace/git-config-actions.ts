'use server';

import type { WorkspaceId } from '@/lib/types/index';
import { unsetWorkspaceGitConfig as gitUnsetConfig } from '@/lib/managers/repository-manager';
import { getWorkspaceGitConfig as gitGetConfig } from '@/lib/managers/repository-manager';
import { setWorkspaceGitConfig as gitSetConfig } from '@/lib/managers/repository-manager';
import { initializeWorkspaceManager } from '@/lib/managers/workspace-manager';
import * as WorkspaceManager from '@/lib/managers/workspace-manager';

export async function setWorkspaceGitConfig(
  workspaceId: WorkspaceId,
  config: { userEmail?: string; userName?: string; signingKey?: string }
) {
  // Initialize workspace manager first
  const initResult = await initializeWorkspaceManager();
  if (!initResult.success) {
    throw new Error(`Failed to initialize workspace manager: ${initResult.error?.message}`);
  }

  const result = await gitSetConfig(workspaceId, config, WorkspaceManager);
  
  if (!result.success) {
    throw new Error(result.error.message);
  }
  
  return { success: true, message: 'Git configuration updated successfully' };
}

export async function getWorkspaceGitConfig(workspaceId: WorkspaceId) {
  // Initialize workspace manager first
  const initResult = await initializeWorkspaceManager();
  if (!initResult.success) {
    throw new Error(`Failed to initialize workspace manager: ${initResult.error?.message}`);
  }

  const result = await gitGetConfig(workspaceId, WorkspaceManager);
  
  if (!result.success) {
    throw new Error(result.error.message);
  }
  
  return result.data;
}

export async function unsetWorkspaceGitConfig(
  workspaceId: WorkspaceId,
  keys: ('userEmail' | 'userName' | 'signingKey')[]
) {
  // Initialize workspace manager first
  const initResult = await initializeWorkspaceManager();
  if (!initResult.success) {
    throw new Error(`Failed to initialize workspace manager: ${initResult.error?.message}`);
  }

  const result = await gitUnsetConfig(workspaceId, keys, WorkspaceManager);
  
  if (!result.success) {
    throw new Error(result.error.message);
  }
  
  return { success: true, message: 'Git configuration removed successfully' };
} 