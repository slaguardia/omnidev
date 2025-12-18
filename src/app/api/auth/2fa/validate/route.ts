import { NextRequest, NextResponse } from 'next/server';
import { getTwoFactorSecret, getRecoveryCodes, markRecoveryCodeUsed } from '@/lib/auth/user-store';
import {
  verifyToken,
  decryptSecret,
  verifyPendingAuthToken,
  verifyRecoveryCode,
  generateSecondFactorToken,
} from '@/lib/auth/totp-service';

/**
 * POST /api/auth/2fa/validate
 * Validate TOTP during login flow
 * Body: { pendingToken: string, token: string, isRecoveryCode?: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { pendingToken, token, isRecoveryCode } = body;

    if (!pendingToken || !token) {
      return NextResponse.json(
        { error: 'Pending token and verification code are required' },
        { status: 400 }
      );
    }

    // Verify the pending auth token
    const pendingResult = verifyPendingAuthToken(pendingToken);
    if (!pendingResult.valid || !pendingResult.username) {
      return NextResponse.json(
        { error: 'Invalid or expired session. Please sign in again.' },
        { status: 401 }
      );
    }

    // Handle recovery code
    if (isRecoveryCode) {
      const recoveryCodes = await getRecoveryCodes();
      const result = await verifyRecoveryCode(token, recoveryCodes);

      if (!result.valid) {
        return NextResponse.json({ error: 'Invalid recovery code' }, { status: 400 });
      }

      // Mark the code as used
      await markRecoveryCodeUsed(result.index);

      const twoFactorToken = generateSecondFactorToken(pendingResult.username);
      return NextResponse.json({
        success: true,
        username: pendingResult.username,
        twoFactorToken,
        message: 'Recovery code verified',
      });
    }

    // Handle TOTP
    const encryptedSecret = await getTwoFactorSecret();
    if (!encryptedSecret) {
      return NextResponse.json({ error: '2FA not configured' }, { status: 400 });
    }

    const secret = decryptSecret(encryptedSecret);
    const isValid = verifyToken(secret, token.replace(/\s/g, ''));

    if (!isValid) {
      return NextResponse.json({ error: 'Invalid verification code' }, { status: 400 });
    }

    const twoFactorToken = generateSecondFactorToken(pendingResult.username);
    return NextResponse.json({
      success: true,
      username: pendingResult.username,
      twoFactorToken,
      message: '2FA verified successfully',
    });
  } catch (error) {
    console.error('[2FA Validate] Error:', error);
    return NextResponse.json({ error: 'Failed to validate 2FA' }, { status: 500 });
  }
}
