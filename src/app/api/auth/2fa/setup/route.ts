import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getUser, saveTwoFactorSecret } from '@/lib/auth/user-store';
import {
  generateSecret,
  generateQRCode,
  encryptSecret,
  generateRecoveryCodes,
} from '@/lib/auth/totp-service';

/**
 * POST /api/auth/2fa/setup
 * Initialize 2FA setup - returns QR code, secret, and recovery codes
 * Requires authenticated session
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function POST(_request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession();
    if (!session?.user?.name) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Generate TOTP secret and QR code
    const { secret, otpAuthUrl } = generateSecret(user.username);
    const qrCode = await generateQRCode(otpAuthUrl);

    // Generate recovery codes
    const { plain: recoveryCodes, hashed: hashedRecoveryCodes } = await generateRecoveryCodes(10);

    // Encrypt and save the secret (not enabled yet)
    const encryptedSecret = encryptSecret(secret);
    await saveTwoFactorSecret(encryptedSecret, hashedRecoveryCodes);

    return NextResponse.json({
      qrCode,
      secret, // Plain secret for manual entry
      recoveryCodes, // Plain recovery codes for user to save
    });
  } catch (error) {
    console.error('[2FA Setup] Error:', error);
    return NextResponse.json({ error: 'Failed to initialize 2FA setup' }, { status: 500 });
  }
}
