/**
 * API key persistence — PostgreSQL when DATABASE_URL is set, else `data/api-keys.json`.
 */

import { isPrismaConfigured } from '@/lib/db/prisma';
import * as file from './api-key-store-file';
import * as pg from './api-key-store-pg';

export type {
  StoredApiKeyRecord,
  LegacyStoredApiKeyRecord,
  AnyStoredKeyRecord,
} from './api-key-store-file';

export { API_KEYS_FILE } from './api-key-store-file';

/** Path to legacy JSON file, or `null` when keys are stored in Postgres (no file migration writes). */
export function getApiKeysStoragePath(): string | null {
  return isPrismaConfigured() ? null : file.API_KEYS_FILE;
}

export async function getApiKeys(): Promise<file.AnyStoredKeyRecord[]> {
  return isPrismaConfigured() ? pg.getApiKeys() : file.getApiKeys();
}

export async function saveApiKey(userId: string): Promise<string> {
  return isPrismaConfigured() ? pg.saveApiKey(userId) : file.saveApiKey(userId);
}

export async function findApiKey(keyToMatch: string): Promise<file.AnyStoredKeyRecord | undefined> {
  return isPrismaConfigured() ? pg.findApiKey(keyToMatch) : file.findApiKey(keyToMatch);
}
