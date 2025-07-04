import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { validateApiKey, checkRateLimit, checkIpWhitelist, type AuthResult } from './api-auth';

/**
 * Enhanced authentication check for API routes that supports both NextAuth sessions and API keys
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
        )
      };
    }

    // 2. Try NextAuth session first (for UI requests)
    console.log(`[AUTH] Checking NextAuth session...`);
    try {
      const tokenParams: { req: NextRequest; secret?: string } = { req: request };
      if (process.env.NEXTAUTH_SECRET) {
        tokenParams.secret = process.env.NEXTAUTH_SECRET;
      }
      
      const token = await getToken(tokenParams);
      
      if (token) {
        console.log(`[AUTH] NextAuth session found for user: ${token.name} (${token.id})`);
        
        // Create AuthResult compatible with existing code
        const sessionAuthResult: AuthResult = {
          success: true,
          userId: `session-${token.id}`,
          clientName: token.name || 'UI User'
        };
        
        // Check rate limits for session users
        const rateLimitResult = await checkRateLimit(sessionAuthResult.userId!);
        if (!rateLimitResult.allowed) {
          console.log(`[AUTH] Rate limit exceeded for session user: ${sessionAuthResult.userId}`);
          return {
            success: false,
            response: NextResponse.json(
              { 
                error: 'Rate limit exceeded. Please try again later.',
                retryAfter: 3600 // 1 hour in seconds
              },
              { 
                status: 429,
                headers: {
                  'Retry-After': '3600'
                }
              }
            )
          };
        }

        return {
          success: true,
          auth: sessionAuthResult
        };
      }
    } catch (sessionError) {
      console.log(`[AUTH] NextAuth session check failed:`, sessionError);
      // Continue to API key validation
    }

    // 3. Fallback to API key validation (for external API calls)
    console.log(`[AUTH] No valid session found, checking API key...`);
    const authResult = await validateApiKey(request);
    if (!authResult.success) {
      console.log(`[AUTH] Authentication failed: ${authResult.error}`);
      return {
        success: false,
        response: NextResponse.json(
          { error: 'Authentication required. Please sign in or provide a valid API key.' },
          { status: 401 }
        )
      };
    }

    // 4. Check rate limits for API key users
    const rateLimitResult = await checkRateLimit(authResult.userId!);
    if (!rateLimitResult.allowed) {
      console.log(`[AUTH] Rate limit exceeded for API key user: ${authResult.userId}`);
      return {
        success: false,
        response: NextResponse.json(
          { 
            error: 'Rate limit exceeded. Please try again later.',
            retryAfter: 3600 // 1 hour in seconds
          },
          { 
            status: 429,
            headers: {
              'Retry-After': '3600'
            }
          }
        )
      };
    }

    console.log(`[AUTH] API key authentication successful for user: ${authResult.clientName} (${authResult.userId})`);

    return {
      success: true,
      auth: authResult
    };
  } catch (error) {
    console.error(`[AUTH] Authentication error:`, error);
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Authentication service error' },
        { status: 500 }
      )
    };
  }
}

 