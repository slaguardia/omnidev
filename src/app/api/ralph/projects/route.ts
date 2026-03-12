import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/middleware';
import { listRalphProjects, createRalphProject } from '@/lib/managers/ralph-task-manager';

const CreateProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(100),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

/**
 * GET /api/ralph/projects
 *
 * List all Ralph projects.
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) return authResult.response!;

    const result = await listRalphProjects();
    if (!result.success) {
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    return NextResponse.json({ projects: result.data });
  } catch (error) {
    console.error('[RALPH PROJECTS API] Error listing projects:', error);
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
 * POST /api/ralph/projects
 *
 * Create a new Ralph project.
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) return authResult.response!;

    const body = await request.json();
    const parseResult = CreateProjectSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parseResult.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const input: { name: string; color?: string } = { name: parseResult.data.name };
    if (parseResult.data.color !== undefined) input.color = parseResult.data.color;
    const result = await createRalphProject(input);
    if (!result.success) {
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    return NextResponse.json({ project: result.data });
  } catch (error) {
    console.error('[RALPH PROJECTS API] Error creating project:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
