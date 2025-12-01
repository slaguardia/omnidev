import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from './auth';
import { validateApiKey, checkRateLimit, checkIpWhitelist, type AuthResult } from './api-auth';

/**
 * Simple authentication check for API routes
 * Supports both session-based auth (for dashboard) and API key auth (for external clients)
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

    // 2. First, check for NextAuth session (dashboard users)
    const session = await getServerSession(authOptions);
    if (session?.user) {
      console.log(`[AUTH] Session authentication successful for user: ${session.user.name}`);
      return {
        success: true,
        auth: {
          success: true,
          userId: session.user.name || 'session-user',
          clientName: session.user.name || 'Dashboard User',
        },
      };
    }

    // 3. Fall back to API key validation (external clients)
    const authResult = await validateApiKey(request);
    if (!authResult.success) {
      console.log(`[AUTH] Authentication failed: ${authResult.error}`);
      return {
        success: false,
        response: NextResponse.json({ error: authResult.error }, { status: 401 }),
      };
    }

    // 4. Check rate limits
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
