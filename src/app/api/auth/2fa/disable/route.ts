import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import {
  verifyUser,
  disableTwoFactor,
  getTwoFactorSecret,
  getTwoFactorStatus,
} from '@/lib/auth/user-store';
import { verifyToken, decryptSecret } from '@/lib/auth/totp-service';

/**
 * POST /api/auth/2fa/disable
 * Disable 2FA - requires password and TOTP code for security
 * Body: { password: string, token: string }
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession();
    if (!session?.user?.name) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { password, token } = body;

    if (!password || !token) {
      return NextResponse.json({ error: 'Password and token are required' }, { status: 400 });
    }

    // Check if 2FA is enabled
    const status = await getTwoFactorStatus();
    if (!status.enabled) {
      return NextResponse.json({ error: '2FA is not enabled' }, { status: 400 });
    }

    // Verify password
    const username = session.user.name;
    const isPasswordValid = await verifyUser(username, password);
    if (!isPasswordValid) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 400 });
    }

    // Verify TOTP
    const encryptedSecret = await getTwoFactorSecret();
    if (!encryptedSecret) {
      return NextResponse.json({ error: '2FA secret not found' }, { status: 400 });
    }

    const secret = decryptSecret(encryptedSecret);
    const isTokenValid = verifyToken(secret, token.replace(/\s/g, ''));
    if (!isTokenValid) {
      return NextResponse.json({ error: 'Invalid verification code' }, { status: 400 });
    }

    // Disable 2FA
    await disableTwoFactor();

    return NextResponse.json({ success: true, message: '2FA disabled successfully' });
  } catch (error) {
    console.error('[2FA Disable] Error:', error);
    return NextResponse.json({ error: 'Failed to disable 2FA' }, { status: 500 });
  }
}
