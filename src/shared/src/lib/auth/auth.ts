// Backwards-compatible re-export.
// Keep importing from `@/lib/auth/auth` across the codebase, but ensure the options are identical
// to what the NextAuth route handler uses.
export { authOptions } from '@/lib/auth/nextauth-options';
