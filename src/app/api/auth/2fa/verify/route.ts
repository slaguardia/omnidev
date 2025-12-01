import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { enableTwoFactor, getTwoFactorSecret } from '@/lib/auth/user-store';
import { verifyToken, decryptSecret } from '@/lib/auth/totp-service';

/**
 * POST /api/auth/2fa/verify
 * Verify TOTP token during setup and enable 2FA
 * Body: { token: string }
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession();
    if (!session?.user?.name) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { token } = body;

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    // Get the encrypted secret
    const encryptedSecret = await getTwoFactorSecret();
    if (!encryptedSecret) {
      return NextResponse.json({ error: '2FA setup not initialized' }, { status: 400 });
    }

    // Decrypt and verify
    const secret = decryptSecret(encryptedSecret);
    const isValid = verifyToken(secret, token.replace(/\s/g, ''));

    if (!isValid) {
      return NextResponse.json({ error: 'Invalid verification code' }, { status: 400 });
    }

    // Enable 2FA
    await enableTwoFactor();

    return NextResponse.json({ success: true, message: '2FA enabled successfully' });
  } catch (error) {
    console.error('[2FA Verify] Error:', error);
    return NextResponse.json({ error: 'Failed to verify 2FA' }, { status: 500 });
  }
}
