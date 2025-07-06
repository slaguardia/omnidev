import { NextRequest, NextResponse } from 'next/server';
import { askClaudeCode, checkClaudeCodeAvailability, handlePostClaudeCodeExecution, initializeGitWorkflow } from '@/lib/claudeCode';
import { withAuth } from '@/lib/auth/middleware';
import { validateAndLoadWorkspace } from './workspace-validation';
import { EditRouteParams } from './types';
import { GitBranchWorkflowResult } from '@/lib/workspace/repository';

/**
 * API handler for edit operations
 */
export async function handleEditClaudeCodeRequest(
  request: NextRequest,
  logPrefix: string,
  parsedData: EditRouteParams
): Promise<NextResponse> {
  const { workspaceId, question, context, sourceBranch, createMR, taskId, taskName, newBranchName } = parsedData;
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

    console.log(`[${logPrefix}] Authentication successful for user: ${authResult.auth!.clientName} (${authResult.auth!.userId})`);

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
    console.log(`[${logPrefix}] Claude Code availability check completed in ${availabilityTime}ms:`, {
      success: availabilityCheck.success,
      available: availabilityCheck.success ? availabilityCheck.data : false,
      error: availabilityCheck.success ? undefined : availabilityCheck.error?.message
    });

    if (!availabilityCheck.success || !availabilityCheck.data) {
      const errorMessage = !availabilityCheck.success ? availabilityCheck.error?.message : 'Not installed or not accessible';
      console.error(`[${logPrefix}] Claude Code not available:`, errorMessage);
      return NextResponse.json(
        { error: 'Claude Code is not available. Please ensure Claude Code is installed and accessible.' },
        { status: 503 }
      );
    }

    // ============================================================================
    // STEP 5: GIT WORKFLOW INITIALIZATION
    // ============================================================================
    
    let gitBranchWorkflowResult: GitBranchWorkflowResult | undefined;
    if (createMR && workspaceId) {
      console.log(`[CLAUDE CODE] 🔄 Initializing git workflow for edit request...`);
      const gitInitStart = Date.now();
      
      const result = await initializeGitWorkflow({
        workspaceId: workspaceId,
        sourceBranch: sourceBranch,
        taskId: taskId || null,
        newBranchName: newBranchName || null,
        createMR: createMR
      });
      const gitInitTime = Date.now() - gitInitStart;
      
      if (!result.success) {
        console.warn(`[CLAUDE CODE] ⚠️ Git workflow initialization failed in ${gitInitTime}ms:`, result.error?.message);
        // Don't fail the request, just warn - Claude Code might still work
      } else {
        console.log(`[CLAUDE CODE] ✅ Git workflow initialized successfully in ${gitInitTime}ms`);
        gitBranchWorkflowResult = result.data;
      }
    }

    // ============================================================================
    // STEP 5: CLAUDE CODE EXECUTION
    // ============================================================================
    
    // Execute Claude Code
    console.log(`[${logPrefix}] 🚀 Using Claude Code with execution parameters:`, {
      createMR: createMR,
      questionLength: question.length,
      workingDirectory: workspace?.path,
      contextLength: context?.length || 0,
      sourceBranch: sourceBranch ?? 'default',
      workspaceId: workspace?.id,
      mode: 'edit'
    });
    
    console.log(`[${logPrefix}] ⏱️ Starting Claude Code execution at ${new Date().toISOString()}`);
    const claudeStart = Date.now();
    
    try {
      // Check if workspace is defined and if not, return a 500 error
      if (!workspace) {
        return NextResponse.json(
          { error: 'Workspace not found' },
          { status: 500 }
        );
      }

      const claudeResult = await askClaudeCode(
      {
        editRequest: true,
        question: question,
        workingDirectory: workspace.path,
        context: context ?? '',
        workspaceId: workspace.id,
      }
    );

      const claudeExecutionTime = Date.now() - claudeStart;
      console.log(`[${logPrefix}] ✅ Claude Code execution completed in ${claudeExecutionTime}ms (${(claudeExecutionTime / 1000).toFixed(2)}s)`);
      
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
        hasGitInitResult: !!gitBranchWorkflowResult,
        executionTime: claudeExecutionTime
      });

      // Log a preview of the output (first 200 chars)
      if (claudeResult.data?.output) {
        const preview = claudeResult.data.output.length > 200 
          ? claudeResult.data.output.substring(0, 200) + '...' 
          : claudeResult.data.output;
        console.log(`[${logPrefix}] Claude Code output preview:`, preview);
      }

      // ============================================================================
      // STEP 6: POST-EXECUTION GIT OPERATIONS
      // ============================================================================
      
      // Handle post-Claude Code execution git operations
      if (gitBranchWorkflowResult) {
        console.log(`[${logPrefix}] 🔄 Processing post-execution git operations...`);
        const postExecutionStart = Date.now();
        
        try {
          const postExecutionResult = await handlePostClaudeCodeExecution({
              workspacePath: workspace.path,
              gitBranchWorkflowResult: gitBranchWorkflowResult,
              taskName: taskName ?? null,
              taskId: taskId ?? null,
              output: claudeResult.data.output,
              repoUrl: workspace.repoUrl
            });
          
          const postExecutionTime = Date.now() - postExecutionStart;
          console.log(`[${logPrefix}] Post-execution completed in ${postExecutionTime}ms`);
          
          if (postExecutionResult.success) {
            console.log(`[${logPrefix}] ✅ Post-execution success:`, {
              hasChanges: postExecutionResult.data?.hasChanges,
              mergeRequestUrl: postExecutionResult.data?.mergeRequestUrl,
              pushedBranch: postExecutionResult.data?.pushedBranch
            });
            
            if (postExecutionResult.data?.mergeRequestUrl) {
              console.log(`[${logPrefix}] 🎉 Merge request created: ${postExecutionResult.data.mergeRequestUrl}`);
            } else if (postExecutionResult.data?.pushedBranch) {
              console.log(`[${logPrefix}] 📤 Changes pushed to branch: ${postExecutionResult.data.pushedBranch}`);
            } else if (!postExecutionResult.data?.hasChanges) {
              console.log(`[${logPrefix}] ℹ️ No changes were made by Claude Code`);
            }
          } else {
            console.error(`[${logPrefix}] ❌ Post-execution processing failed:`, postExecutionResult.error?.message);
            // Don't fail the entire request - just log the error
          }
        } catch (postError) {
          console.error(`[${logPrefix}] ❌ Post-execution processing threw error:`, postError);
        }
      }

      // ============================================================================
      // STEP 7: SUCCESS RESPONSE
      // ============================================================================
      
      const totalTime = Date.now() - startTime;
      console.log(`[${logPrefix}] 🎯 Request completed successfully in ${totalTime}ms (${(totalTime / 1000).toFixed(2)}s) using Claude Code`);

      return NextResponse.json({
        success: true,
        response: claudeResult.data?.output,
        method: 'claude-code',
        workspace: {
          id: workspace.id,
          path: workspace.path,
          repoUrl: workspace.repoUrl,
          targetBranch: workspace.targetBranch
        },
        timing: {
          total: totalTime,
          claudeExecution: claudeExecutionTime
        }
      });

    } catch (claudeError) {
      // ============================================================================
      // CLAUDE CODE EXECUTION ERROR HANDLING
      // ============================================================================
      // This catch block handles errors that occur during Claude Code execution
      // It logs detailed error information and returns a 500 error response
      // This is separate from the outer catch block which handles general request errors
      
      const claudeExecutionTime = Date.now() - claudeStart;
      console.error(`[${logPrefix}] ❌ Claude Code execution threw error after ${claudeExecutionTime}ms:`, claudeError);
      console.error(`[${logPrefix}] Error details:`, {
        name: claudeError instanceof Error ? claudeError.name : 'Unknown',
        message: claudeError instanceof Error ? claudeError.message : String(claudeError),
        stack: claudeError instanceof Error ? claudeError.stack : undefined
      });
      
      return NextResponse.json(
        { error: 'Claude Code execution failed', details: claudeError instanceof Error ? claudeError.message : String(claudeError) },
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
      timestamp: new Date().toISOString()
    });
    
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 