/**
 * Legacy file-backed job queue under data/queue and data/jobs.
 * Disabled by default when DATABASE_URL is set (Prisma/Ralph jobs cover production).
 * Set OMNIDEV_LEGACY_FILE_QUEUE=1 to force enable with Postgres; set =0 to force disable without Postgres.
 */

import { isPrismaConfigured } from '@/lib/db/prisma';

/** Message for throws and legacy /api/ask|edit|jobs responses when the file queue is off. */
export const LEGACY_FILE_QUEUE_DISABLED_ERROR =
  'Legacy file queue is disabled in Postgres mode. Set OMNIDEV_LEGACY_FILE_QUEUE=1 to enable data/queue. Ralph/Prisma jobs are unchanged.';

export function isLegacyFileQueueEnabled(): boolean {
  const raw = process.env.OMNIDEV_LEGACY_FILE_QUEUE?.trim().toLowerCase();
  if (raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes') return true;
  if (raw === '0' || raw === 'false' || raw === 'off' || raw === 'no') return false;
  return !isPrismaConfigured();
}
