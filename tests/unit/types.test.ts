/**
 * Unit tests for core type definitions
 */

import type { 
  Workspace, 
  WorkspaceId, 
  GitUrl, 
  FilePath, 
  CommitHash,
  CacheData,
  DirectoryAnalysis,
  Result,
  AsyncResult
} from '../../src/types/index.js';

describe('Core Types', () => {
  
  describe('Branded Types', () => {
    it('should create branded types correctly', () => {
      const workspaceId = 'test-workspace-123' as WorkspaceId;
      const gitUrl = 'https://gitlab.com/test/repo.git' as GitUrl;
      const filePath = '/tmp/workspace' as FilePath;
      const commitHash = 'abc123def456' as CommitHash;

      expect(typeof workspaceId).toBe('string');
      expect(typeof gitUrl).toBe('string');
      expect(typeof filePath).toBe('string');
      expect(typeof commitHash).toBe('string');
    });
  });

  describe('Workspace Interface', () => {
    it('should create a valid workspace object', () => {
      const workspace: Workspace = {
        id: 'test-id' as WorkspaceId,
        path: '/tmp/test' as FilePath,
        repoUrl: 'https://gitlab.com/test/repo.git' as GitUrl,
        branch: 'main',
        createdAt: new Date(),
        lastAccessed: new Date(),
        metadata: {
          size: 1024,
          commitHash: 'abc123' as CommitHash,
          isActive: true,
          tags: ['typescript', 'nodejs']
        }
      };

      expect(workspace.id).toBe('test-id');
      expect(workspace.branch).toBe('main');
      expect(workspace.metadata?.isActive).toBe(true);
      expect(workspace.metadata?.tags).toContain('typescript');
    });
  });

  describe('Cache Data Structure', () => {
    it('should create a valid cache data object', () => {
      const cacheData: CacheData = {
        lastCommitHash: 'abc123' as CommitHash,
        directoryHash: 'def456',
        lastUpdated: new Date(),
        version: '1.0.0',
        analysis: {
          fileCount: 25,
          languages: ['TypeScript', 'JavaScript'],
          structure: [
            {
              name: 'src',
              path: '/tmp/workspace/src' as FilePath,
              type: 'directory',
              children: [
                {
                  name: 'index.ts',
                  path: '/tmp/workspace/src/index.ts' as FilePath,
                  type: 'file',
                  size: 1024,
                  mimeType: 'application/typescript'
                }
              ]
            }
          ]
        }
      };

      expect(cacheData.analysis.fileCount).toBe(25);
      expect(cacheData.analysis.languages).toContain('TypeScript');
      expect(cacheData.analysis.structure[0]?.name).toBe('src');
      expect(cacheData.analysis.structure[0]?.type).toBe('directory');
    });
  });

  describe('Result Type', () => {
    it('should handle success results', () => {
      const successResult: Result<string> = {
        success: true,
        data: 'test data'
      };

      if (successResult.success) {
        expect(successResult.data).toBe('test data');
      }
    });

    it('should handle error results', () => {
      const errorResult: Result<string> = {
        success: false,
        error: new Error('Test error')
      };

      if (!errorResult.success) {
        expect(errorResult.error.message).toBe('Test error');
      }
    });
  });

  describe('Async Result Type', () => {
    it('should handle async success results', async () => {
      const asyncSuccessResult: AsyncResult<number> = Promise.resolve({
        success: true,
        data: 42
      });

      const result = await asyncSuccessResult;
      if (result.success) {
        expect(result.data).toBe(42);
      }
    });

    it('should handle async error results', async () => {
      const asyncErrorResult: AsyncResult<number> = Promise.resolve({
        success: false,
        error: new Error('Async error')
      });

      const result = await asyncErrorResult;
      if (!result.success) {
        expect(result.error.message).toBe('Async error');
      }
    });
  });

  describe('Type Guards', () => {
    it('should work with type narrowing', () => {
      const result: Result<string> = Math.random() > 0.5 
        ? { success: true, data: 'success' }
        : { success: false, error: new Error('failure') };

      if (result.success) {
        // TypeScript should infer result.data is available
        expect(typeof result.data).toBe('string');
      } else {
        // TypeScript should infer result.error is available
        expect(result.error).toBeInstanceOf(Error);
      }
    });
  });
}); 