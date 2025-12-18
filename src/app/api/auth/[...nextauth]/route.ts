import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth/nextauth-options';

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

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
