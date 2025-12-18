import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth/nextauth-options';

const handler = NextAuth(authOptions);

let didLogSecretStatus = false;
function logNextAuthSecretStatusOnce(): void {
  if (didLogSecretStatus) return;
  didLogSecretStatus = true;

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    console.error('[AUTH] NEXTAUTH_SECRET is not set. Authentication will not work properly.');
    console.error(
      '[AUTH] Make sure the Docker entrypoint script is running and NEXTAUTH_SECRET_FILE is configured.'
    );
    return;
  }
  // Intentionally silent when properly configured: avoids leaking info and noisy logs.
}

type Handler = typeof handler;
type HandlerArgs = Parameters<Handler>;
type HandlerReturn = ReturnType<Handler>;

export function GET(...args: HandlerArgs): HandlerReturn {
  logNextAuthSecretStatusOnce();
  return handler(...args);
}

export function POST(...args: HandlerArgs): HandlerReturn {
  logNextAuthSecretStatusOnce();
  return handler(...args);
}
