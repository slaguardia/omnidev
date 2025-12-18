import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { listJobs } from '@/lib/queue';
import type { Job, JobStatus } from '@/lib/queue';

const VALID_STATUSES: readonly JobStatus[] = [
  'pending',
  'processing',
  'completed',
  'failed',
] as const;

function parseStatusFilter(request: NextRequest): JobStatus[] | undefined {
  const url = new URL(request.url);

  // Support either repeated params (?status=completed&status=failed)
  // or comma-separated (?status=completed,failed).
  const raw = url.searchParams.getAll('status').flatMap((s) =>
    s
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
  );

  if (raw.length === 0) return undefined;

  const unique = Array.from(new Set(raw));
  const parsed: JobStatus[] = [];
  for (const s of unique) {
    if ((VALID_STATUSES as readonly string[]).includes(s)) {
      parsed.push(s as JobStatus);
    }
  }

  return parsed.length > 0 ? parsed : undefined;
}

function parseLimit(request: NextRequest): number | undefined {
  const url = new URL(request.url);
  const raw = url.searchParams.get('limit');
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  const int = Math.floor(n);
  if (int <= 0) return undefined;
  return Math.min(int, 500);
}

/**
 * GET /api/jobs
 *
 * List jobs across the queue. Useful for external orchestrators (e.g. n8n) that want
 * to process completed jobs without tracking every jobId at submission time.
 *
 * Query params:
 * - status: repeated or comma-separated job statuses
 * - limit: max number of jobs returned (capped at 500)
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) return authResult.response!;

    const statusFilter = parseStatusFilter(request);
    const limit = parseLimit(request);

    const jobs = await listJobs(statusFilter);
    const limitedJobs: Job[] = typeof limit === 'number' ? jobs.slice(0, limit) : jobs;

    return NextResponse.json({
      jobs: limitedJobs,
      meta: {
        total: jobs.length,
        returned: limitedJobs.length,
        statusFilter: statusFilter ?? null,
        limit: limit ?? null,
      },
    });
  } catch (error) {
    console.error('[JOBS LIST API] Error listing jobs:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
