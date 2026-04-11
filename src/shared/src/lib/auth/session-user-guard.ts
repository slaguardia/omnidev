import type { JWT } from 'next-auth/jwt';

import { getUser } from '@/lib/auth/user-store';

/**
 * Returns the username carried in a NextAuth JWT from the credentials provider.
 */
export function getUsernameFromJwt(token: JWT | null): string | undefined {
  if (!token || token.sessionInvalid) return undefined;
  const id = token.id as string | undefined;
  const sub = token.sub as string | undefined;
  return id ?? sub;
}

/**
 * True when the JWT still matches the on-disk user (users.json).
 * Used to invalidate sessions after redeploy/data loss without waiting for cookie expiry.
 */
export async function isJwtUserStillValid(token: JWT | null): Promise<boolean> {
  const username = getUsernameFromJwt(token);
  if (!username) return false;
  const stored = await getUser();
  return stored !== null && stored.username === username;
}
