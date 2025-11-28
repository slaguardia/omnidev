/**
 * Unit tests for core type definitions
 */

import {
  Workspace,
  WorkspaceId,
  GitUrl,
  FilePath,
  CommitHash,
  WorkspaceMetadata,
  AsyncResult,
  Result,
} from '../../src/lib/types/index';

describe('Type System', () => {
  describe('Branded Types', () => {
    it('should handle WorkspaceId as branded string', () => {
      const id = 'workspace-123' as WorkspaceId;
      expect(typeof id).toBe('string');
      expect(id).toBe('workspace-123');
    });

    it('should handle GitUrl as branded string', () => {
      const url = 'https://gitlab.com/user/repo.git' as GitUrl;
      expect(typeof url).toBe('string');
      expect(url).toBe('https://gitlab.com/user/repo.git');
    });

    it('should handle FilePath as branded string', () => {
      const path = '/path/to/file' as FilePath;
      expect(typeof path).toBe('string');
      expect(path).toBe('/path/to/file');
    });

    it('should handle CommitHash as branded string', () => {
      const hash = 'abc123def456' as CommitHash;
      expect(typeof hash).toBe('string');
      expect(hash).toBe('abc123def456');
    });
  });

  describe('Workspace Structure', () => {
    it('should create a valid workspace object', () => {
      const workspace: Workspace = {
        id: 'workspace-123' as WorkspaceId,
        path: '/tmp/workspace-123' as FilePath,
        repoUrl: 'https://gitlab.com/user/repo.git' as GitUrl,
        targetBranch: 'main',
        createdAt: new Date('2024-01-01'),
        lastAccessed: new Date('2024-01-02'),
        metadata: {
          size: 1024000,
          commitHash: 'abc123' as CommitHash,
          isActive: true,
          tags: ['project-a', 'frontend'],
        } as WorkspaceMetadata,
      };

      expect(workspace.id).toBe('workspace-123');
      expect(workspace.repoUrl).toBe('https://gitlab.com/user/repo.git');
      expect(workspace.targetBranch).toBe('main');
      expect(workspace.metadata?.size).toBe(1024000);
      expect(workspace.metadata?.isActive).toBe(true);
      expect(workspace.metadata?.tags).toEqual(['project-a', 'frontend']);
    });
  });

  describe('Result Types', () => {
    it('should handle successful Result', () => {
      const result: Result<string> = { success: true, data: 'test data' };

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('test data');
      }
    });

    it('should handle failed Result', () => {
      const result: Result<string> = { success: false, error: new Error('test error') };

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('test error');
      }
    });

    it('should handle AsyncResult as Promise', async () => {
      const asyncResult: AsyncResult<number> = Promise.resolve({ success: true, data: 42 });

      const result = await asyncResult;
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(42);
      }
    });
  });
});
