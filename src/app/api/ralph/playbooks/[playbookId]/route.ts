import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/middleware';
import {
  getRalphPlaybook,
  updateRalphPlaybook,
  deleteRalphPlaybook,
} from '@/lib/managers/ralph-task-manager';
import { loadWorkflowDefinition } from '@/lib/managers/workflow-definition-manager';

const UpdatePlaybookSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  stageIds: z.array(z.string().min(1)).min(1).optional(),
  promptOverrides: z.record(z.string(), z.string()).optional(),
  isDefault: z.boolean().optional(),
});

/**
 * GET /api/ralph/playbooks/[playbookId]
 *
 * Get a single Ralph playbook.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ playbookId: string }> }
) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) return authResult.response!;

    const { playbookId } = await params;
    const result = await getRalphPlaybook(playbookId);
    if (!result.success) {
      const status = result.error.message.includes('not found') ? 404 : 500;
      return NextResponse.json({ error: result.error.message }, { status });
    }

    return NextResponse.json({ playbook: result.data });
  } catch (error) {
    console.error('[RALPH PLAYBOOK API] Error getting playbook:', error);
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
 * PATCH /api/ralph/playbooks/[playbookId]
 *
 * Update a Ralph playbook.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ playbookId: string }> }
) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) return authResult.response!;

    const { playbookId } = await params;
    const body = await request.json();
    const parseResult = UpdatePlaybookSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parseResult.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const updates = parseResult.data;
    if (
      !updates.name &&
      !updates.description &&
      !updates.stageIds &&
      !updates.promptOverrides &&
      updates.isDefault === undefined
    ) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    // Validate stageIds against current workflow definition
    if (updates.stageIds) {
      const defResult = await loadWorkflowDefinition();
      if (!defResult.success) {
        return NextResponse.json({ error: 'Failed to load workflow definition' }, { status: 500 });
      }
      const validStageIds = new Set(defResult.data.stages.map((s) => s.id));
      const invalidStages = updates.stageIds.filter((id) => !validStageIds.has(id));
      if (invalidStages.length > 0) {
        return NextResponse.json(
          { error: `Invalid stage IDs: ${invalidStages.join(', ')}` },
          { status: 400 }
        );
      }
    }

    const updatePayload: {
      name?: string;
      description?: string;
      stageIds?: string[];
      promptOverrides?: Record<string, string>;
      isDefault?: boolean;
    } = {};
    if (updates.name !== undefined) updatePayload.name = updates.name;
    if (updates.description !== undefined) updatePayload.description = updates.description;
    if (updates.stageIds !== undefined) updatePayload.stageIds = updates.stageIds;
    if (updates.promptOverrides !== undefined)
      updatePayload.promptOverrides = updates.promptOverrides;
    if (updates.isDefault !== undefined) updatePayload.isDefault = updates.isDefault;

    const result = await updateRalphPlaybook(playbookId, updatePayload);
    if (!result.success) {
      const status = result.error.message.includes('not found') ? 404 : 500;
      return NextResponse.json({ error: result.error.message }, { status });
    }

    return NextResponse.json({ playbook: result.data });
  } catch (error) {
    console.error('[RALPH PLAYBOOK UPDATE API] Error:', error);
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
 * DELETE /api/ralph/playbooks/[playbookId]
 *
 * Delete a Ralph playbook. Tasks referencing this playbook will have their playbookId set to null.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ playbookId: string }> }
) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) return authResult.response!;

    const { playbookId } = await params;
    const result = await deleteRalphPlaybook(playbookId);
    if (!result.success) {
      const status = result.error.message.includes('not found') ? 404 : 500;
      return NextResponse.json({ error: result.error.message }, { status });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[RALPH PLAYBOOK DELETE API] Error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
