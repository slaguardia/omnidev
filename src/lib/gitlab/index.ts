/**
 * GitLab integration - barrel exports
 */

// Types
export * from '@/lib/gitlab/types';

// API utilities
export {
  extractProjectIdFromUrl,
  getProject,
  getProjectBranches,
  getProjectMergeRequests,
  canPushToBranch,
  GitLabAccessLevel,
  type BranchPushPermissionResult,
} from '@/lib/gitlab/api';

// Merge request operations
export { createMergeRequest } from '@/lib/gitlab/merge-requests';

// Configuration
export { loadGitLabConfig, getGitLabConfig } from '@/lib/gitlab/config';

// Utilities
export { formatMergeRequestDescription, getGitContextForMR } from '@/lib/gitlab/utils';
