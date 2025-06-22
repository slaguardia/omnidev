import { NextRequest, NextResponse } from 'next/server';
import { WorkspaceManager } from '@/managers/WorkspaceManager';
import { 
  createAutomaticMergeRequest, 
  generateMergeRequestSummary,
  getGitContextForMR,
  type MergeRequestContext,
  type AutoMergeRequestOptions 
} from '@/utils/mergeRequestUtils';
import { access } from 'node:fs/promises';
import type { WorkspaceId, GitUrl } from '@/types/index';

const workspaceManager = new WorkspaceManager();

export async function POST(request: NextRequest) {
  try {
    const { 
      workspaceId,
      targetBranch,
      assigneeId,
      labels = [],
      squash = true,
      generateSummary = true, // TODO: make this false when we have a way to generate a good summary
      manualTitle,
      manualDescription,
      originalQuestion,
      claudeResponse
    } = await request.json();

    if (!workspaceId) {
      return NextResponse.json(
        { error: 'Workspace ID is required' },
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

    console.log('Creating merge request for workspace:', workspaceId);

    // Get git context (current branch, target branch)
    const gitContextResult = await getGitContextForMR(workspace.path, workspace.repoUrl as GitUrl);
    
    if (!gitContextResult.success) {
      return NextResponse.json(
        { error: 'Failed to get git context', details: gitContextResult.error.message },
        { status: 500 }
      );
    }

    // Create MR context
    const mrContext: MergeRequestContext = {
      workspaceId: workspace.id,
      workspacePath: workspace.path,
      repoUrl: workspace.repoUrl as GitUrl,
      sourceBranch: gitContextResult.data.sourceBranch,
      targetBranch: targetBranch || gitContextResult.data.targetBranch,
      originalQuestion,
      claudeResponse
    };

    let mergeRequestResult;

    if (generateSummary && !manualTitle && !manualDescription) {
      // Use automatic summary generation
      console.log('Generating automatic merge request summary...');
      
      const autoMROptions: AutoMergeRequestOptions = {
        ...(assigneeId !== undefined && { assigneeId }),
        ...(labels.length > 0 && { labels }),
        removeSourceBranch: true,
        ...(squash !== undefined && { squash })
      };

      mergeRequestResult = await createAutomaticMergeRequest(mrContext, autoMROptions);
    } else {
      // Use manual title/description or generate summary separately
      let title = manualTitle;
      let description = manualDescription;

      if (generateSummary && (!title || !description)) {
        console.log('Generating merge request summary...');
        const summaryResult = await generateMergeRequestSummary(mrContext);
        
        if (summaryResult.success) {
          title = title || summaryResult.data.title;
          description = description || summaryResult.data.description;
        } else {
          console.warn('Failed to generate summary:', summaryResult.error.message);
          if (!title || !description) {
            return NextResponse.json(
              { error: 'Failed to generate summary and no manual title/description provided', details: summaryResult.error.message },
              { status: 500 }
            );
          }
        }
      }

      if (!title || !description) {
        return NextResponse.json(
          { error: 'Title and description are required when not using automatic summary generation' },
          { status: 400 }
        );
      }

      // Create merge request with manual/generated content
      const { createGitLabAPI } = await import('@/utils/gitlabApi');
      const gitlabApi = await createGitLabAPI();
      
      if (!gitlabApi) {
        return NextResponse.json(
          { error: 'Failed to initialize GitLab API' },
          { status: 500 }
        );
      }

      const { GitLabAPI } = await import('@/utils/gitlabApi');
      const projectId = GitLabAPI.extractProjectIdFromUrl(workspace.repoUrl as GitUrl);
      
      if (!projectId) {
        return NextResponse.json(
          { error: 'Failed to extract project ID from repository URL' },
          { status: 400 }
        );
      }

      mergeRequestResult = await gitlabApi.createMergeRequest({
        projectId,
        title,
        description,
        sourceBranch: mrContext.sourceBranch,
        targetBranch: mrContext.targetBranch,
        ...(assigneeId !== undefined && { assigneeId }),
        ...(labels.length > 0 && { labels }),
        removeSourceBranch: true,
        ...(squash !== undefined && { squash })
      });
    }

    if (mergeRequestResult.success) {
      console.log('Merge request created successfully:', mergeRequestResult.data.webUrl);
      
      return NextResponse.json({
        success: true,
        mergeRequest: {
          id: mergeRequestResult.data.id,
          iid: mergeRequestResult.data.iid,
          title: mergeRequestResult.data.title,
          description: mergeRequestResult.data.description,
          state: mergeRequestResult.data.state,
          webUrl: mergeRequestResult.data.webUrl,
          sourceBranch: mergeRequestResult.data.sourceBranch,
          targetBranch: mergeRequestResult.data.targetBranch,
          createdAt: mergeRequestResult.data.createdAt,
          author: mergeRequestResult.data.author
        },
        workspace: {
          id: workspace.id,
          path: workspace.path,
          repoUrl: workspace.repoUrl,
          targetBranch: workspace.targetBranch
        }
      });
    } else {
      return NextResponse.json(
        { error: 'Failed to create merge request', details: mergeRequestResult.error.message },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Error in merge-requests API:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json(
    { 
      message: 'Merge Requests API', 
      endpoints: {
        'POST /api/merge-requests': 'Create a merge request with Claude-generated summary'
      }
    }
  );
} 