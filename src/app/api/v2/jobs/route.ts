import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { dbListJobs } from '@/lib/managers/ralph-task-db';

/**
 * GET /api/v2/jobs — List jobs, optionally filtered by task_id
 */
export async function GET(request: NextRequest) {
  const authResult = await withAuth(request);
  if (!authResult.success) return authResult.response!;

  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('task_id');

    const jobs = dbListJobs(taskId ? { task_id: taskId } : undefined);
    return NextResponse.json({ jobs });
  } catch (error) {
    console.error('[V2 JOBS] Failed to list jobs:', error);
    return NextResponse.json({ error: 'Failed to list jobs' }, { status: 500 });
  }
}
