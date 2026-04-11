import crypto from 'crypto';
import { hash } from 'bcryptjs';
import { nanoid } from 'nanoid';
import { prisma } from '@/lib/db/prisma';
import type { AnyStoredKeyRecord, StoredApiKeyRecord } from './api-key-store-file';

export async function getApiKeys(): Promise<AnyStoredKeyRecord[]> {
  const rows = await prisma.omnidevApiKey.findMany({ orderBy: { createdAt: 'asc' } });
  return rows.map(
    (r): StoredApiKeyRecord => ({
      userId: r.name ?? 'user',
      createdAt: r.createdAt,
      keyHash: r.keyHash,
    })
  );
}

export async function saveApiKey(userId: string): Promise<string> {
  const key = crypto.randomBytes(64).toString('base64url');
  const keyHash = await hash(key, 10);
  const now = new Date().toISOString();

  await prisma.$transaction([
    prisma.omnidevApiKey.deleteMany(),
    prisma.omnidevApiKey.create({
      data: {
        id: nanoid(16),
        keyHash,
        name: userId,
        createdAt: now,
        data: '{}',
      },
    }),
  ]);

  return key;
}

export async function findApiKey(_keyToMatch: string): Promise<AnyStoredKeyRecord | undefined> {
  const keys = await getApiKeys();
  return keys.find((k) => 'key' in k && k.key === _keyToMatch);
}
