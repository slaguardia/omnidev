/**
 * Core type definitions for GitLab Claude Manager
 */

// Branded types for better type safety
export type WorkspaceId = string & { readonly brand: unique symbol };
export type GitUrl = string & { readonly brand: unique symbol };
export type FilePath = string & { readonly brand: unique symbol };
export type CommitHash = string & { readonly brand: unique symbol };

/**
 * UI Component types
 */
export interface IconSvgProps {
  size?: number;
  width?: number;
  height?: number;
  [key: string]: unknown;
}

/**
 * Utility types
 */
export type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };

export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;


