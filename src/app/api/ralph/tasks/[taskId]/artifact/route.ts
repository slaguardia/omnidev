import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { getRalphTask } from '@/lib/managers/ralph-task-manager';
import { loadWorkspace } from '@/lib/managers/workspace-manager';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { WorkspaceId } from '@/lib/types/index';

/**
 * DELETE /api/ralph/tasks/[taskId]/artifact?stage=<stageName>
 *
 * Deletes the .ralph/tasks/{taskId}/{stageName}.md artifact file from the workspace.
 * Best-effort — if the file doesn't exist, returns success anyway.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) return authResult.response!;

    const { taskId } = await params;
    const stage = request.nextUrl.searchParams.get('stage');

    if (!stage) {
      return NextResponse.json({ error: 'Missing "stage" query parameter' }, { status: 400 });
    }

    const taskResult = await getRalphTask(taskId);
    if (!taskResult.success) {
      const status = taskResult.error.message.includes('not found') ? 404 : 500;
      return NextResponse.json({ error: taskResult.error.message }, { status });
    }

    const workspaceResult = await loadWorkspace(taskResult.data.workspaceId as WorkspaceId);
    if (!workspaceResult.success) {
      return NextResponse.json(
        { error: `Failed to load workspace: ${workspaceResult.error.message}` },
        { status: 500 }
      );
    }

    const artifactPath = join(workspaceResult.data.path, '.ralph', 'tasks', taskId, `${stage}.md`);

    try {
      await unlink(artifactPath);
      console.log(`[ARTIFACT API] Deleted ${artifactPath}`);
    } catch {
      // File didn't exist — that's fine
      console.log(`[ARTIFACT API] No artifact to delete at ${artifactPath}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[ARTIFACT API] Error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
