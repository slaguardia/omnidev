import { NextRequest, NextResponse } from 'next/server';
import { verifyUser, getTwoFactorStatus, hasUser } from '@/lib/auth/user-store';
import { generatePendingAuthToken } from '@/lib/auth/totp-service';

/**
 * POST /api/auth/check-credentials
 * Validates credentials and returns 2FA status
 * Body: { username: string, password: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password are required' }, { status: 400 });
    }

    // Check if any user exists
    const userExists = await hasUser();
    if (!userExists) {
      // No user exists - this is a signup, proceed directly
      const requiresSetupToken = Boolean(process.env.INITIAL_SIGNUP_TOKEN);
      return NextResponse.json({
        success: true,
        isSignup: true,
        requires2FA: false,
        requiresSetupToken,
      });
    }

    // Verify credentials
    const isValid = await verifyUser(username, password);
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Check 2FA status
    const twoFactorStatus = await getTwoFactorStatus();
    if (twoFactorStatus.enabled) {
      // Generate pending auth token
      const pendingToken = generatePendingAuthToken(username);
      return NextResponse.json({
        success: true,
        requires2FA: true,
        pendingToken,
        hasRecoveryCodes: twoFactorStatus.hasRecoveryCodes,
      });
    }

    // No 2FA required
    return NextResponse.json({
      success: true,
      requires2FA: false,
    });
  } catch (error) {
    console.error('[Check Credentials] Error:', error);
    return NextResponse.json({ error: 'Failed to verify credentials' }, { status: 500 });
  }
}
