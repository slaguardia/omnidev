import { NextRequest, NextResponse } from 'next/server';
import { WorkspaceManager } from '@/managers/WorkspaceManager';

const workspaceManager = new WorkspaceManager();

export async function GET() {
  try {
    // Initialize workspace manager
    const initResult = await workspaceManager.initialize();
    if (!initResult.success) {
      return NextResponse.json(
        { error: 'Failed to initialize workspace manager', details: initResult.error?.message },
        { status: 500 }
      );
    }

    // Get all workspaces
    const workspacesResult = await workspaceManager.getAllWorkspaces();
    if (!workspacesResult.success) {
      return NextResponse.json(
        { error: 'Failed to get workspaces', details: workspacesResult.error?.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      workspaces: workspacesResult.data
    });

  } catch (error) {
    console.error('Error in workspaces API:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 