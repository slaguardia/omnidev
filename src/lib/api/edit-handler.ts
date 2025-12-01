import { NextRequest, NextResponse } from 'next/server';
import { checkClaudeCodeAvailability, initializeGitWorkflow } from '@/lib/claudeCode';
import { withAuth } from '@/lib/auth/middleware';
import { validateAndLoadWorkspace } from './workspace-validation';
import { EditRouteParams } from './types';
import { saveExecutionToHistory } from '@/lib/dashboard/execution-history';
import { getProjectDisplayName } from '@/lib/dashboard/helpers';
import { executeOrQueue, type ClaudeCodeJobPayload, type ClaudeCodeJobResult } from '@/lib/queue';

/**
 * API handler for edit operations
 */
export async function handleEditClaudeCodeRequest(
  request: NextRequest,
  logPrefix: string,
  parsedData: EditRouteParams
): Promise<NextResponse> {
  const { workspaceId, question, context, sourceBranch, createMR, taskId, newBranchName } =
    parsedData;
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
    // STEP 5: GIT WORKFLOW INITIALIZATION
    // ============================================================================

    if (createMR && workspaceId) {
      console.log(`[CLAUDE CODE] 🔄 Initializing git workflow for edit request...`);
      const gitInitStart = Date.now();

      const result = await initializeGitWorkflow({
        workspaceId: workspaceId,
        sourceBranch: sourceBranch,
        taskId: taskId || null,
        newBranchName: newBranchName || null,
        createMR: createMR,
      });
      const gitInitTime = Date.now() - gitInitStart;

      if (!result.success) {
        console.warn(
          `[CLAUDE CODE] ⚠️ Git workflow initialization failed in ${gitInitTime}ms:`,
          result.error?.message
        );
        // Don't fail the request, just warn - Claude Code might still work
      } else {
        console.log(`[CLAUDE CODE] ✅ Git workflow initialized successfully in ${gitInitTime}ms`);
      }
    }

    // ============================================================================
    // STEP 5: CLAUDE CODE EXECUTION VIA JOB QUEUE
    // ============================================================================

    // Execute Claude Code via job queue (execute-or-queue pattern)
    console.log(`[${logPrefix}] 🚀 Using Claude Code with execution parameters:`, {
      createMR: createMR,
      questionLength: question.length,
      workingDirectory: workspace?.path,
      contextLength: context?.length || 0,
      sourceBranch: sourceBranch ?? 'default',
      workspaceId: workspace?.id,
      mode: 'edit',
    });

    console.log(`[${logPrefix}] ⏱️ Starting Claude Code execution at ${new Date().toISOString()}`);
    const claudeStart = Date.now();

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
        sourceBranch: sourceBranch,
        repoUrl: workspace.repoUrl,
      };

      // Execute or queue the job
      const execution = await executeOrQueue('claude-code', jobPayload);

      if (execution.immediate) {
        // Job ran immediately - return result
        const claudeExecutionTime = Date.now() - claudeStart;
        const totalTime = Date.now() - startTime;
        const result = execution.result as ClaudeCodeJobResult;

        console.log(
          `[${logPrefix}] ✅ Claude Code execution completed immediately in ${claudeExecutionTime}ms`
        );

        // Save to execution history (including full JSON stream)
        const workspaceName = getProjectDisplayName(workspace.repoUrl);
        const historyEntry: Parameters<typeof saveExecutionToHistory>[0] = {
          workspaceId: workspace.id,
          workspaceName,
          question,
          response: result.output || '',
          status: 'success',
          executionTimeMs: totalTime,
        };
        if (result.jsonLogs) {
          historyEntry.jsonLogs = result.jsonLogs;
        }
        if (result.rawOutput) {
          historyEntry.rawOutput = result.rawOutput;
        }
        await saveExecutionToHistory(historyEntry);
        console.log(
          `[${logPrefix}] 📝 Saved execution to history with ${result.jsonLogs?.length || 0} JSON logs`
        );

        return NextResponse.json({
          success: true,
          response: result.output,
          queued: false,
          method: 'claude-code',
          workspace: {
            id: workspace.id,
            path: workspace.path,
            repoUrl: workspace.repoUrl,
            targetBranch: workspace.targetBranch,
          },
          timing: {
            total: totalTime,
            claudeExecution: result.executionTimeMs,
          },
        });
      } else {
        // Job was queued - return job ID for polling
        console.log(`[${logPrefix}] 📋 Job queued with ID: ${execution.jobId}`);

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
      }
    } catch (claudeError) {
      // ============================================================================
      // CLAUDE CODE EXECUTION ERROR HANDLING
      // ============================================================================
      // This catch block handles errors that occur during Claude Code execution
      // It logs detailed error information and returns a 500 error response
      // This is separate from the outer catch block which handles general request errors

      const claudeExecutionTime = Date.now() - claudeStart;
      const totalTime = Date.now() - startTime;
      const errorMessage = claudeError instanceof Error ? claudeError.message : String(claudeError);
      console.error(
        `[${logPrefix}] ❌ Claude Code execution threw error after ${claudeExecutionTime}ms:`,
        claudeError
      );
      console.error(`[${logPrefix}] Error details:`, {
        name: claudeError instanceof Error ? claudeError.name : 'Unknown',
        message: errorMessage,
        stack: claudeError instanceof Error ? claudeError.stack : undefined,
      });

      // Save error to execution history
      if (workspace) {
        const workspaceName = getProjectDisplayName(workspace.repoUrl);
        await saveExecutionToHistory({
          workspaceId: workspace.id,
          workspaceName,
          question,
          response: '',
          status: 'error',
          errorMessage: `Claude Code execution failed: ${errorMessage}`,
          executionTimeMs: totalTime,
        });
        console.log(`[${logPrefix}] 📝 Saved error execution to history`);
      }

      return NextResponse.json(
        {
          error: 'Claude Code execution failed',
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
