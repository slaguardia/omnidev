'use server';

import type { WorkspaceId } from '@/lib/types/index';
import { unsetWorkspaceGitConfig as gitUnsetConfig } from '@/lib/managers/repository-manager';
import { getWorkspaceGitConfig as gitGetConfig } from '@/lib/managers/repository-manager';
import { setWorkspaceGitConfig as gitSetConfig } from '@/lib/managers/repository-manager';

export async function setWorkspaceGitConfig(
  workspaceId: WorkspaceId,
  config: { userEmail?: string; userName?: string; signingKey?: string }
) {
  const result = await gitSetConfig(workspaceId, config);
  
  if (!result.success) {
    throw new Error(result.error.message);
  }
  
  return { success: true, message: 'Git configuration updated successfully' };
}

export async function getWorkspaceGitConfig(workspaceId: WorkspaceId) {
  const result = await gitGetConfig(workspaceId);
  
  if (!result.success) {
    throw new Error(result.error.message);
  }
  
  return result.data;
}

export async function unsetWorkspaceGitConfig(
  workspaceId: WorkspaceId,
  keys: ('userEmail' | 'userName' | 'signingKey')[]
) {
  const result = await gitUnsetConfig(workspaceId, keys);
  
  if (!result.success) {
    throw new Error(result.error.message);
  }
  
  return { success: true, message: 'Git configuration removed successfully' };
} 