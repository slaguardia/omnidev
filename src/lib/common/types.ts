/**
 * Core type definitions for GitLab Claude Manager
 * Re-exports from the main types module to ensure type compatibility
 */

// Re-export branded types from the main types module
export type {
  WorkspaceId,
  GitUrl,
  FilePath,
  CommitHash,
  IconSvgProps,
  Result,
  AsyncResult,
} from '@/lib/types/index';
