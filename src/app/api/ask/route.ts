import { NextRequest, NextResponse } from 'next/server';
import { initializeWorkspaceManager } from '@/lib/managers/workspace-manager';
import { loadWorkspace } from '@/lib/managers/workspace-manager';
import { checkClaudeCodeAvailability } from '@/lib/claudeCode';
import { withAuth } from '@/lib/auth/middleware';
import { access } from 'node:fs/promises';
import type { WorkspaceId } from '@/lib/types/index';
import { saveExecutionToHistory } from '@/lib/dashboard/execution-history';
import { getProjectDisplayName } from '@/lib/dashboard/helpers';
import { executeOrQueue, type ClaudeCodeJobPayload, type ClaudeCodeJobResult } from '@/lib/queue';

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

    // Continue with existing logic...
    const { workspaceId, question, context, sourceBranch } = await request.json();
    console.log(`[ASK API] Request payload:`, {
      workspaceId,
      questionLength: question?.length || 0,
      contextLength: context?.length || 0,
      sourceBranch,
      timestamp: new Date().toISOString(),
    });

    if (!workspaceId || !question) {
      console.log(`[ASK API] Invalid request - missing required fields`);
      return NextResponse.json(
        { error: 'Workspace ID and question are required' },
        { status: 400 }
      );
    }

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
    console.log(`[ASK API] Workspace details:`, {
      id: workspace.id,
      path: workspace.path,
      repoUrl: workspace.repoUrl,
      targetBranch: workspace.targetBranch,
    });

    // Check if workspace directory exists
    console.log(`[ASK API] Checking workspace directory access: ${workspace.path}`);
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

    // Use Claude Code via job queue (execute-or-queue pattern)
    console.log(`[ASK API] 🚀 Using Claude Code for enhanced repository analysis`);
    console.log(`[ASK API] Claude Code execution parameters:`, {
      questionLength: question.length,
      workingDirectory: workspace.path,
      contextLength: context?.length || 0,
      sourceBranch: sourceBranch || 'default',
      workspaceId: workspace.id,
    });

    console.log(`[ASK API] ⏱️ Starting Claude Code execution at ${new Date().toISOString()}`);
    const claudeStart = Date.now();

    try {
      // Build job payload
      const jobPayload: ClaudeCodeJobPayload = {
        workspaceId: workspace.id as WorkspaceId,
        workspacePath: workspace.path,
        question,
        context,
        sourceBranch,
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
          `[ASK API] ✅ Claude Code execution completed immediately in ${claudeExecutionTime}ms`
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
          `[ASK API] 📝 Saved execution to history with ${result.jsonLogs?.length || 0} JSON logs`
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
        console.log(`[ASK API] 📋 Job queued with ID: ${execution.jobId}`);

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
      const claudeExecutionTime = Date.now() - claudeStart;
      const totalTime = Date.now() - startTime;
      const errorMessage = claudeError instanceof Error ? claudeError.message : String(claudeError);
      console.error(
        `[ASK API] ❌ Claude Code execution threw error after ${claudeExecutionTime}ms:`,
        claudeError
      );
      console.error(`[ASK API] Error details:`, {
        name: claudeError instanceof Error ? claudeError.name : 'Unknown',
        message: errorMessage,
        stack: claudeError instanceof Error ? claudeError.stack : undefined,
      });

      // Save error to execution history
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
      console.log(`[ASK API] 📝 Saved error execution to history`);

      return NextResponse.json(
        {
          error: 'Claude Code execution failed',
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
