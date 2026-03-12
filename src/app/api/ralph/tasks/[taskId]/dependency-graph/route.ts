import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { getRalphTask, getFeatureDependencyGraph } from '@/lib/managers/ralph-task-manager';

interface RouteParams {
  params: Promise<{ taskId: string }>;
}

/**
 * GET /api/ralph/tasks/[taskId]/dependency-graph
 *
 * Get the dependency graph for a feature task's children.
 * Returns a map of task IDs to their blockers and what they block.
 * Only works for feature tasks.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) return authResult.response!;

    const { taskId } = await params;

    // Get task to verify it exists and is a feature
    const taskResult = await getRalphTask(taskId);
    if (!taskResult.success) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    if (taskResult.data.childIds.length === 0) {
      return NextResponse.json(
        { error: 'Dependency graph is only available for tasks with subtasks' },
        { status: 400 }
      );
    }

    // Get dependency graph
    const graphResult = await getFeatureDependencyGraph(taskId);
    if (!graphResult.success) {
      console.error('[DEPENDENCY GRAPH API] Failed to get graph:', graphResult.error);
      return NextResponse.json({ error: 'Failed to get dependency graph' }, { status: 500 });
    }

    // Enrich with task details for display
    const enrichedGraph: Record<
      string,
      {
        id: string;
        title: string;
        status: string;
        subtaskOrder: number | null;
        blockedBy: Array<{ id: string; title: string; status: string }>;
        blocks: Array<{ id: string; title: string; status: string }>;
      }
    > = {};

    for (const [childId, deps] of Object.entries(graphResult.data)) {
      const childTask = await getRalphTask(childId);
      if (!childTask.success) continue;

      const blockedByDetails: Array<{ id: string; title: string; status: string }> = [];
      for (const blockerId of deps.blockedBy) {
        const blockerTask = await getRalphTask(blockerId);
        if (blockerTask.success) {
          blockedByDetails.push({
            id: blockerId,
            title: blockerTask.data.title,
            status: blockerTask.data.status,
          });
        }
      }

      const blocksDetails: Array<{ id: string; title: string; status: string }> = [];
      for (const blockedId of deps.blocks) {
        const blockedTask = await getRalphTask(blockedId);
        if (blockedTask.success) {
          blocksDetails.push({
            id: blockedId,
            title: blockedTask.data.title,
            status: blockedTask.data.status,
          });
        }
      }

      enrichedGraph[childId] = {
        id: childId,
        title: childTask.data.title,
        status: childTask.data.status,
        subtaskOrder: childTask.data.subtaskOrder ?? childTask.data.storyOrder ?? null,
        blockedBy: blockedByDetails,
        blocks: blocksDetails,
      };
    }

    return NextResponse.json({
      featureId: taskId,
      featureTitle: taskResult.data.title,
      childCount: taskResult.data.childIds.length,
      graph: enrichedGraph,
    });
  } catch (error) {
    console.error('[DEPENDENCY GRAPH API] Error getting dependency graph:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
