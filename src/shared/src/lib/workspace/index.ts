// Configuration actions (now handled by src/config/settings.ts)
// All configuration is stored in data/app-config.json

// Workspace management actions
export {
  getWorkspaces,
  getWorkspaceStats,
  cloneRepositoryAction,
  getRemoteBranchesForWorkspace,
} from '@/lib/workspace/workspace-actions';

// Git configuration actions
export {
  setWorkspaceGitConfig,
  getWorkspaceGitConfig,
  unsetWorkspaceGitConfig,
} from '@/lib/workspace/git-config-actions';

// Cleanup actions
export { cleanupWorkspace, cleanupAllWorkspaces } from '@/lib/workspace/cleanup';

// Ephemeral shallow clones: import from @/lib/workspace/ephemeral-shallow-clone (server-only; not re-exported here for client bundle safety).

// All types now in @/lib/types/index
