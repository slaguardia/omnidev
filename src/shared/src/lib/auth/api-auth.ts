'use server';

import { writeFileSync } from 'node:fs';
import { compare, hash } from 'bcryptjs';
import {
  getApiKeys,
  getApiKeysStoragePath,
  type AnyStoredKeyRecord,
} from '@/lib/config/api-key-store';

export interface StageTokenAuth {
  tokenId: string;
  jobId: string;
  taskId: string;
  permissions: import('@/lib/types/index').CliPermission[];
}

export interface AuthResult {
  success: boolean;
  error?: string;
  userId?: string;
  clientName?: string;
  /** Present when authenticated via a scoped stage token (X-CLI-Token header) */
  stageToken?: StageTokenAuth;
}

/**
 * Validate API key from request headers
 */
export async function validateApiKey(request: Request): Promise<AuthResult> {
  const apiKey =
    request.headers.get('x-api-key') ||
    request.headers.get('authorization')?.replace('Bearer ', '');

  if (!apiKey) {
    return {
      success: false,
      error: 'API key is required. Provide it via x-api-key header or Authorization: Bearer token',
    };
  }

  const storedApiKeys = await getApiKeys();
  const apiKeysPath = getApiKeysStoragePath();

  // Also check environment variables for backwards compatibility
  const envApiKeys = process.env.VALID_API_KEYS?.split(',').filter((k) => k.trim()) || [];
  const adminApiKey = process.env.ADMIN_API_KEY;

  // Check if provided key matches a stored key (from dashboard or Postgres)
  for (const stored of storedApiKeys) {
    // Preferred: hashed key
    if ('keyHash' in stored) {
      const isMatch = await compare(apiKey, stored.keyHash);
      if (isMatch) {
        return {
          success: true,
          userId: stored.userId,
          clientName: stored.userId,
        };
      }
      continue;
    }

    // Legacy: plaintext key (deprecated). If matched, migrate to a hash on file storage only.
    if (stored.key === apiKey && apiKeysPath) {
      try {
        const migratedHash = await hash(apiKey, 10);
        const migrated: AnyStoredKeyRecord[] = storedApiKeys.map((k) => {
          if ('key' in k && k.key === apiKey && k.userId === stored.userId) {
            return { userId: k.userId, createdAt: k.createdAt, keyHash: migratedHash };
          }
          return k;
        });
        writeFileSync(apiKeysPath, JSON.stringify(migrated, null, 2));
      } catch (migrateError) {
        console.warn('[AUTH] Failed to migrate legacy API key to hash:', migrateError);
      }

      return {
        success: true,
        userId: stored.userId,
        clientName: stored.userId,
      };
    }
  }

  // Check if provided key matches admin key from env
  if (adminApiKey && apiKey === adminApiKey) {
    return {
      success: true,
      userId: 'admin',
      clientName: 'Admin',
    };
  }

  // Check if provided key matches env variable keys
  if (envApiKeys.includes(apiKey)) {
    const keyIndex = envApiKeys.indexOf(apiKey);
    return {
      success: true,
      userId: `client-${keyIndex}`,
      clientName: `Client ${keyIndex + 1}`,
    };
  }

  // No valid keys configured at all
  if (!storedApiKeys.length && !envApiKeys.length && !adminApiKey) {
    console.error(
      'No API keys configured. Generate one in the dashboard or set environment variables.'
    );
    return {
      success: false,
      error: 'Authentication service not configured. Please generate an API key in the dashboard.',
    };
  }

  return {
    success: false,
    error: 'Invalid API key',
  };
}

/**
 * Rate limiting check (basic implementation)
 */
export async function checkRateLimit(
  clientId: string
): Promise<{ allowed: boolean; remaining?: number }> {
  const maxRequests = parseInt(process.env.API_RATE_LIMIT || '100'); // requests per hour

  const windowMs = 60 * 60 * 1000; // 1 hour
  const now = Date.now();

  type Bucket = { windowStart: number; count: number };
  const globalKey = '__workflow_rate_limit__';
  const store = (globalThis as unknown as Record<string, unknown>)[globalKey];

  const buckets: Map<string, Bucket> =
    store instanceof Map ? (store as Map<string, Bucket>) : new Map<string, Bucket>();
  (globalThis as unknown as Record<string, unknown>)[globalKey] = buckets;

  const current = buckets.get(clientId);
  if (!current || now - current.windowStart >= windowMs) {
    buckets.set(clientId, { windowStart: now, count: 1 });
    return { allowed: true, remaining: Math.max(0, maxRequests - 1) };
  }

  if (current.count >= maxRequests) {
    return { allowed: false, remaining: 0 };
  }

  const nextCount = current.count + 1;
  buckets.set(clientId, { windowStart: current.windowStart, count: nextCount });
  return { allowed: true, remaining: Math.max(0, maxRequests - nextCount) };
}

/**
 * IP whitelist check
 */
export async function checkIpWhitelist(request: Request): Promise<boolean> {
  const allowedIps = process.env.ALLOWED_IPS?.split(',') || [];

  if (!allowedIps.length) {
    return true; // If no IP whitelist is configured, allow all
  }

  // Get client IP from various possible headers
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const clientIp = forwarded?.split(',')[0] || realIp || 'unknown';

  return allowedIps.includes(clientIp) || allowedIps.includes('*');
}
