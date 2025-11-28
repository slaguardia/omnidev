'use server';

export interface AuthResult {
  success: boolean;
  error?: string;
  userId?: string;
  clientName?: string;
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

  // Get API keys from environment variables
  const validApiKeys = process.env.VALID_API_KEYS?.split(',') || [];
  const adminApiKey = process.env.ADMIN_API_KEY;

  if (!validApiKeys.length && !adminApiKey) {
    console.error(
      'No API keys configured. Set VALID_API_KEYS or ADMIN_API_KEY environment variable.'
    );
    return {
      success: false,
      error: 'Authentication service not configured',
    };
  }

  // Check if provided key is valid
  const isValidKey = validApiKeys.includes(apiKey) || apiKey === adminApiKey;

  if (!isValidKey) {
    return {
      success: false,
      error: 'Invalid API key',
    };
  }

  // Determine user context based on key
  const isAdmin = apiKey === adminApiKey;
  const keyIndex = validApiKeys.indexOf(apiKey);

  return {
    success: true,
    userId: isAdmin ? 'admin' : `client-${keyIndex}`,
    clientName: isAdmin ? 'Admin' : `Client ${keyIndex + 1}`,
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
