import { NextRequest, NextResponse } from 'next/server';
import { initializeWorkspaceManager } from '@/lib/managers/workspace-manager';
import { loadWorkspace } from '@/lib/managers/workspace-manager';
import { checkClaudeCodeAvailability } from '@/lib/claudeCode';
import { withAuth } from '@/lib/auth/middleware';
import { access } from 'node:fs/promises';
import type { WorkspaceId } from '@/lib/types/index';
import { executeOrQueue, type ClaudeCodeJobPayload } from '@/lib/queue';
import { validateAndParseAskRouteParams } from '@/lib/api/route-validation';

// This api route needs either next-auth or api key authentication
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log(`[ASK API] Request started at ${new Date().toISOString()}`);

  try {
    // Authentication check
    const authResult = await withAuth(request);
    if (!authResult.success) {
      return authResult.response!;
    }

    console.log(
      `[ASK API] Authentication successful for user: ${authResult.auth!.clientName} (${authResult.auth!.userId})`
    );

    // Parse and validate request body (Zod)
    let body: unknown;
    try {
      body = await request.json();
    } catch (parseError) {
      console.error('[ASK API] Failed to parse request body:', parseError);
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const validationResult = validateAndParseAskRouteParams(body, 'ASK API');
    if (!validationResult.success) {
      return validationResult.error!;
    }

    const { workspaceId, question, context, sourceBranch, callback } = validationResult.data!;

    // Initialize workspace manager
    console.log(`[ASK API] Initializing workspace manager...`);
    const initStart = Date.now();
    const initResult = await initializeWorkspaceManager();
    console.log(`[ASK API] Workspace manager initialized in ${Date.now() - initStart}ms`);

    if (!initResult.success) {
      console.error(`[ASK API] Failed to initialize workspace manager:`, initResult.error?.message);
      return NextResponse.json(
        { error: 'Failed to initialize workspace manager', details: initResult.error?.message },
        { status: 500 }
      );
    }

    // Get workspace
    console.log(`[ASK API] Loading workspace: ${workspaceId}`);
    const workspaceStart = Date.now();
    const workspaceResult = await loadWorkspace(workspaceId as WorkspaceId);
    console.log(`[ASK API] Workspace loaded in ${Date.now() - workspaceStart}ms`);

    if (!workspaceResult.success) {
      console.error(`[ASK API] Failed to load workspace:`, workspaceResult.error?.message);
      return NextResponse.json(
        { error: 'Failed to load workspace', details: workspaceResult.error?.message },
        { status: 404 }
      );
    }

    const workspace = workspaceResult.data;
    console.log(`[ASK API] Workspace selected`, {
      id: workspace.id,
      targetBranch: workspace.targetBranch,
    });

    // Check if workspace directory exists
    console.log(`[ASK API] Checking workspace directory access`);
    try {
      await access(workspace.path);
      console.log(`[ASK API] Workspace directory accessible`);
    } catch (error) {
      console.error(`[ASK API] Workspace directory not accessible:`, error);
      return NextResponse.json(
        { error: 'Workspace directory not found. The workspace may have been deleted.' },
        { status: 404 }
      );
    }

    // Check Claude Code availability
    console.log(`[ASK API] Checking Claude Code availability...`);
    const availabilityStart = Date.now();
    const availabilityCheck = await checkClaudeCodeAvailability();
    const availabilityTime = Date.now() - availabilityStart;
    console.log(`[ASK API] Claude Code availability check completed in ${availabilityTime}ms:`, {
      success: availabilityCheck.success,
      available: availabilityCheck.success ? availabilityCheck.data : false,
      error: availabilityCheck.success ? undefined : availabilityCheck.error?.message,
    });

    if (!availabilityCheck.success || !availabilityCheck.data) {
      const errorMessage = !availabilityCheck.success
        ? availabilityCheck.error?.message
        : 'Not installed or not accessible';
      console.error(`[ASK API] Claude Code not available:`, errorMessage);
      return NextResponse.json(
        {
          error:
            'Claude Code is not available. Please ensure Claude Code is installed and accessible.',
        },
        { status: 503 }
      );
    }

    // Queue the job for background processing (always returns immediately)
    console.log(`[ASK API] 🚀 Queueing Claude Code job for repository analysis`);
    console.log(`[ASK API] Job parameters:`, {
      questionLength: question.length,
      contextLength: context?.length || 0,
      sourceBranch: sourceBranch || workspace.targetBranch || 'default',
      workspaceId: workspace.id,
    });

    try {
      // Build job payload
      const jobPayload: ClaudeCodeJobPayload = {
        workspaceId: workspace.id as WorkspaceId,
        workspacePath: workspace.path,
        question,
        repoUrl: workspace.repoUrl,
      };
      if (context !== null && context !== undefined) {
        jobPayload.context = context;
      }
      const effectiveSourceBranch = sourceBranch || workspace.targetBranch;
      if (effectiveSourceBranch) {
        jobPayload.sourceBranch = effectiveSourceBranch;
      }
      if (callback) {
        jobPayload.callback = callback;
      }

      // Always queue the job (forceQueue: true) - returns immediately
      const execution = await executeOrQueue('claude-code', jobPayload, { forceQueue: true });

      // forceQueue guarantees immediate: false, but TypeScript needs the check
      if (execution.immediate) {
        // This branch should never execute with forceQueue: true
        throw new Error('Unexpected immediate execution with forceQueue enabled');
      }

      const totalTime = Date.now() - startTime;
      console.log(`[ASK API] 📋 Job queued with ID: ${execution.jobId} in ${totalTime}ms`);

      return NextResponse.json({
        success: true,
        queued: true,
        jobId: execution.jobId,
        message: 'Job queued - poll /api/jobs/:jobId for results',
        workspace: {
          id: workspace.id,
          targetBranch: workspace.targetBranch,
        },
      });
    } catch (queueError) {
      const totalTime = Date.now() - startTime;
      const errorMessage = queueError instanceof Error ? queueError.message : String(queueError);
      console.error(`[ASK API] ❌ Failed to queue job after ${totalTime}ms:`, queueError);

      return NextResponse.json(
        {
          error: 'Failed to queue job',
          details: errorMessage,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error(`[ASK API] ❌ Request failed after ${totalTime}ms:`, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
