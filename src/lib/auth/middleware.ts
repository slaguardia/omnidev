import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey, checkRateLimit, checkIpWhitelist, type AuthResult } from './api-auth';

/**
 * Simple authentication check for API routes
 * Usage: const authResult = await withAuth(request); if (!authResult.success) return authResult.response;
 */
export async function withAuth(request: NextRequest): Promise<{
  success: boolean;
  response?: NextResponse;
  auth?: AuthResult;
}> {
  try {
    // 1. Check IP whitelist
    const ipAllowed = await checkIpWhitelist(request);
    if (!ipAllowed) {
      console.log(`[AUTH] Request blocked - IP not whitelisted`);
      return {
        success: false,
        response: NextResponse.json(
          { error: 'Access denied from this IP address' },
          { status: 403 }
        ),
      };
    }

    // 2. Validate API key
    const authResult = await validateApiKey(request);
    if (!authResult.success) {
      console.log(`[AUTH] Authentication failed: ${authResult.error}`);
      return {
        success: false,
        response: NextResponse.json({ error: authResult.error }, { status: 401 }),
      };
    }

    // 3. Check rate limits
    const rateLimitResult = await checkRateLimit(authResult.userId!);
    if (!rateLimitResult.allowed) {
      console.log(`[AUTH] Rate limit exceeded for user: ${authResult.userId}`);
      return {
        success: false,
        response: NextResponse.json(
          {
            error: 'Rate limit exceeded. Please try again later.',
            retryAfter: 3600, // 1 hour in seconds
          },
          {
            status: 429,
            headers: {
              'Retry-After': '3600',
            },
          }
        ),
      };
    }

    console.log(
      `[AUTH] Authentication successful for user: ${authResult.clientName} (${authResult.userId})`
    );

    return {
      success: true,
      auth: authResult,
    };
  } catch (error) {
    console.error(`[AUTH] Authentication error:`, error);
    return {
      success: false,
      response: NextResponse.json({ error: 'Authentication service error' }, { status: 500 }),
    };
  }
}
