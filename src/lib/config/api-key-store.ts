// lib/apiKeyStore.ts
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const workspaceDir = path.resolve(process.cwd(), 'workspaces');
const file = path.resolve(workspaceDir, 'api-keys.json');

async function ensureWorkspaceDir() {
  try {
    await fs.access(workspaceDir);
  } catch {
    await fs.mkdir(workspaceDir, { recursive: true });
  }
}

export async function getApiKeys() {
  try {
    await ensureWorkspaceDir();
    const data = await fs.readFile(file, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export async function saveApiKey(userId: string) {
  // Generate a 64-byte (512-bit) cryptographically secure random key
  // Convert to base64url for a URL-safe 86-character string
  const key = crypto.randomBytes(64).toString('base64url');
  
  await ensureWorkspaceDir();
  
  // Revoke all existing keys by creating a new array with only the new key
  const keys = [{
    key,
    userId,
    createdAt: new Date().toISOString(),
  }];

  await fs.writeFile(file, JSON.stringify(keys, null, 2));
  return key;
}

export async function findApiKey(keyToMatch: string) {
  const keys = await getApiKeys();
  return keys.find((k: { key: string }) => k.key === keyToMatch);
}
