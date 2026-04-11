/**
 * Key/value strings in `ralph_meta` (Postgres) for data that previously lived only under data/.
 */

import { prisma, isPrismaConfigured } from '@/lib/db/prisma';

export const RALPH_META_KEYS = {
  WORKFLOW_DEFINITION: 'workflow_definition',
  DISCOVERY_REGISTRY: 'discovery_registry',
} as const;

export async function getRalphMetaValue(key: string): Promise<string | null> {
  if (!isPrismaConfigured()) return null;
  const row = await prisma.ralphMeta.findUnique({ where: { key } });
  return row?.value ?? null;
}

export async function setRalphMetaValue(key: string, value: string): Promise<void> {
  if (!isPrismaConfigured()) {
    throw new Error('[ralph-meta] setRalphMetaValue requires DATABASE_URL');
  }
  await prisma.ralphMeta.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

export async function deleteRalphMetaKey(key: string): Promise<void> {
  if (!isPrismaConfigured()) return;
  try {
    await prisma.ralphMeta.delete({ where: { key } });
  } catch {
    // ignore missing row
  }
}
