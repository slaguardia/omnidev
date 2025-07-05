'use server'; 

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth';

const dataDir = path.resolve(process.cwd(), 'data');
const file = path.resolve(dataDir, 'api-keys.json');

async function ensureDataDir() {
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
  }
}

export async function getApiKeys() {
  try {
    await ensureDataDir();
    const data = await fs.readFile(file, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export async function generateAndSaveApiKey() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user?.name) {
    throw new Error('Unauthorized - please sign in to generate an API key');
  }

  // Generate a 64-byte (512-bit) cryptographically secure random key
  // Convert to base64url for a URL-safe 86-character string
  const key = crypto.randomBytes(64).toString('base64url');
  
  await ensureDataDir();

  // Revoke all existing keys by creating a new array with only the new key
  const keys = [{
    key,
    userId: session.user.name,
    createdAt: new Date().toISOString(),
  }];

  await fs.writeFile(file, JSON.stringify(keys, null, 2));
  return key;
}

export async function findApiKey(keyToMatch: string) {
  const keys = await getApiKeys();
  return keys.find((k: { key: string }) => k.key === keyToMatch);
}
