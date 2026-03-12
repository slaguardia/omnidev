import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { getRalphTask, calculateTaskStats } from '@/lib/managers/ralph-task-manager';

/**
 * GET /api/ralph/tasks/[taskId]/stats
 *
 * Get detailed completion statistics for a task.
 * Includes time spent in each state, questions asked, iterations, etc.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) return authResult.response!;

    const { taskId } = await params;

    if (!taskId) {
      return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
    }

    const taskResult = await getRalphTask(taskId);

    if (!taskResult.success) {
      const status = taskResult.error.message.includes('not found') ? 404 : 500;
      return NextResponse.json({ error: taskResult.error.message }, { status });
    }

    const task = taskResult.data;
    const stats = calculateTaskStats(task);

    // Format time in states for display (convert ms to human-readable)
    const formatDuration = (ms: number): string => {
      if (ms < 1000) return `${ms}ms`;
      if (ms < 60000) return `${Math.round(ms / 1000)}s`;
      if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
      if (ms < 86400000) return `${(ms / 3600000).toFixed(1)}h`;
      return `${(ms / 86400000).toFixed(1)}d`;
    };

    const formattedStats = {
      ...stats,
      totalDurationFormatted: formatDuration(stats.totalDuration),
    };

    return NextResponse.json({
      taskId,
      stats: formattedStats,
    });
  } catch (error) {
    console.error('[RALPH TASK STATS API] Error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
