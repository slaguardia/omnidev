import { NextRequest, NextResponse } from 'next/server';
import { WorkspaceManager } from '@/managers/WorkspaceManager';
import { CacheManager } from '@/managers/CacheManager';
import { CACHE_CONFIG } from '@/config/cache';
import { askClaudeCode, checkClaudeCodeAvailability, ClaudeCodeResult, handlePostClaudeCodeExecution } from '@/utils/claudeCodeIntegration';
import { access } from 'node:fs/promises';
import type { WorkspaceId } from '@/types/index';
import Anthropic from '@anthropic-ai/sdk';

const workspaceManager = new WorkspaceManager();
const cacheManager = new CacheManager(CACHE_CONFIG);

// Initialize Anthropic client as fallback
const anthropic = process.env.CLAUDE_API_KEY ? new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
}) : null;

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log(`[ASK API] Request started at ${new Date().toISOString()}`);

  try {
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
    const initResult = await workspaceManager.initialize();
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
    const workspaceResult = await workspaceManager.loadWorkspace(workspaceId as WorkspaceId);
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

    // Check Claude Code availability first
    console.log(`[ASK API] Checking Claude Code availability...`);
    const availabilityStart = Date.now();
    const availabilityCheck = await checkClaudeCodeAvailability();
    const availabilityTime = Date.now() - availabilityStart;
    console.log(`[ASK API] Claude Code availability check completed in ${availabilityTime}ms:`, {
      success: availabilityCheck.success,
      available: availabilityCheck.success ? availabilityCheck.data : false,
      error: availabilityCheck.success ? undefined : availabilityCheck.error?.message
    });

    // **********************************************************************************************************************
    // Use Claude Code if available
    // **********************************************************************************************************************
    if (availabilityCheck.success && availabilityCheck.data) {
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
        
        if (claudeResult.success) {
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
                `Claude Code automated changes - ${question.slice(0, 50)}...`
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
        } else {
          console.warn(`[ASK API] ⚠️ Claude Code failed after ${claudeExecutionTime}ms, falling back to API:`, claudeResult.error?.message);
        }
      } catch (claudeError) {
        const claudeExecutionTime = Date.now() - claudeStart;
        console.error(`[ASK API] ❌ Claude Code execution threw error after ${claudeExecutionTime}ms:`, claudeError);
        console.error(`[ASK API] Error details:`, {
          name: claudeError instanceof Error ? claudeError.name : 'Unknown',
          message: claudeError instanceof Error ? claudeError.message : String(claudeError),
          stack: claudeError instanceof Error ? claudeError.stack : undefined
        });
      }
    } else {
      console.log(`[ASK API] 📱 Claude Code not available, using fallback API. Reason:`, 
        !availabilityCheck.success ? availabilityCheck.error?.message : 'Not installed or not accessible');
    }
    
    // **********************************************************************************************************************
    // Fallback to Anthropic API if Claude Code not available or failed
    // **********************************************************************************************************************
    console.log(`[ASK API] 🔄 Falling back to Anthropic API`);
    
    if (!anthropic) {
      console.error(`[ASK API] ❌ Neither Claude Code nor Anthropic API key is configured`);
      return NextResponse.json(
        { error: 'Neither Claude Code nor Anthropic API key is configured. Please install Claude Code or set CLAUDE_API_KEY.' },
        { status: 503 }
      );
    }

    // Get directory analysis for context
    console.log(`[ASK API] 📁 Analyzing directory for context...`);
    const analysisStart = Date.now();
    const analysisResult = await cacheManager.analyzeDirectory(workspace.path);
    const analysisTime = Date.now() - analysisStart;
    console.log(`[ASK API] Directory analysis completed in ${analysisTime}ms`);
    
    let codebaseContext = '';
    
    if (analysisResult.success) {
      const analysis = analysisResult.data;
      codebaseContext = `
      Repository: ${workspace.repoUrl}
      Branch: ${workspace.targetBranch}
      Files: ${analysis.fileCount}
      Languages: ${analysis.languages.join(', ')}

      Project Structure:
      ${analysis.structure.slice(0, 15).map((item: any) => 
        `${item.type === 'directory' ? '📁' : '📄'} ${item.name}`
      ).join('\n')}
      `;
      
      console.log(`[ASK API] Context prepared:`, {
        fileCount: analysis.fileCount,
        languages: analysis.languages,
        structureItems: analysis.structure.length
      });
    } else {
      console.warn(`[ASK API] Directory analysis failed:`, analysisResult.error?.message);
    }

    // Prepare the message for Claude API
    const systemPrompt = `You are a helpful AI assistant that analyzes code repositories. You have access to information about this codebase:

    ${codebaseContext}

    Additional context: ${context || 'None provided'}

    Please provide helpful, specific answers about the codebase. Note: You're using the API fallback mode, so you don't have direct file access. If you need to see specific file contents, mention which files would be most relevant.`;

    // Call Claude API as fallback
    console.log(`[ASK API] 🤖 Calling Anthropic API...`);
    const apiStart = Date.now();
    
    try {
      const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1000,
        temperature: 0.1,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: question
          }
        ]
      });

      const apiTime = Date.now() - apiStart;
      console.log(`[ASK API] ✅ Anthropic API call completed in ${apiTime}ms`);

      const responseText = response.content?.[0]?.type === 'text' ? response.content[0].text : 'No response generated';
      
      console.log(`[ASK API] API response summary:`, {
        responseLength: responseText.length,
        inputTokens: response.usage?.input_tokens || 0,
        outputTokens: response.usage?.output_tokens || 0
      });

      const totalTime = Date.now() - startTime;
      console.log(`[ASK API] 🎯 Request completed successfully in ${totalTime}ms (${(totalTime / 1000).toFixed(2)}s) using Anthropic API`);

      return NextResponse.json({
        success: true,
        response: responseText,
        method: 'anthropic-api',
        workspace: {
          id: workspace.id,
          path: workspace.path,
          repoUrl: workspace.repoUrl,
          targetBranch: workspace.targetBranch
        },
        timing: {
          total: totalTime,
          apiCall: apiTime
        },
        ...(response.usage && {
          usage: {
            inputTokens: response.usage.input_tokens || 0,
            outputTokens: response.usage.output_tokens || 0
          }
        })
      });
    } catch (apiError) {
      const apiTime = Date.now() - apiStart;
      console.error(`[ASK API] ❌ Anthropic API call failed after ${apiTime}ms:`, apiError);
      throw apiError;
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