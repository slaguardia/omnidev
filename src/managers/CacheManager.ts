/**
 * Cache Manager for directory analysis and AI cache files
 */

import { readFile, writeFile, access, stat, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { glob } from 'glob';
import type { 
  CacheData, 
  DirectoryAnalysis, 
  FilePath, 
  CommitHash, 
  FileTreeNode, 
  WorkspaceId,
  AsyncResult
} from '@/types/index.js';

export interface CacheOptions {
  expiryDays: number;
  maxCacheSize: number;
  includePatterns: string[];
  excludePatterns: string[];
}

/**
 * Manages caching of directory analysis and AI-generated insights
 */
export class CacheManager {
  private readonly cacheFileName = '.ai-cache';
  private readonly cacheVersion = '1.0.0';

  constructor(private readonly options: CacheOptions) {}

  /**
   * Get cache data for a directory
   */
  async getCache(directoryPath: FilePath): Promise<AsyncResult<CacheData | null>> {
    try {
      const cacheFilePath = join(directoryPath, this.cacheFileName);
      
      // Check if cache file exists
      try {
        await access(cacheFilePath);
      } catch {
        return { success: true, data: null };
      }

      const cacheContent = await readFile(cacheFilePath, 'utf-8');
      const cacheData: CacheData = JSON.parse(cacheContent);

      // Validate cache version
      if (cacheData.version !== this.cacheVersion) {
        return { success: true, data: null };
      }

      // Check if cache is expired
      const isExpired = this.isCacheExpired(cacheData.lastUpdated);
      if (isExpired) {
        return { success: true, data: null };
      }

      // Verify directory hasn't changed
      const currentHash = await this.calculateDirectoryHash(directoryPath);
      if (currentHash.success && currentHash.data !== cacheData.directoryHash) {
        return { success: true, data: null };
      }

      return { success: true, data: cacheData };
    } catch (error) {
      return { 
        success: false, 
        error: new Error(`Failed to read cache: ${error}`) 
      };
    }
  }

  /**
   * Save cache data for a directory
   */
  async setCache(
    directoryPath: FilePath, 
    analysis: DirectoryAnalysis, 
    commitHash: CommitHash
  ): Promise<AsyncResult<void>> {
    try {
      const directoryHashResult = await this.calculateDirectoryHash(directoryPath);
      if (!directoryHashResult.success) {
        return directoryHashResult;
      }

      const cacheData: CacheData = {
        lastCommitHash: commitHash,
        directoryHash: directoryHashResult.data,
        lastUpdated: new Date(),
        analysis,
        version: this.cacheVersion
      };

      const cacheFilePath = join(directoryPath, this.cacheFileName);
      const cacheContent = JSON.stringify(cacheData, null, 2);
      
      await writeFile(cacheFilePath, cacheContent, 'utf-8');
      
      return { success: true, data: undefined };
    } catch (error) {
      return { 
        success: false, 
        error: new Error(`Failed to save cache: ${error}`) 
      };
    }
  }

  /**
   * Invalidate cache for a directory
   */
  async invalidateCache(directoryPath: FilePath): Promise<AsyncResult<void>> {
    try {
      const cacheFilePath = join(directoryPath, this.cacheFileName);
      
      try {
        await access(cacheFilePath);
        // If file exists, delete it by writing empty content
        await writeFile(cacheFilePath, '', 'utf-8');
      } catch {
        // File doesn't exist, nothing to do
      }

      return { success: true, data: undefined };
    } catch (error) {
      return { 
        success: false, 
        error: new Error(`Failed to invalidate cache: ${error}`) 
      };
    }
  }

  /**
   * Analyze directory structure and create file tree
   */
  async analyzeDirectory(directoryPath: FilePath): Promise<AsyncResult<DirectoryAnalysis>> {
    try {
      const files = await this.getDirectoryFiles(directoryPath);
      const structure = await this.buildFileTree(directoryPath, files);
      const languages = this.detectLanguages(files);
      
      const analysis: DirectoryAnalysis = {
        fileCount: files.length,
        languages,
        structure
        // AI summary and improvements will be added by Claude integration
      };

      return { success: true, data: analysis };
    } catch (error) {
      return { 
        success: false, 
        error: new Error(`Failed to analyze directory: ${error}`) 
      };
    }
  }

  /**
   * Get all files in directory matching patterns
   */
  private async getDirectoryFiles(directoryPath: FilePath): Promise<string[]> {
    const includePatterns = this.options.includePatterns.length > 0 
      ? this.options.includePatterns 
      : ['**/*'];

    const allFiles: string[] = [];
    
    for (const pattern of includePatterns) {
      const files = await glob(pattern, {
        cwd: directoryPath,
        ignore: this.options.excludePatterns,
        nodir: true,
        dot: false
      });
      allFiles.push(...files);
    }

    // Remove duplicates and sort
    return [...new Set(allFiles)].sort();
  }

  /**
   * Build file tree structure
   */
  private async buildFileTree(basePath: FilePath, files: string[]): Promise<FileTreeNode[]> {
    const tree: Map<string, FileTreeNode> = new Map();
    const rootNodes: FileTreeNode[] = [];

    for (const file of files) {
      const parts = file.split('/');
      let currentPath = '';
      let currentLevel = rootNodes;
      let parentMap = tree;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]!;
        const isFile = i === parts.length - 1;
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        const fullPath = join(basePath, currentPath) as FilePath;

        if (!parentMap.has(currentPath)) {
          const node: FileTreeNode = {
            name: part,
            path: fullPath,
            type: isFile ? 'file' : 'directory',
            ...(isFile ? {} : { children: [] })
          };

          // Add file metadata for files
          if (isFile) {
            try {
              const stats = await stat(fullPath);
              node.size = stats.size;
              node.lastModified = stats.mtime;
              node.mimeType = this.getMimeType(part);
            } catch {
              // Ignore stat errors
            }
          }

          parentMap.set(currentPath, node);
          currentLevel.push(node);
        }

        const currentNode = parentMap.get(currentPath)!;
        if (!isFile && currentNode.children) {
          currentLevel = currentNode.children;
        }
      }
    }

    return rootNodes;
  }

  /**
   * Detect programming languages from file extensions
   */
  private detectLanguages(files: string[]): string[] {
    const extensionMap: Record<string, string> = {
      '.js': 'JavaScript',
      '.ts': 'TypeScript',
      '.jsx': 'React',
      '.tsx': 'React TypeScript',
      '.py': 'Python',
      '.java': 'Java',
      '.cpp': 'C++',
      '.c': 'C',
      '.cs': 'C#',
      '.go': 'Go',
      '.rs': 'Rust',
      '.php': 'PHP',
      '.rb': 'Ruby',
      '.swift': 'Swift',
      '.kt': 'Kotlin',
      '.scala': 'Scala',
      '.sh': 'Shell',
      '.yml': 'YAML',
      '.yaml': 'YAML',
      '.json': 'JSON',
      '.xml': 'XML',
      '.html': 'HTML',
      '.css': 'CSS',
      '.scss': 'SCSS',
      '.sass': 'Sass',
      '.md': 'Markdown',
      '.sql': 'SQL'
    };

    const languages = new Set<string>();
    
    for (const file of files) {
      const ext = file.substring(file.lastIndexOf('.'));
      const language = extensionMap[ext.toLowerCase()];
      if (language) {
        languages.add(language);
      }
    }

    return Array.from(languages).sort();
  }

  /**
   * Get MIME type for file extension
   */
  private getMimeType(filename: string): string {
    const ext = filename.substring(filename.lastIndexOf('.'));
    const mimeMap: Record<string, string> = {
      '.js': 'application/javascript',
      '.ts': 'application/typescript',
      '.json': 'application/json',
      '.html': 'text/html',
      '.css': 'text/css',
      '.md': 'text/markdown',
      '.txt': 'text/plain',
      '.py': 'text/x-python',
      '.java': 'text/x-java-source',
      '.cpp': 'text/x-c++src',
      '.c': 'text/x-csrc'
    };
    
    return mimeMap[ext.toLowerCase()] || 'application/octet-stream';
  }

  /**
   * Calculate hash of directory contents
   */
  private async calculateDirectoryHash(directoryPath: FilePath): Promise<AsyncResult<string>> {
    try {
      const files = await this.getDirectoryFiles(directoryPath);
      const hash = createHash('sha256');
      
      // Sort files for consistent hashing
      files.sort();
      
      for (const file of files) {
        const filePath = join(directoryPath, file);
        try {
          const stats = await stat(filePath);
          // Include file path, size, and modification time in hash
          hash.update(`${file}:${stats.size}:${stats.mtime.getTime()}`);
        } catch {
          // Skip files that can't be accessed
          continue;
        }
      }
      
      return { success: true, data: hash.digest('hex') };
    } catch (error) {
      return { 
        success: false, 
        error: new Error(`Failed to calculate directory hash: ${error}`) 
      };
    }
  }

  /**
   * Check if cache is expired
   */
  private isCacheExpired(lastUpdated: Date): boolean {
    const expiryTime = this.options.expiryDays * 24 * 60 * 60 * 1000; // Convert days to milliseconds
    const now = new Date().getTime();
    const cacheTime = lastUpdated.getTime();
    
    return (now - cacheTime) > expiryTime;
  }

  /**
   * Clean up expired cache files in workspace
   */
  async cleanupExpiredCache(workspaceId: WorkspaceId, workspacePath: FilePath): Promise<AsyncResult<number>> {
    try {
      let cleanedCount = 0;
      
      const cacheFiles = await glob(`**/${this.cacheFileName}`, {
        cwd: workspacePath,
        absolute: true
      });

      for (const cacheFile of cacheFiles) {
        try {
          const content = await readFile(cacheFile, 'utf-8');
          const cacheData: CacheData = JSON.parse(content);
          
          if (this.isCacheExpired(cacheData.lastUpdated)) {
            await writeFile(cacheFile, '', 'utf-8'); // Clear the file
            cleanedCount++;
          }
        } catch {
          // Skip invalid cache files
          continue;
        }
      }

      return { success: true, data: cleanedCount };
    } catch (error) {
      return { 
        success: false, 
        error: new Error(`Failed to cleanup expired cache: ${error}`) 
      };
    }
  }
} 