/**
 * Sandboxed Git Configuration
 *
 * This module ensures that the application uses the internal git binary
 * located at /opt/internal/bin/git instead of the sandboxed wrapper.
 *
 * This allows the app to perform git operations while preventing Claude Code
 * from accessing git through its restricted environment.
 */

import { simpleGit, SimpleGit, SimpleGitOptions } from 'simple-git';

/**
 * Path to the real git binary (moved during Docker build)
 * This is accessible to the app but NOT to Claude Code
 *
 * Note: Only git is sandboxed. Other executables (rm, curl, wget) are
 * accessible to Claude Code as they may be needed for legitimate operations.
 */
const INTERNAL_GIT_PATH = process.env.INTERNAL_GIT_PATH || '/opt/internal/bin/git';

/**
 * Internal git path for application use only
 */
export const INTERNAL_EXECUTABLES = {
  git: INTERNAL_GIT_PATH,
} as const;

/**
 * Sandboxed SimpleGit options that use the internal git binary
 */
const sandboxedGitOptions: Partial<SimpleGitOptions> = {
  binary: INTERNAL_GIT_PATH,
  maxConcurrentProcesses: 6,
  trimmed: false,
};

/**
 * Create a sandboxed SimpleGit instance that uses the internal git binary
 *
 * This function should be used instead of the default simpleGit() throughout
 * the application to ensure git operations use the correct binary.
 *
 * @param workingDirectory - Optional working directory for git operations
 * @returns SimpleGit instance configured to use internal git binary
 */
export function createSandboxedGit(workingDirectory?: string): SimpleGit {
  const options: Partial<SimpleGitOptions> = {
    ...sandboxedGitOptions,
    baseDir: workingDirectory || process.cwd(),
  };

  return simpleGit(options);
}

/**
 * Verify that the internal git binary is accessible
 *
 * @returns Promise<boolean> - true if git binary is accessible
 */
export async function verifyGitBinary(): Promise<boolean> {
  try {
    const git = createSandboxedGit();
    await git.version();
    return true;
  } catch (error) {
    console.error('Failed to verify internal git binary:', error);
    return false;
  }
}

/**
 * Get the path to an internal executable
 *
 * This is useful when you need to execute commands directly using child_process
 * instead of through a library wrapper.
 *
 * @param executable - Name of the executable
 * @returns Path to the internal executable
 */
export function getInternalExecutable(executable: keyof typeof INTERNAL_EXECUTABLES): string {
  return INTERNAL_EXECUTABLES[executable];
}
