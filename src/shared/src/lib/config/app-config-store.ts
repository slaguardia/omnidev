/**
 * App configuration — PostgreSQL when DATABASE_URL is set, else `data/app-config.json`.
 */

import type { AppConfig } from '@/lib/types/index';
import { isPrismaConfigured } from '@/lib/db/prisma';
import * as file from './app-config-store-file';
import * as pg from './app-config-store-pg';

export { APP_CONFIG_FILE } from './app-config-store-file';

/** Path to legacy JSON file, or `null` when config is stored in Postgres. */
export function getAppConfigStoragePath(): string | null {
  return isPrismaConfigured() ? null : file.APP_CONFIG_FILE;
}

export async function getConfig(): Promise<AppConfig> {
  return isPrismaConfigured() ? pg.getConfig() : file.loadConfig();
}

export async function saveConfig(config: AppConfig): Promise<void> {
  if (isPrismaConfigured()) {
    await pg.saveConfig(config);
  } else {
    file.saveConfig(config);
  }
}
