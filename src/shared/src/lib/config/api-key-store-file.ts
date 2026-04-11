import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { hash } from 'bcryptjs';

const dataDir = path.resolve(process.cwd(), 'data');
export const API_KEYS_FILE = path.resolve(dataDir, 'api-keys.json');

async function ensureDataDir() {
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
  }
}

export interface StoredApiKeyRecord {
  userId: string;
  createdAt: string;
  keyHash: string;
}

export interface LegacyStoredApiKeyRecord {
  userId: string;
  createdAt: string;
  key: string;
}

export type AnyStoredKeyRecord = StoredApiKeyRecord | LegacyStoredApiKeyRecord;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseStoredKeys(data: unknown): AnyStoredKeyRecord[] {
  if (!Array.isArray(data)) return [];
  const out: AnyStoredKeyRecord[] = [];
  for (const item of data) {
    if (!isObject(item)) continue;
    const userId = item.userId;
    const createdAt = item.createdAt;
    if (typeof userId !== 'string' || typeof createdAt !== 'string') continue;

    if (typeof item.keyHash === 'string') {
      out.push({ userId, createdAt, keyHash: item.keyHash });
      continue;
    }
    if (typeof item.key === 'string') {
      out.push({ userId, createdAt, key: item.key });
      continue;
    }
  }
  return out;
}

export async function getApiKeys(): Promise<AnyStoredKeyRecord[]> {
  try {
    await ensureDataDir();
    const data = await fs.readFile(API_KEYS_FILE, 'utf-8');
    return parseStoredKeys(JSON.parse(data) as unknown);
  } catch {
    return [];
  }
}

export async function saveApiKey(userId: string): Promise<string> {
  const key = crypto.randomBytes(64).toString('base64url');
  const keyHash = await hash(key, 10);

  await ensureDataDir();

  const keys: StoredApiKeyRecord[] = [{ keyHash, userId, createdAt: new Date().toISOString() }];

  await fs.writeFile(API_KEYS_FILE, JSON.stringify(keys, null, 2));
  return key;
}

export async function findApiKey(keyToMatch: string): Promise<AnyStoredKeyRecord | undefined> {
  const keys = await getApiKeys();
  return keys.find((k) => 'key' in k && k.key === keyToMatch);
}
