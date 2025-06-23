// Environment actions
export {
  getEnvironmentConfig,
  saveEnvironmentConfig
} from '@/lib/workspace/environmentConfig';

// Server configuration (Node.js paths)
export {
  getConfigDir,
  getConfigFile,
  getConfigPaths
} from '@/lib/workspace/serverConfig';

// Workspace management actions
export {
  getWorkspaces,
  getWorkspaceStats,
  cloneRepositoryAction
} from '@/lib/workspace/workspaceActions';

// Git configuration actions
export {
  setWorkspaceGitConfig,
  getWorkspaceGitConfig,
  unsetWorkspaceGitConfig
} from '@/lib/workspace/gitConfigActions';

// Cleanup actions
export {
  cleanupWorkspace,
  cleanupAllWorkspaces
} from '@/lib/workspace/cleanup';

// Shared types and constants
export type {
  EnvironmentConfig
} from '@/lib/workspace/shared'; 