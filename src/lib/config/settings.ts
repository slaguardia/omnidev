'use server';

/**
 * Configuration management for GitLab Claude Manager
 * Server-side initialization only - client code should use server-actions
 */

import { initializeConfigSystem } from './server-actions';

/**
 * Check if running in development mode
 */
export async function isDevelopment(): Promise<boolean> {
  return process.env.NODE_ENV === 'development';
}

/**
 * Check if running in production mode
 */
export async function isProduction(): Promise<boolean> {
  return process.env.NODE_ENV === 'production';
}

/**
 * Initialize configuration system on server startup (non-blocking)
 */
async function initializeConfig(): Promise<void> {
  try {
    await initializeConfigSystem();

    if (await isDevelopment()) {
      console.log('Running in development mode');
      console.log('Configuration system ready');
    }
  } catch (error) {
    console.error('Configuration initialization failed:', error);
    // Don't exit - let the app start anyway
  }
}

// Initialize configuration system on import (non-blocking)
if (typeof window === 'undefined') {
  // Only run on server side
  initializeConfig();
}
