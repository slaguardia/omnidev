/**
 * Build-time utilities
 */

/**
 * Check if we're currently in the build phase
 */
export function isBuildTime(): boolean {
  return (
    process.env.NEXT_PHASE === 'phase-production-build' ||
    (process.env.NODE_ENV === 'production' && !process.env.VERCEL_ENV)
  );
}

/**
 * Check if environment variables are required
 * Returns false during build time to allow builds without runtime-only env vars
 */
export function requireRuntimeEnvVars(): boolean {
  return !isBuildTime();
}
