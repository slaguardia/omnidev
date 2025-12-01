/**
 * Next.js Instrumentation Hook
 *
 * This file runs when the Next.js server starts.
 * Used to initialize the job queue worker.
 *
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Only run on the Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('[INSTRUMENTATION] Initializing job queue...');

    try {
      // Dynamic import to avoid issues with server-only code
      const { initializeQueue, startWorker } = await import('@/lib/queue');

      // Initialize queue directories
      await initializeQueue();

      // Start the background worker
      startWorker();

      console.log('[INSTRUMENTATION] Job queue initialized and worker started');
    } catch (error) {
      console.error('[INSTRUMENTATION] Failed to initialize job queue:', error);
    }
  }
}
