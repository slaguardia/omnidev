import type { getServerSession as GetServerSessionFn } from 'next-auth';

/** Avoid Next.js `headers()` / request scope when integration tests exercise `withAuth` + API keys. */
export const getServerSession: typeof GetServerSessionFn = async () => null;
