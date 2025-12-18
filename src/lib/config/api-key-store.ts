// lib/apiKeyStore.ts
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { hash } from 'bcryptjs';

const workspaceDir = path.resolve(process.cwd(), 'workspaces');
const file = path.resolve(workspaceDir, 'api-keys.json');

async function ensureWorkspaceDir() {
  try {
    await fs.access(workspaceDir);
  } catch {
    await fs.mkdir(workspaceDir, { recursive: true });
  }
}

export interface StoredApiKeyRecord {
  userId: string;
  createdAt: string;
  /**
   * bcrypt hash of the API key (preferred).
   * The plaintext key is only ever shown once at creation time.
   */
  keyHash: string;
}

export interface LegacyStoredApiKeyRecord {
  userId: string;
  createdAt: string;
  /**
   * Legacy plaintext key storage (deprecated).
   * Kept only for backwards compatibility with older installations.
   */
  key: string;
}

type AnyStoredKeyRecord = StoredApiKeyRecord | LegacyStoredApiKeyRecord;

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

export async function getApiKeys() {
  try {
    await ensureWorkspaceDir();
    const data = await fs.readFile(file, 'utf-8');
    return parseStoredKeys(JSON.parse(data) as unknown);
  } catch {
    return [];
  }
}

export async function saveApiKey(userId: string) {
  // Generate a 64-byte (512-bit) cryptographically secure random key
  // Convert to base64url for a URL-safe 86-character string
  const key = crypto.randomBytes(64).toString('base64url');
  const keyHash = await hash(key, 10);

  await ensureWorkspaceDir();

  // Revoke all existing keys by creating a new array with only the new key
  const keys: StoredApiKeyRecord[] = [{ keyHash, userId, createdAt: new Date().toISOString() }];

  await fs.writeFile(file, JSON.stringify(keys, null, 2));
  return key;
}

export async function findApiKey(keyToMatch: string) {
  const keys = await getApiKeys();
  // Plaintext keys are no longer searchable here; validation happens in the auth layer.
  // This function is retained for backwards compatibility but will only match legacy entries.
  return keys.find((k) => 'key' in k && k.key === keyToMatch);
}
