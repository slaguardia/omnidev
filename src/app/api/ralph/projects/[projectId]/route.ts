import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/middleware';
import { updateRalphProject, deleteRalphProject } from '@/lib/managers/ralph-task-manager';

const UpdateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

/**
 * PATCH /api/ralph/projects/[projectId]
 *
 * Update a Ralph project.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) return authResult.response!;

    const { projectId } = await params;
    const body = await request.json();
    const parseResult = UpdateProjectSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parseResult.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const updates = parseResult.data;
    if (!updates.name && !updates.color) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const updatePayload: { name?: string; color?: string } = {};
    if (updates.name !== undefined) updatePayload.name = updates.name;
    if (updates.color !== undefined) updatePayload.color = updates.color;

    const result = await updateRalphProject(projectId, updatePayload);
    if (!result.success) {
      const status = result.error.message.includes('not found') ? 404 : 500;
      return NextResponse.json({ error: result.error.message }, { status });
    }

    return NextResponse.json({ project: result.data });
  } catch (error) {
    console.error('[RALPH PROJECT UPDATE API] Error:', error);
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
 * DELETE /api/ralph/projects/[projectId]
 *
 * Delete a Ralph project. Tasks referencing this project will have their projectId set to null.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) return authResult.response!;

    const { projectId } = await params;
    const result = await deleteRalphProject(projectId);
    if (!result.success) {
      const status = result.error.message.includes('not found') ? 404 : 500;
      return NextResponse.json({ error: result.error.message }, { status });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[RALPH PROJECT DELETE API] Error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
