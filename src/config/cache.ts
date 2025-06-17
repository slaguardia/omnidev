import type { CacheOptions } from '@/managers/CacheManager';

/**
 * Centralized cache configuration for the application
 */
export const CACHE_CONFIG: CacheOptions = {
  expiryDays: 7,
  maxCacheSize: 100 * 1024 * 1024, // 100MB
  includePatterns: ['**/*.ts', '**/*.js', '**/*.json', '**/*.md', '**/*.yml', '**/*.yaml'],
  excludePatterns: ['node_modules/**', '.git/**', '**/.DS_Store', '.next/**', '**/.next/**']
}; 