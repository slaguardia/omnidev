import { NextRequest, NextResponse } from 'next/server';
import { askClaudeCode, checkClaudeCodeAvailability } from '@/lib/claudeCode';
import { withAuth } from '@/lib/auth/middleware';
import { validateAndLoadWorkspace } from './workspace-validation';
import { AskRouteParams } from './types';

/**
 * API handler for ask operations
 */
export async function handleAskClaudeCodeRequest(
  request: NextRequest,
  logPrefix: string,
  parsedData: AskRouteParams
): Promise<NextResponse> {
  const { workspaceId, question, context, sourceBranch } = parsedData;
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

    //TODO: Check if source branch is empty and if so use the default branch
    // if (!sourceBranch) {
    //   const defaultSourceBranch = workspaceValidation.workspace?.targetBranch;
    //   console.log(`[${logPrefix}] No source branch provided, using default branch: ${defaultSourceBranch}`);
    // }

    const workspace = workspaceValidation.workspace;

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

    //TODO: If the source branch was defined and was not the default branch, we will need to check that the target branch exists and then pull it

    // ============================================================================
    // STEP 5: CLAUDE CODE EXECUTION
    // ============================================================================

    // Execute Claude Code
    console.log(`[${logPrefix}] 🚀 Using Claude Code for enhanced repository analysis`);
    console.log(`[${logPrefix}] Claude Code execution parameters:`, {
      questionLength: question.length,
      workingDirectory: workspace?.path,
      contextLength: context?.length || 0,
      sourceBranch: sourceBranch,
      workspaceId: workspace?.id,
      mode: 'ask',
    });

    console.log(`[${logPrefix}] ⏱️ Starting Claude Code execution at ${new Date().toISOString()}`);
    const claudeStart = Date.now();

    try {
      // Check if workspace is defined and if not, return a 500 error
      if (!workspace) {
        return NextResponse.json({ error: 'Workspace not found' }, { status: 500 });
      }

      const claudeResult = await askClaudeCode({
        editRequest: false,
        question: question,
        workingDirectory: workspace?.path,
        context: context ?? '',
        workspaceId: workspace?.id,
      });

      const claudeExecutionTime = Date.now() - claudeStart;
      console.log(
        `[${logPrefix}] ✅ Claude Code execution completed in ${claudeExecutionTime}ms (${(claudeExecutionTime / 1000).toFixed(2)}s)`
      );

      if (!claudeResult.success) {
        console.error(`[${logPrefix}] Claude Code execution failed:`, claudeResult.error?.message);
        return NextResponse.json(
          { error: 'Claude Code execution failed', details: claudeResult.error?.message },
          { status: 500 }
        );
      }

      console.log(`[${logPrefix}] Claude Code result summary:`, {
        success: true,
        outputLength: claudeResult.data?.output?.length || 0,
        executionTime: claudeExecutionTime,
      });

      // Log a preview of the output (first 200 chars)
      if (claudeResult.data?.output) {
        const preview =
          claudeResult.data.output.length > 200
            ? claudeResult.data.output.substring(0, 200) + '...'
            : claudeResult.data.output;
        console.log(`[${logPrefix}] Claude Code output preview:`, preview);
      }

      // ============================================================================
      // STEP 6: SUCCESS RESPONSE
      // ============================================================================

      const totalTime = Date.now() - startTime;
      console.log(
        `[${logPrefix}] 🎯 Request completed successfully in ${totalTime}ms (${(totalTime / 1000).toFixed(2)}s) using Claude Code`
      );

      return NextResponse.json({
        success: true,
        response: claudeResult.data?.output,
        method: 'claude-code',
        workspace: {
          id: workspace.id,
          path: workspace.path,
          repoUrl: workspace.repoUrl,
          targetBranch: workspace.targetBranch,
        },
        timing: {
          total: totalTime,
          claudeExecution: claudeExecutionTime,
        },
      });
    } catch (claudeError) {
      // ============================================================================
      // CLAUDE CODE EXECUTION ERROR HANDLING
      // ============================================================================
      // This catch block handles errors that occur during Claude Code execution
      // It logs detailed error information and returns a 500 error response
      // This is separate from the outer catch block which handles general request errors

      const claudeExecutionTime = Date.now() - claudeStart;
      console.error(
        `[${logPrefix}] ❌ Claude Code execution threw error after ${claudeExecutionTime}ms:`,
        claudeError
      );
      console.error(`[${logPrefix}] Error details:`, {
        name: claudeError instanceof Error ? claudeError.name : 'Unknown',
        message: claudeError instanceof Error ? claudeError.message : String(claudeError),
        stack: claudeError instanceof Error ? claudeError.stack : undefined,
      });

      return NextResponse.json(
        {
          error: 'Claude Code execution failed',
          details: claudeError instanceof Error ? claudeError.message : String(claudeError),
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
