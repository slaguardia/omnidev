import { NextRequest, NextResponse } from 'next/server';
import { initializeWorkspaceManager } from '@/lib/managers/workspace-manager';
import { loadWorkspace } from '@/lib/managers/workspace-manager';
import { askClaudeCode, checkClaudeCodeAvailability, handlePostClaudeCodeExecution } from '@/lib/claudeCode';
import { withAuth } from '@/lib/auth/middleware';
import { access } from 'node:fs/promises';
import type { WorkspaceId } from '@/lib/types/index';

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

    console.log(`[ASK API] Authentication successful for user: ${authResult.auth!.clientName} (${authResult.auth!.userId})`);

    // Continue with existing logic...
    const { workspaceId, question, context, sourceBranch } = await request.json();
    console.log(`[ASK API] Request payload:`, {
      workspaceId,
      questionLength: question?.length || 0,
      contextLength: context?.length || 0,
      sourceBranch,
      timestamp: new Date().toISOString()
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
      targetBranch: workspace.targetBranch
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
      error: availabilityCheck.success ? undefined : availabilityCheck.error?.message
    });

    if (!availabilityCheck.success || !availabilityCheck.data) {
      const errorMessage = !availabilityCheck.success ? availabilityCheck.error?.message : 'Not installed or not accessible';
      console.error(`[ASK API] Claude Code not available:`, errorMessage);
      return NextResponse.json(
        { error: 'Claude Code is not available. Please ensure Claude Code is installed and accessible.' },
        { status: 503 }
      );
    }

    // Use Claude Code
    console.log(`[ASK API] 🚀 Using Claude Code for enhanced repository analysis`);
    console.log(`[ASK API] Claude Code execution parameters:`, {
      questionLength: question.length,
      workingDirectory: workspace.path,
      contextLength: context?.length || 0,
      sourceBranch: sourceBranch || 'default',
      workspaceId: workspace.id
    });
    
    console.log(`[ASK API] ⏱️ Starting Claude Code execution at ${new Date().toISOString()}`);
    const claudeStart = Date.now();
    
    try {
      const claudeResult = await askClaudeCode(question, {
        workingDirectory: workspace.path,
        context,
        sourceBranch,
        workspaceId: workspace.id as WorkspaceId,
      });

      const claudeExecutionTime = Date.now() - claudeStart;
      console.log(`[ASK API] ✅ Claude Code execution completed in ${claudeExecutionTime}ms (${(claudeExecutionTime / 1000).toFixed(2)}s)`);
      
      if (!claudeResult.success) {
        console.error(`[ASK API] Claude Code execution failed:`, claudeResult.error?.message);
        return NextResponse.json(
          { error: 'Claude Code execution failed', details: claudeResult.error?.message },
          { status: 500 }
        );
      }

      console.log(`[ASK API] Claude Code result summary:`, {
        success: true,
        outputLength: claudeResult.data?.output?.length || 0,
        hasGitInitResult: !!claudeResult.data?.gitInitResult,
        executionTime: claudeExecutionTime
      });

      // Log a preview of the output (first 200 chars)
      if (claudeResult.data?.output) {
        const preview = claudeResult.data.output.length > 200 
          ? claudeResult.data.output.substring(0, 200) + '...' 
          : claudeResult.data.output;
        console.log(`[ASK API] Claude Code output preview:`, preview);
      }

      // Log the gitInitResult details
      if (claudeResult.data?.gitInitResult) {
        console.log(`[ASK API] Git operations detected:`, {
          hasGitInitResult: true,
          gitResultType: typeof claudeResult.data.gitInitResult
        });
      } else {
        console.log(`[ASK API] No git operations detected`);
      }

      // Handle post-Claude Code execution git operations
      if (claudeResult.data?.gitInitResult) {
        console.log(`[ASK API] 🔄 Processing post-execution git operations...`);
        const postExecutionStart = Date.now();
        
        try {
          const postExecutionResult = await handlePostClaudeCodeExecution(
            workspace.path,
            claudeResult.data.gitInitResult,
            workspace.repoUrl,
          );
          
          const postExecutionTime = Date.now() - postExecutionStart;
          console.log(`[ASK API] Post-execution completed in ${postExecutionTime}ms`);
          
          if (postExecutionResult.success) {
            console.log(`[ASK API] ✅ Post-execution success:`, {
              hasChanges: postExecutionResult.data?.hasChanges,
              mergeRequestUrl: postExecutionResult.data?.mergeRequestUrl,
              pushedBranch: postExecutionResult.data?.pushedBranch
            });
            
            if (postExecutionResult.data?.mergeRequestUrl) {
              console.log(`[ASK API] 🎉 Merge request created: ${postExecutionResult.data.mergeRequestUrl}`);
            } else if (postExecutionResult.data?.pushedBranch) {
              console.log(`[ASK API] 📤 Changes pushed to branch: ${postExecutionResult.data.pushedBranch}`);
            } else if (!postExecutionResult.data?.hasChanges) {
              console.log(`[ASK API] ℹ️ No changes were made by Claude Code`);
            }
          } else {
            console.error(`[ASK API] ❌ Post-execution processing failed:`, postExecutionResult.error?.message);
            // Don't fail the entire request - just log the error
          }
        } catch (postError) {
          console.error(`[ASK API] ❌ Post-execution processing threw error:`, postError);
        }
      }

      const totalTime = Date.now() - startTime;
      console.log(`[ASK API] 🎯 Request completed successfully in ${totalTime}ms (${(totalTime / 1000).toFixed(2)}s) using Claude Code`);

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
      const claudeExecutionTime = Date.now() - claudeStart;
      console.error(`[ASK API] ❌ Claude Code execution threw error after ${claudeExecutionTime}ms:`, claudeError);
      console.error(`[ASK API] Error details:`, {
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
    const totalTime = Date.now() - startTime;
    console.error(`[ASK API] ❌ Request failed after ${totalTime}ms:`, {
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