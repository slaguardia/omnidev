'use server';

import { resolve } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';

export interface AuthResult {
  success: boolean;
  error?: string;
  userId?: string;
  clientName?: string;
}

interface StoredApiKey {
  key: string;
  userId: string;
  createdAt: string;
}

/**
 * Load API keys from the stored api-keys.json file
 */
function loadStoredApiKeys(): StoredApiKey[] {
  try {
    const apiKeysPath = resolve(process.cwd(), 'workspaces', 'api-keys.json');
    if (!existsSync(apiKeysPath)) {
      return [];
    }
    const data = readFileSync(apiKeysPath, 'utf-8');
    return JSON.parse(data) as StoredApiKey[];
  } catch (error) {
    console.error('Failed to load stored API keys:', error);
    return [];
  }
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

  // Load API keys from stored file (dashboard-generated keys)
  const storedApiKeys = loadStoredApiKeys();

  // Also check environment variables for backwards compatibility
  const envApiKeys = process.env.VALID_API_KEYS?.split(',').filter((k) => k.trim()) || [];
  const adminApiKey = process.env.ADMIN_API_KEY;

  // Check if provided key matches a stored key (from dashboard)
  const matchedStoredKey = storedApiKeys.find((k) => k.key === apiKey);
  if (matchedStoredKey) {
    return {
      success: true,
      userId: matchedStoredKey.userId,
      clientName: matchedStoredKey.userId,
    };
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _clientId: string
): Promise<{ allowed: boolean; remaining?: number }> {
  // For a production app, you'd want to use Redis or a proper rate limiting service
  // This is a basic in-memory implementation
  const maxRequests = parseInt(process.env.API_RATE_LIMIT || '100'); // requests per hour

  // In production, implement proper rate limiting with Redis/database
  // For now, return allowed
  return { allowed: true, remaining: maxRequests };
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
