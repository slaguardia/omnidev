import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { listJobs, isProcessing, hasPendingJobs } from '@/lib/queue';
import type { Job } from '@/lib/queue';

/**
 * Queue status response type
 */
interface QueueStatusResponse {
  isProcessing: boolean;
  hasPending: boolean;
  counts: {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  };
  currentJob: Job | null;
  pendingJobs: Job[];
  recentJobs: Job[]; // Last 10 completed/failed jobs
}

/**
 * GET /api/queue/status
 *
 * Get the current queue status including:
 * - Whether a job is currently processing
 * - Count of pending jobs
 * - Current processing job details
 * - List of pending jobs
 * - Recent completed/failed jobs
 */
export async function GET(request: NextRequest) {
  try {
    // Authentication check
    const authResult = await withAuth(request);
    if (!authResult.success) {
      return authResult.response!;
    }

    // Get queue state
    const [processing, pending, allJobs] = await Promise.all([
      isProcessing(),
      hasPendingJobs(),
      listJobs(), // Gets all jobs, sorted by createdAt desc
    ]);

    // Separate jobs by status
    const pendingJobs = allJobs.filter((j) => j.status === 'pending');
    const processingJobs = allJobs.filter((j) => j.status === 'processing');
    const completedJobs = allJobs.filter((j) => j.status === 'completed');
    const failedJobs = allJobs.filter((j) => j.status === 'failed');

    // Get current processing job (should be at most one)
    const currentJob = processingJobs[0] || null;

    // Get recent completed/failed (last 10)
    const recentJobs = [...completedJobs, ...failedJobs]
      .sort(
        (a, b) =>
          new Date(b.completedAt || b.createdAt).getTime() -
          new Date(a.completedAt || a.createdAt).getTime()
      )
      .slice(0, 10);

    const response: QueueStatusResponse = {
      isProcessing: processing,
      hasPending: pending,
      counts: {
        pending: pendingJobs.length,
        processing: processingJobs.length,
        completed: completedJobs.length,
        failed: failedJobs.length,
      },
      currentJob,
      pendingJobs,
      recentJobs,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[QUEUE STATUS API] Error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
