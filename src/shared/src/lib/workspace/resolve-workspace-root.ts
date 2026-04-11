'use server';

/**
 * Single entry for resolving a directory that contains the repo for git operations.
 * Prefers a durable {@link Workspace.path} when present; otherwise ephemeral shallow clone.
 */

import type { Workspace, FilePath } from '@/lib/types/index';
import {
  resolveWorkspaceRootWithEphemeralShallowClone,
  type EphemeralShallowCloneInput,
} from '@/lib/workspace/ephemeral-shallow-clone';

export async function resolveWorkspaceGitRoot(workspace: Workspace): Promise<FilePath> {
  const input: EphemeralShallowCloneInput = {
    workspaceId: workspace.id,
    repoUrl: workspace.repoUrl,
    targetBranch: workspace.targetBranch,
  };
  if (workspace.path) {
    input.legacyPath = workspace.path;
  }
  return resolveWorkspaceRootWithEphemeralShallowClone(input);
}
