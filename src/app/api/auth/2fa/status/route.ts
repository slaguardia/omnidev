import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getTwoFactorStatus } from '@/lib/auth/user-store';

/**
 * GET /api/auth/2fa/status
 * Get current 2FA status
 * Requires authenticated session
 */
export async function GET() {
  try {
    // Check authentication
    const session = await getServerSession();
    if (!session?.user?.name) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const status = await getTwoFactorStatus();

    return NextResponse.json(status);
  } catch (error) {
    console.error('[2FA Status] Error:', error);
    return NextResponse.json({ error: 'Failed to get 2FA status' }, { status: 500 });
  }
}
