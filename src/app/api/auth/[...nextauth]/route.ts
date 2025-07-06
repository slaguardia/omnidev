import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import type { NextAuthOptions } from "next-auth";
import type { JWT } from "next-auth/jwt";
import type { Session, User } from "next-auth";
import { getUser, saveUser, verifyUser } from "@/lib/auth/user-store";

// Extend NextAuth types to include id in user
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string;
      email: string | null;
    };
  }

  interface User {
    id: string;
    name: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    name: string;
  }
}

// Check if we have the required secret
if (!process.env.NEXTAUTH_SECRET) {
  console.error('[AUTH] NEXTAUTH_SECRET is not set. Authentication will not work properly.');
  console.error('[AUTH] Make sure the Docker entrypoint script is running and NEXTAUTH_SECRET_FILE is configured.');
} else {
  console.log('[AUTH] NEXTAUTH_SECRET is properly configured (length:', process.env.NEXTAUTH_SECRET.length, 'characters)');
}

// This API route is used for authentication
const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" as const },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
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
    signIn: "/signin",
  },
  callbacks: {
    async session({ session, token }: { session: Session; token: JWT }) {
      // Only log when there's a significant change or issue
      if (!token) {
        console.log('[AUTH] Session callback - no token available');
        return session;
      }
      
      if (session.user) {
        session.user.id = token.id;
        session.user.name = token.name;
        session.user.email = null; // Clear email since we're using username
        console.log('[AUTH] Session callback - session updated for user:', token.name);
      }
      return session;
    },
    async jwt({ token, user }: { token: JWT; user?: User }) {
      // Only log when user is present (initial auth) or when there's an issue
      if (user) {
        console.log('[AUTH] JWT callback - setting user data for:', user.name);
        token.id = user.id;
        token.name = user.name;
      }
      return token;
    },
    async redirect({url, baseUrl}: {url: string, baseUrl: string}) {
      console.log('[AUTH] Redirect callback - url:', url);
      console.log('[AUTH] Redirect callback - baseUrl:', baseUrl);
      
      // Validate and sanitize the URL
      try {
        // If url is relative, make it absolute with baseUrl
        if (url.startsWith('/')) {
          const redirectUrl = new URL(url, baseUrl);
          console.log('[AUTH] Redirect callback - constructed absolute URL:', redirectUrl.toString());
          return redirectUrl.toString();
        }
        
        // If url is absolute, validate it's a valid URL
        const parsedUrl = new URL(url);
        
        // Only allow redirects to the same origin for security
        const parsedBaseUrl = new URL(baseUrl);
        if (parsedUrl.origin !== parsedBaseUrl.origin) {
          console.log('[AUTH] Redirect callback - external URL blocked, redirecting to dashboard');
          return `${baseUrl}/dashboard`;
        }
        
        console.log('[AUTH] Redirect callback - validated URL:', parsedUrl.toString());
        return parsedUrl.toString();
      } catch (error) {
        console.error('[AUTH] Redirect callback - invalid URL, redirecting to dashboard:', error);
        return `${baseUrl}/dashboard`;
      }
    }
  },
  debug: process.env.NODE_ENV === 'development',
};

// Add secret at runtime if available
if (process.env.NEXTAUTH_SECRET) {
  authOptions.secret = process.env.NEXTAUTH_SECRET;
}

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST }; 