/**
 * Opt-in logging for Ralph dashboard data fetches (local / prod debugging).
 *
 * Set in `.env.local`:
 *   NEXT_PUBLIC_DEBUG_RALPH_FETCH=1
 *
 * Restart `pnpm dev` after changing env. Watch the browser console for
 * `[RALPH_FETCH_DEBUG]` lines — duplicate parallel calls show up as back-to-back
 * `start` lines for the same endpoint before `done`.
 */

function isEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DEBUG_RALPH_FETCH === '1';
}

export function debugRalphFetch(
  scope: string,
  message: string,
  extra?: Record<string, unknown>
): void {
  if (!isEnabled()) return;
  const ts = new Date().toISOString();
  if (extra && Object.keys(extra).length > 0) {
    console.log(`[RALPH_FETCH_DEBUG ${ts}] [${scope}] ${message}`, extra);
  } else {
    console.log(`[RALPH_FETCH_DEBUG ${ts}] [${scope}] ${message}`);
  }
}

/** Wrap an async fetch; logs duration and errors when debug is on */
export async function debugRalphFetchAsync<T>(
  scope: string,
  label: string,
  fn: () => Promise<T>
): Promise<T> {
  if (!isEnabled()) {
    return fn();
  }
  const t0 = performance.now();
  debugRalphFetch(scope, `${label} start`);
  try {
    const result = await fn();
    const ms = Math.round(performance.now() - t0);
    debugRalphFetch(scope, `${label} done`, { ms });
    return result;
  } catch (e) {
    const ms = Math.round(performance.now() - t0);
    debugRalphFetch(scope, `${label} error`, {
      ms,
      error: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}
