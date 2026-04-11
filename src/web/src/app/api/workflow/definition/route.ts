import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import {
  loadWorkflowDefinition,
  saveWorkflowDefinition,
  deleteWorkflowDefinition,
} from '@/lib/managers/workflow-definition-manager';
import type { WorkflowDefinition } from '@/lib/types/index';

/**
 * GET /api/workflow/definition
 *
 * Returns the current workflow definition.
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) return authResult.response!;

    const result = await loadWorkflowDefinition();
    if (!result.success) {
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    return NextResponse.json({ definition: result.data });
  } catch (error) {
    console.error('[WORKFLOW DEFINITION API] GET error:', error);
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
 * PUT /api/workflow/definition
 *
 * Saves a new workflow definition.
 *
 * Body: WorkflowDefinition
 */
export async function PUT(request: NextRequest) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) return authResult.response!;

    const body = (await request.json()) as WorkflowDefinition;

    const result = await saveWorkflowDefinition(body);
    if (!result.success) {
      return NextResponse.json({ error: result.error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: 'Workflow definition saved' });
  } catch (error) {
    console.error('[WORKFLOW DEFINITION API] PUT error:', error);
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
 * DELETE /api/workflow/definition
 *
 * Resets the workflow definition to defaults by deleting the file.
 */
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) return authResult.response!;

    const result = await deleteWorkflowDefinition();
    if (!result.success) {
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Workflow definition reset to defaults' });
  } catch (error) {
    console.error('[WORKFLOW DEFINITION API] DELETE error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
