import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/middleware';
import { listRalphPlaybooks, createRalphPlaybook } from '@/lib/managers/ralph-task-manager';
import { loadWorkflowDefinition } from '@/lib/managers/workflow-definition-manager';

const CreatePlaybookSchema = z.object({
  name: z.string().min(1, 'Playbook name is required').max(100),
  description: z.string().max(500).optional(),
  stageIds: z.array(z.string().min(1)).min(1, 'At least one stage is required'),
  promptOverrides: z.record(z.string(), z.string()).optional(),
  isDefault: z.boolean().optional(),
});

/**
 * GET /api/ralph/playbooks
 *
 * List all Ralph playbooks.
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) return authResult.response!;

    const result = await listRalphPlaybooks();
    if (!result.success) {
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    return NextResponse.json({ playbooks: result.data });
  } catch (error) {
    console.error('[RALPH PLAYBOOKS API] Error listing playbooks:', error);
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
 * POST /api/ralph/playbooks
 *
 * Create a new Ralph playbook.
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await withAuth(request);
    if (!authResult.success) return authResult.response!;

    const body = await request.json();
    const parseResult = CreatePlaybookSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parseResult.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    // Validate stageIds against current workflow definition
    const defResult = await loadWorkflowDefinition();
    if (!defResult.success) {
      return NextResponse.json({ error: 'Failed to load workflow definition' }, { status: 500 });
    }
    const validStageIds = new Set(defResult.data.stages.map((s) => s.id));
    const invalidStages = parseResult.data.stageIds.filter((id) => !validStageIds.has(id));
    if (invalidStages.length > 0) {
      return NextResponse.json(
        { error: `Invalid stage IDs: ${invalidStages.join(', ')}` },
        { status: 400 }
      );
    }

    const input: {
      name: string;
      description?: string;
      stageIds: string[];
      promptOverrides?: Record<string, string>;
      isDefault?: boolean;
    } = {
      name: parseResult.data.name,
      stageIds: parseResult.data.stageIds,
    };
    if (parseResult.data.description !== undefined)
      input.description = parseResult.data.description;
    if (parseResult.data.promptOverrides !== undefined)
      input.promptOverrides = parseResult.data.promptOverrides;
    if (parseResult.data.isDefault !== undefined) input.isDefault = parseResult.data.isDefault;
    const result = await createRalphPlaybook(input);
    if (!result.success) {
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    return NextResponse.json({ playbook: result.data });
  } catch (error) {
    console.error('[RALPH PLAYBOOKS API] Error creating playbook:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
