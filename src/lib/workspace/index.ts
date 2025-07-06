// Configuration actions (now handled by src/config/settings.ts)
// All configuration is stored in /data/app-config.json

// Workspace Storage - Persistent workspace management
export {
  initializeWorkspaceStorage,
  saveWorkspace,
  loadWorkspace,
  getAllWorkspaces,
  deleteWorkspace,
  updateWorkspace,
  workspaceExists
} from './storage';

// Workspace Repository - Repository cloning and management
export {
  cloneRepository,
  cloneRepositoryAction,
  getWorkspace,
  getWorkspaces,
  listWorkspaces,
  loadAllWorkspacesFromStorage,
  cleanupWorkspaceFiles,
  updateWorkspace as updateWorkspaceRepository,
  type GitBranchWorkflowResult,
  type CloneRepositoryOptions
} from './repository';

// Workspace Git Configuration - Git config management
export {
  setWorkspaceGitConfig,
  getWorkspaceGitConfig,
  unsetWorkspaceGitConfig,
  type GitConfig
} from './git-config';

// Workspace Cleanup - High-level cleanup functions (recommended)
export {
  cleanupWorkspace,
  cleanupAllWorkspaces,
  type CleanupResult
} from './cleanup';

// All types now in @/lib/types/index 