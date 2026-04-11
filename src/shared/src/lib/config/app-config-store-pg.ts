/**
 * App configuration — PostgreSQL (`omnidev_app_config`) when DATABASE_URL is set.
 */

import { existsSync } from 'node:fs';
import type { Prisma } from '@prisma/client';
import type { AppConfig } from '@/lib/types/index';
import { prisma } from '@/lib/db/prisma';
import * as file from './app-config-store-file';

const ROW_ID = 'default';

export async function getConfig(): Promise<AppConfig> {
  const row = await prisma.omnidevAppConfig.findUnique({ where: { id: ROW_ID } });
  if (row) {
    const saved = row.data as Partial<AppConfig>;
    const merged = file.mergeAppConfigPartial(saved);
    return file.finalizeAppConfigAfterLoad(merged);
  }

  if (existsSync(file.APP_CONFIG_FILE)) {
    const fromFile = file.loadConfig();
    await saveConfig(fromFile);
    return fromFile;
  }

  return file.mergeAppConfigPartial({});
}

export async function saveConfig(config: AppConfig): Promise<void> {
  const persisted = file.toPersistedAppConfig(config);
  const now = new Date().toISOString();
  await prisma.omnidevAppConfig.upsert({
    where: { id: ROW_ID },
    create: {
      id: ROW_ID,
      data: persisted as unknown as Prisma.InputJsonValue,
      updatedAt: now,
    },
    update: {
      data: persisted as unknown as Prisma.InputJsonValue,
      updatedAt: now,
    },
  });
}
