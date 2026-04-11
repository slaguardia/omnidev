/**
 * Wait until Prisma can connect (used by railway-worker.sh; web uses migrate deploy as the gate).
 */
import { PrismaClient } from '@prisma/client';

const maxAttempts = 30;
const delayMs = 2000;

const prisma = new PrismaClient();

for (let i = 0; i < maxAttempts; i++) {
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    console.log('[wait-for-postgres] Database is reachable.');
    await prisma.$disconnect();
    process.exit(0);
  } catch {
    console.log(`[wait-for-postgres] Waiting for Postgres (attempt ${i + 1}/${maxAttempts})...`);
    await new Promise((r) => setTimeout(r, delayMs));
  }
}

console.error('[wait-for-postgres] Timed out waiting for DATABASE_URL.');
await prisma.$disconnect();
process.exit(1);
