import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/middleware';
import { getProject, updateProject, deleteProject } from '@/lib/managers/project-manager';
import { createProjectId } from '@/lib/managers/task-types';
import type { WorkspaceId } from '@/lib/types';

/**
 * Schema for PATCH request to update a project
 */
const UpdateProjectRequestSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid hex color')
    .optional(),
  archived: z.boolean().optional(),
});

/**
 * GET /api/tasks/projects/[id]
 *
 * Get a project by ID.
 * Query params:
 * - workspaceId: The workspace the project belongs to (required)
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) return authResult.response!;

    const { id } = await params;
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get('workspaceId');

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
    }

    const result = await getProject(workspaceId as WorkspaceId, createProjectId(id));

    if (!result.success) {
      if (result.error.message.includes('not found')) {
        return NextResponse.json({ error: result.error.message }, { status: 404 });
      }
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    return NextResponse.json({ project: result.data });
  } catch (error) {
    console.error('[PROJECT API] Error getting project:', error);
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
 * PATCH /api/tasks/projects/[id]
 *
 * Update a project.
 * Query params:
 * - workspaceId: The workspace the project belongs to (required)
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) return authResult.response!;

    const { id } = await params;
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get('workspaceId');

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
    }

    const body = await request.json();
    const parseResult = UpdateProjectRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    // Build update object with only defined properties
    const updates: Parameters<typeof updateProject>[2] = {};
    if (parseResult.data.name !== undefined) updates.name = parseResult.data.name;
    if (parseResult.data.description !== undefined)
      updates.description = parseResult.data.description;
    if (parseResult.data.color !== undefined) updates.color = parseResult.data.color;
    if (parseResult.data.archived !== undefined) updates.archived = parseResult.data.archived;

    const result = await updateProject(workspaceId as WorkspaceId, createProjectId(id), updates);

    if (!result.success) {
      if (result.error.message.includes('not found')) {
        return NextResponse.json({ error: result.error.message }, { status: 404 });
      }
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    return NextResponse.json({ project: result.data });
  } catch (error) {
    console.error('[PROJECT API] Error updating project:', error);
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
 * DELETE /api/tasks/projects/[id]
 *
 * Delete a project.
 * Query params:
 * - workspaceId: The workspace the project belongs to (required)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) return authResult.response!;

    const { id } = await params;
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get('workspaceId');

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
    }

    const result = await deleteProject(workspaceId as WorkspaceId, createProjectId(id));

    if (!result.success) {
      if (result.error.message.includes('not found')) {
        return NextResponse.json({ error: result.error.message }, { status: 404 });
      }
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[PROJECT API] Error deleting project:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
