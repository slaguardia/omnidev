import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

import { isJwtUserStillValid } from '@/lib/auth/session-user-guard';

/**
 * GET /api/auth/session-health
 *
 * Validates that a present session cookie still matches the user store (file or DB).
 * Called from Edge middleware (which cannot read the store) to clear stale JWTs after
 * volume loss or user deletion.
 */
export async function GET(request: NextRequest) {
  try {
    const tokenParams: { req: NextRequest; secret?: string } = { req: request };
    if (process.env.NEXTAUTH_SECRET) {
      tokenParams.secret = process.env.NEXTAUTH_SECRET;
    }
    const token = await getToken(tokenParams);
    if (!token) {
      return NextResponse.json({ ok: false, reason: 'no-token' }, { status: 401 });
    }

    let valid: boolean;
    try {
      valid = await isJwtUserStillValid(token);
    } catch (error) {
      console.error('[AUTH] Session-health: user store error:', error);
      return NextResponse.json({ ok: false, reason: 'store-error' }, { status: 503 });
    }
    if (!valid) {
      console.warn('[AUTH] Session-health: JWT does not match user store');
      return NextResponse.json({ ok: false, reason: 'user-mismatch' }, { status: 401 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[AUTH] Session-health error:', error);
    return NextResponse.json({ ok: false, reason: 'error' }, { status: 500 });
  }
}
