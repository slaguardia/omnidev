import { NextRequest, NextResponse } from 'next/server';
import { checkClaudeCodeAvailability } from '@/lib/claudeCode';
import { withAuth } from '@/lib/auth/middleware';
import { validateAndLoadWorkspace } from './workspace-validation';
import { EditRouteParams } from './types';
import { executeOrQueue, type ClaudeCodeJobPayload } from '@/lib/queue';

/**
 * API handler for edit operations
 */
export async function handleEditClaudeCodeRequest(
  request: NextRequest,
  logPrefix: string,
  parsedData: EditRouteParams
): Promise<NextResponse> {
  const { workspaceId, question, context, sourceBranch, callback } = parsedData;
  const createMR = Boolean(parsedData.createMR);
  const startTime = Date.now();

  console.log(`[${logPrefix}] Request started at ${new Date().toISOString()}`);

  try {
    // ============================================================================
    // STEP 1: AUTHENTICATION
    // ============================================================================

    // Authentication check
    const authResult = await withAuth(request);
    if (!authResult.success) {
      return authResult.response!;
    }

    console.log(
      `[${logPrefix}] Authentication successful for user: ${authResult.auth!.clientName} (${authResult.auth!.userId})`
    );

    // ============================================================================
    // STEP 2 & 3: WORKSPACE VALIDATION & LOADING
    // ============================================================================

    const workspaceValidation = await validateAndLoadWorkspace(workspaceId, logPrefix);
    if (!workspaceValidation.success) {
      return workspaceValidation.response!;
    }

    const workspace = workspaceValidation.workspace;
    const effectiveSourceBranch = sourceBranch || workspace?.targetBranch;

    // ============================================================================
    // STEP 4: CLAUDE CODE AVAILABILITY CHECK
    // ============================================================================

    // Check Claude Code availability
    console.log(`[${logPrefix}] Checking Claude Code availability...`);
    const availabilityStart = Date.now();
    const availabilityCheck = await checkClaudeCodeAvailability();
    const availabilityTime = Date.now() - availabilityStart;
    console.log(
      `[${logPrefix}] Claude Code availability check completed in ${availabilityTime}ms:`,
      {
        success: availabilityCheck.success,
        available: availabilityCheck.success ? availabilityCheck.data : false,
        error: availabilityCheck.success ? undefined : availabilityCheck.error?.message,
      }
    );

    if (!availabilityCheck.success || !availabilityCheck.data) {
      const errorMessage = !availabilityCheck.success
        ? availabilityCheck.error?.message
        : 'Not installed or not accessible';
      console.error(`[${logPrefix}] Claude Code not available:`, errorMessage);
      return NextResponse.json(
        {
          error:
            'Claude Code is not available. Please ensure Claude Code is installed and accessible.',
        },
        { status: 503 }
      );
    }

    // ============================================================================
    // STEP 5: QUEUE CLAUDE CODE JOB
    // ============================================================================

    // Queue the job for background processing (always returns immediately)
    console.log(`[${logPrefix}] 🚀 Queueing Claude Code job with parameters:`, {
      createMR: createMR,
      questionLength: question.length,
      workingDirectory: workspace?.path,
      contextLength: context?.length || 0,
      sourceBranch: effectiveSourceBranch ?? 'default',
      workspaceId: workspace?.id,
      mode: 'edit',
    });

    try {
      // Check if workspace is defined and if not, return a 500 error
      if (!workspace) {
        return NextResponse.json({ error: 'Workspace not found' }, { status: 500 });
      }

      // Build job payload
      const jobPayload: ClaudeCodeJobPayload = {
        workspaceId: workspace.id,
        workspacePath: workspace.path,
        question: question,
        context: context ?? '',
        repoUrl: workspace.repoUrl,
        editRequest: true,
        createMR,
      };
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
      console.log(`[${logPrefix}] 📋 Job queued with ID: ${execution.jobId} in ${totalTime}ms`);

      return NextResponse.json({
        success: true,
        queued: true,
        jobId: execution.jobId,
        message: 'Job queued - poll /api/jobs/:jobId for results',
        workspace: {
          id: workspace.id,
          path: workspace.path,
          repoUrl: workspace.repoUrl,
          targetBranch: workspace.targetBranch,
        },
      });
    } catch (queueError) {
      const totalTime = Date.now() - startTime;
      const errorMessage = queueError instanceof Error ? queueError.message : String(queueError);
      console.error(`[${logPrefix}] ❌ Failed to queue job after ${totalTime}ms:`, queueError);

      return NextResponse.json(
        {
          error: 'Failed to queue job',
          details: errorMessage,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    // ============================================================================
    // GENERAL REQUEST ERROR HANDLING
    // ============================================================================
    // This catch block handles any errors that occur during the main request processing
    // It catches errors from authentication, workspace validation,
    // availability checks, or any other unexpected errors in the main flow
    // This is the outermost error handler and acts as a safety net

    const totalTime = Date.now() - startTime;
    console.error(`[${logPrefix}] ❌ Request failed after ${totalTime}ms:`, {
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
