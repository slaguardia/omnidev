import { NextRequest, NextResponse } from 'next/server';
import { WorkspaceManager } from '@/managers/WorkspaceManager';
import { CacheManager } from '@/managers/CacheManager';
import { CACHE_CONFIG } from '@/config/cache';
import { askClaudeCode, checkClaudeCodeAvailability } from '@/utils/claudeCodeIntegration';
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
  try {
    const { workspaceId, question, context } = await request.json();

    if (!workspaceId || !question) {
      return NextResponse.json(
        { error: 'Workspace ID and question are required' },
        { status: 400 }
      );
    }

    // Initialize workspace manager
    const initResult = await workspaceManager.initialize();
    if (!initResult.success) {
      return NextResponse.json(
        { error: 'Failed to initialize workspace manager', details: initResult.error?.message },
        { status: 500 }
      );
    }

    // Get workspace
    const workspaceResult = await workspaceManager.loadWorkspace(workspaceId as WorkspaceId);
    if (!workspaceResult.success) {
      return NextResponse.json(
        { error: 'Failed to load workspace', details: workspaceResult.error?.message },
        { status: 404 }
      );
    }

    const workspace = workspaceResult.data;

    // Check if workspace directory exists
    try {
      await access(workspace.path);
    } catch {
      return NextResponse.json(
        { error: 'Workspace directory not found. The workspace may have been deleted.' },
        { status: 404 }
      );
    }

    // Check Claude Code availability first
    const availabilityCheck = await checkClaudeCodeAvailability();
    console.log('Claude Code availability check:', availabilityCheck);
    
    if (availabilityCheck.success && availabilityCheck.data) {
      // Use Claude Code if available
      console.log('Using Claude Code for enhanced repository analysis');
      console.log('Executing Claude Code with:', { question, workspacePath: workspace.path, context });
      
      const claudeResult = await askClaudeCode(question, {
        workingDirectory: workspace.path,
        context
      });

      console.log('Claude Code result:', claudeResult);

      if (claudeResult.success) {
        return NextResponse.json({
          success: true,
          response: claudeResult.data,
          method: 'claude-code',
          workspace: {
            id: workspace.id,
            path: workspace.path,
            repoUrl: workspace.repoUrl,
            branch: workspace.branch
          }
        });
      } else {
        console.warn('Claude Code failed, falling back to API:', claudeResult.error?.message);
      }
    } else {
      console.log('Claude Code not available, using fallback API');
    }

    // Fallback to Anthropic API if Claude Code not available or failed
    if (!anthropic) {
      return NextResponse.json(
        { error: 'Neither Claude Code nor Anthropic API key is configured. Please install Claude Code or set CLAUDE_API_KEY.' },
        { status: 503 }
      );
    }

    // Get directory analysis for context
    const analysisResult = await cacheManager.analyzeDirectory(workspace.path);
    let codebaseContext = '';
    
    if (analysisResult.success) {
      const analysis = analysisResult.data;
      codebaseContext = `
Repository: ${workspace.repoUrl}
Branch: ${workspace.branch}
Files: ${analysis.fileCount}
Languages: ${analysis.languages.join(', ')}

Project Structure:
${analysis.structure.slice(0, 15).map((item: any) => 
  `${item.type === 'directory' ? '📁' : '📄'} ${item.name}`
).join('\n')}
`;
    }

    // Prepare the message for Claude API
    const systemPrompt = `You are a helpful AI assistant that analyzes code repositories. You have access to information about this codebase:

${codebaseContext}

Additional context: ${context || 'None provided'}

Please provide helpful, specific answers about the codebase. Note: You're using the API fallback mode, so you don't have direct file access. If you need to see specific file contents, mention which files would be most relevant.`;

    // Call Claude API as fallback
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

    const responseText = response.content?.[0]?.type === 'text' ? response.content[0].text : 'No response generated';

    return NextResponse.json({
      success: true,
      response: responseText,
      method: 'anthropic-api',
      workspace: {
        id: workspace.id,
        path: workspace.path,
        repoUrl: workspace.repoUrl,
        branch: workspace.branch
      },
      ...(response.usage && {
        usage: {
          inputTokens: response.usage.input_tokens || 0,
          outputTokens: response.usage.output_tokens || 0
        }
      })
    });

  } catch (error) {
    console.error('Error in ask API:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 