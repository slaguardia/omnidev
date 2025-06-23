/**
 * GitLab integration - barrel exports
 */

// Types
export * from '@/lib/gitlab/types';

// API client
export { GitLabAPI } from '@/lib/gitlab/api';

// Merge request operations
export { createMergeRequest } from '@/lib/gitlab/mergeRequests';

// Configuration
export { createGitLabAPI } from '@/lib/gitlab/config';

// Utilities
export { formatMergeRequestDescription, getGitContextForMR } from '@/lib/gitlab/utils'; 