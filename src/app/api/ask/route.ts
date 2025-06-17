import { NextRequest, NextResponse } from 'next/server';
import { WorkspaceManager } from '@/managers/WorkspaceManager';
import { askClaudeCode, checkClaudeCodeAvailability } from '@/utils/claudeCodeIntegration';
import { access } from 'node:fs/promises';
import type { WorkspaceId } from '@/types/index';

const workspaceManager = new WorkspaceManager();

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

    // Check Claude Code availability
    const availabilityCheck = await checkClaudeCodeAvailability();
    if (!availabilityCheck.success || !availabilityCheck.data) {
      return NextResponse.json(
        { error: 'Claude Code is not available. Make sure Claude Code is installed and accessible.' },
        { status: 503 }
      );
    }

    // Execute Claude Code
    const claudeResult = await askClaudeCode(question, {
      workingDirectory: workspace.path,
      context
    });

    if (!claudeResult.success) {
      return NextResponse.json(
        { error: 'Claude request failed', details: claudeResult.error?.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      response: claudeResult.data,
      workspace: {
        id: workspace.id,
        path: workspace.path,
        repoUrl: workspace.repoUrl,
        branch: workspace.branch
      }
    });

  } catch (error) {
    console.error('Error in ask API:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 