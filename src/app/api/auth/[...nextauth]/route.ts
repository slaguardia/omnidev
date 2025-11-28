import NextAuth, { NextAuthOptions, Session, User } from 'next-auth';
import { JWT } from 'next-auth/jwt';
import CredentialsProvider from 'next-auth/providers/credentials';
import { getUser, saveUser, verifyUser } from '@/lib/auth/user-store';

// Check if we have the required secret
if (!process.env.NEXTAUTH_SECRET) {
  console.error('[AUTH] NEXTAUTH_SECRET is not set. Authentication will not work properly.');
  console.error(
    '[AUTH] Make sure the Docker entrypoint script is running and NEXTAUTH_SECRET_FILE is configured.'
  );
} else {
  console.log(
    '[AUTH] NEXTAUTH_SECRET is properly configured (length:',
    process.env.NEXTAUTH_SECRET.length,
    'characters)'
  );
}

// This API route is used for authentication
const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt' as const },
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const { username, password } = credentials || {};
        if (!username || !password) return null;

        console.log('[AUTH] Attempting to authorize user:', username);

        const existingUser = await getUser();

        if (!existingUser) {
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
        if (isValid) {
          console.log('[AUTH] User authenticated successfully:', username);
          return { id: existingUser.username, name: existingUser.username };
        }

        console.log('[AUTH] Authentication failed for user:', username);
        return null;
      },
    }),
  ],
  pages: {
    signIn: '/signin',
  },
  callbacks: {
    async session({ session, token }: { session: Session; token: JWT }) {
      // Only log when there's a significant change or issue
      if (!token) {
        console.log('[AUTH] Session callback - no token available');
        return session;
      }

      if (session.user) {
        (session.user as { id?: string; name?: string | null; email?: string | null }).id =
          token.id as string;
        (session.user as { id?: string; name?: string | null; email?: string | null }).name =
          token.name as string;
        (session.user as { id?: string; name?: string | null; email?: string | null }).email = null; // Clear email since we're using username
        console.log('[AUTH] Session callback - session updated for user:', token.name);
      }
      return session;
    },
    async jwt({ token, user }: { token: JWT; user?: User }) {
      // Only log when user is present (initial auth) or when there's an issue
      if (user) {
        console.log('[AUTH] JWT callback - setting user data for:', user.name);
        token.id = user.id;
        token.name = user.name || null;
      }
      return token;
    },
    async redirect({ url, baseUrl }: { url: string; baseUrl: string }) {
      console.log('url', url);
      console.log('baseUrl', baseUrl);

      // Let NextAuth handle redirects with default behavior
      return url;
    },
  },
  debug: process.env.NODE_ENV === 'development',
};

// Add secret at runtime if available
if (process.env.NEXTAUTH_SECRET) {
  authOptions.secret = process.env.NEXTAUTH_SECRET;
}

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
