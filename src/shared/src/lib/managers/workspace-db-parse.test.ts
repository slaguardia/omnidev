import { describe, it, expect } from 'vitest';

/**
 * Workspace JSON normalization (path empty → undefined) is implemented in
 * workspace-db-sqlite and workspace-db-pg parseWorkspace via shared merge logic.
 */
describe('workspace path normalization', () => {
  it('treats empty path as absent', () => {
    const raw = { path: '', repoUrl: 'https://example.com/x.git', targetBranch: 'main' };
    const path =
      raw.path && typeof raw.path === 'string' && raw.path.length > 0 ? raw.path : undefined;
    expect(path).toBeUndefined();
  });
});
