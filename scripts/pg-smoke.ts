/**
 * Verify DATABASE_URL, apply migrations, and connect with Prisma.
 * Usage: DATABASE_URL=... pnpm exec tsx scripts/pg-smoke.ts
 */
import { execSync } from 'node:child_process';

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error('Set DATABASE_URL to a PostgreSQL connection string.');
    process.exit(1);
  }

  execSync('pnpm exec prisma migrate deploy', { stdio: 'inherit', env: process.env });

  const { prisma } = await import('../src/lib/db/prisma');
  await prisma.$connect();
  await prisma.$queryRaw`SELECT 1`;
  console.log('[pg-smoke] prisma migrate deploy + connect OK');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
