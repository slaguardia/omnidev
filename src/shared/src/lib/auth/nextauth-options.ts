import type { NextAuthOptions, Session, User } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import CredentialsProvider from 'next-auth/providers/credentials';
import { getUser, saveUser, verifyUser } from '@/lib/auth/user-store';
import { getUsernameFromJwt, isJwtUserStillValid } from '@/lib/auth/session-user-guard';
import { verifySecondFactorToken } from '@/lib/auth/totp-service';

/**
 * Single source of truth for NextAuth configuration.
 *
 * IMPORTANT:
 * - Any route calling getServerSession() must use the same authOptions as the NextAuth handler.
 * - This ensures JWT cookies/tokens are validated consistently (incl. 2FA + setup token flows).
 */
export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt' as const },
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
        twoFactorToken: { label: '2FA Token', type: 'text' },
        setupToken: { label: 'Setup Token', type: 'text' },
      },
      async authorize(credentials) {
        const { username, password, twoFactorToken, setupToken } = credentials || {};
        if (!username || !password) return null;

        console.log('[AUTH] Attempting to authorize user:', username);

        const existingUser = await getUser();

        if (!existingUser) {
          // Optional hardening: if INITIAL_SIGNUP_TOKEN is set, require it for first-user creation.
          const required = process.env.INITIAL_SIGNUP_TOKEN;
          if (required) {
            if (!setupToken || typeof setupToken !== 'string' || setupToken !== required) {
              console.log('[AUTH] Initial signup blocked - missing/invalid setup token');
              return null;
            }
          }

          // No user exists — allow initial signup
          try {
            const newUser = await saveUser(username, password);
            console.log('[AUTH] Created new user:', username);
            return { id: newUser.username, name: newUser.username };
          } catch (error) {
            console.error('Error creating user:', error);
            return null;
          }
        }

        // Only allow login for matching credentials
        const isValid = await verifyUser(username, password);
        if (!isValid) {
          console.log('[AUTH] Authentication failed for user:', username);
          return null;
        }

        // If 2FA is enabled, require a valid second factor token.
        // This prevents bypassing the 2FA UI flow by calling NextAuth directly.
        if (existingUser.twoFactor?.enabled) {
          if (!twoFactorToken || typeof twoFactorToken !== 'string') {
            console.log('[AUTH] 2FA required but no second factor token provided:', username);
            return null;
          }
          const proof = verifySecondFactorToken(twoFactorToken);
          if (!proof.valid || proof.username !== username) {
            console.log('[AUTH] Invalid second factor token for user:', username);
            return null;
          }
        }

        console.log('[AUTH] User authenticated successfully:', username);
        return { id: existingUser.username, name: existingUser.username };
      },
    }),
  ],
  pages: {
    signIn: '/signin',
  },
  callbacks: {
    async session({ session, token }: { session: Session; token: JWT }) {
      if (!token) {
        console.log('[AUTH] Session callback - no token available');
        return session;
      }

      if (token.sessionInvalid) {
        console.log('[AUTH] Session callback - token marked invalid (user store missing)');
        return { ...session, user: undefined } as unknown as Session;
      }

      const jwtName = getUsernameFromJwt(token);
      if (!jwtName) {
        return { ...session, user: undefined } as unknown as Session;
      }

      const stored = await getUser();
      if (!stored || stored.username !== jwtName) {
        console.log(
          '[AUTH] Session callback - user store missing or mismatch, clearing session user'
        );
        return { ...session, user: undefined } as unknown as Session;
      }

      if (session.user) {
        (session.user as { id?: string; name?: string | null; email?: string | null }).id =
          token.id as string;
        (session.user as { id?: string; name?: string | null; email?: string | null }).name =
          token.name as string;
        (session.user as { id?: string; name?: string | null; email?: string | null }).email = null;
        console.log('[AUTH] Session callback - session updated for user:', token.name);
      }
      return session;
    },
    async jwt({ token, user }: { token: JWT; user?: User }) {
      if (user) {
        console.log('[AUTH] JWT callback - setting user data for:', user.name);
        token.id = user.id;
        token.name = user.name || null;
        delete token.sessionInvalid;
        return token;
      }

      // Refresh: drop session if users.json was removed or replaced (e.g. volume loss, redeploy).
      if (token.id || token.sub) {
        const stillValid = await isJwtUserStillValid(token);
        if (!stillValid) {
          console.warn('[AUTH] JWT callback - invalidating token (no matching user in store)');
          token.sessionInvalid = true;
          delete token.id;
          token.name = null;
          delete token.sub;
        }
      }

      return token;
    },
    async redirect({ url }: { url: string; baseUrl: string }) {
      // Let NextAuth handle redirects with default behavior
      return url;
    },
  },
  debug: process.env.NODE_ENV === 'development',
};

// Ensure NextAuth secret is wired into the same options object used by getServerSession().
if (process.env.NEXTAUTH_SECRET) {
  authOptions.secret = process.env.NEXTAUTH_SECRET;
}
