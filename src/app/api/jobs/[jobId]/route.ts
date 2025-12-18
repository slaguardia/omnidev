import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { deleteFinishedJob, getJob, createJobId } from '@/lib/queue';

/**
 * GET /api/jobs/:jobId
 *
 * Get the status and result of a job.
 * Used by the dashboard to poll for queued job results.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    // Authentication check
    const authResult = await withAuth(request);
    if (!authResult.success) {
      return authResult.response!;
    }

    const { jobId } = await params;

    if (!jobId) {
      return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
    }

    console.log(`[JOBS API] Getting job status for ${jobId}`);

    const job = await getJob(createJobId(jobId));

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Return job info based on status
    const response: {
      id: string;
      type: string;
      status: string;
      createdAt: string;
      startedAt?: string;
      completedAt?: string;
      result?: unknown;
      error?: string;
    } = {
      id: job.id,
      type: job.type,
      status: job.status,
      createdAt: job.createdAt,
    };

    if (job.startedAt) {
      response.startedAt = job.startedAt;
    }

    if (job.completedAt) {
      response.completedAt = job.completedAt;
    }

    if (job.status === 'completed' && job.result) {
      response.result = job.result;
    }

    if (job.status === 'failed' && job.error) {
      response.error = job.error;
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('[JOBS API] Error getting job:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/jobs/:jobId
 *
 * Delete a finished job (completed/failed). Intended for external orchestrators (e.g. n8n)
 * that have already processed the job result and want to remove it early.
 *
 * Safety: this refuses to delete pending/processing jobs.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) return authResult.response!;

    const { jobId } = await params;
    if (!jobId) {
      return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
    }

    const result = await deleteFinishedJob(createJobId(jobId));

    if (result.success) {
      return NextResponse.json({ success: true, deletedFrom: result.deletedFrom });
    }

    if (result.reason === 'not_found') {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    if (result.reason === 'not_finished') {
      return NextResponse.json(
        { error: 'Job is not finished (pending/processing jobs cannot be deleted)' },
        { status: 409 }
      );
    }

    return NextResponse.json({ error: 'Failed to delete job' }, { status: 500 });
  } catch (error) {
    console.error('[JOBS API] Error deleting job:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
