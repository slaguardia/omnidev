import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/middleware';
import { createProject, listProjects } from '@/lib/managers/project-manager';
import type { WorkspaceId } from '@/lib/types';

/**
 * Schema for POST request to create a project
 */
const CreateProjectRequestSchema = z.object({
  workspaceId: z.string().min(1, 'Workspace ID is required'),
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid hex color')
    .optional(),
});

/**
 * GET /api/tasks/projects
 *
 * List all projects for a workspace.
 * Query params:
 * - workspaceId: The workspace to list projects for (required)
 * - includeArchived: Include archived projects (default: false)
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) return authResult.response!;

    const url = new URL(request.url);
    const workspaceId = url.searchParams.get('workspaceId');
    const includeArchived = url.searchParams.get('includeArchived') === 'true';

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
    }

    const result = await listProjects(workspaceId as WorkspaceId, { includeArchived });

    if (!result.success) {
      console.error('[PROJECTS API] Failed to list projects:', result.error);
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    return NextResponse.json({
      projects: result.data,
      meta: {
        total: result.data.length,
        workspaceId,
        includeArchived,
      },
    });
  } catch (error) {
    console.error('[PROJECTS API] Error listing projects:', error);
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
 * POST /api/tasks/projects
 *
 * Create a new project.
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) return authResult.response!;

    const body = await request.json();
    const parseResult = CreateProjectRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId, name, description, color } = parseResult.data;

    // Build input object with only defined properties
    const input: Parameters<typeof createProject>[0] = {
      workspaceId: workspaceId as WorkspaceId,
      name,
    };
    if (description) input.description = description;
    if (color) input.color = color;

    const result = await createProject(input);

    if (!result.success) {
      console.error('[PROJECTS API] Failed to create project:', result.error);
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    return NextResponse.json({ project: result.data }, { status: 201 });
  } catch (error) {
    console.error('[PROJECTS API] Error creating project:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
