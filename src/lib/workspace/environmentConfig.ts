'use server';

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { DEFAULT_CONFIG } from '@/lib/workspace/shared';
import { getConfigDir, getConfigFile } from '@/lib/workspace/serverConfig';
import type { EnvironmentConfig } from '@/lib/workspace/shared';

export async function getEnvironmentConfig(): Promise<EnvironmentConfig> {
  try {
    const configFile = await getConfigFile();
    if (existsSync(configFile)) {
      const fileContent = await readFile(configFile, 'utf-8');
      const config = JSON.parse(fileContent);
      
      // Merge with defaults to ensure all keys exist
      return { ...DEFAULT_CONFIG, ...config };
    }
  } catch (error) {
    console.warn('Failed to load environment config, using defaults:', error);
  }
  
  return DEFAULT_CONFIG;
}

export async function saveEnvironmentConfig(config: EnvironmentConfig): Promise<void> {
  try {
    const configDir = await getConfigDir();
    const configFile = await getConfigFile();
    
    // Ensure config directory exists
    if (!existsSync(configDir)) {
      await mkdir(configDir, { recursive: true });
    }
    
    // Save configuration
    await writeFile(configFile, JSON.stringify(config, null, 2), 'utf-8');
  } catch (error) {
    throw new Error(`Failed to save environment config: ${error}`);
  }
} 