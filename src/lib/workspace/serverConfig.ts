'use server';

import { join } from 'node:path';

/**
 * Get configuration directory path
 */
export async function getConfigDir(): Promise<string> {
  return join(process.cwd(), '.config');
}

/**
 * Get configuration file path
 */
export async function getConfigFile(): Promise<string> {
  const configDir = await getConfigDir();
  return join(configDir, 'environment.json');
}

/**
 * Get both config paths
 */
export async function getConfigPaths(): Promise<{
  CONFIG_DIR: string;
  CONFIG_FILE: string;
}> {
  const CONFIG_DIR = await getConfigDir();
  const CONFIG_FILE = await getConfigFile();
  return { CONFIG_DIR, CONFIG_FILE };
} 