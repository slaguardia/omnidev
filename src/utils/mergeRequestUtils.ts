/**
 * Merge Request utilities for generating summaries and automating MR creation
 */

import Anthropic from '@anthropic-ai/sdk';
import { GitOperations } from '@/utils/gitOperations';
import { GitLabAPI, createGitLabAPI } from '@/utils/gitlabApi';
import type { 
  MergeRequestSummary, 
  CreateMergeRequestOptions,
  GitLabMergeRequest,
  AsyncResult,
  FilePath,
  GitUrl,
  WorkspaceId
} from '@/types/index';

// Initialize Anthropic client for MR summary generation
const anthropic = process.env.CLAUDE_API_KEY ? new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
}) : null;

export interface MergeRequestContext {
  workspaceId: WorkspaceId;
  workspacePath: FilePath;
  repoUrl: GitUrl;
  sourceBranch: string;
  targetBranch: string;
  modifiedFiles?: string[];
  originalQuestion?: string;
  claudeResponse?: string;
}

export interface AutoMergeRequestOptions {
  assigneeId?: number;
  labels?: string[];
  removeSourceBranch?: boolean;
  squash?: boolean;
  skipReview?: boolean;
}


//TODO: Deprecate this garbage
/**
 * Generate a merge request summary using Claude
 */
export async function generateMergeRequestSummary(
  context: MergeRequestContext
): Promise<AsyncResult<MergeRequestSummary>> {
  try {
    if (!anthropic) {
      return {
        success: false,
        error: new Error('Claude API key not configured for MR summary generation')
      };
    }

    // Get git diff to understand changes
    const gitOps = new GitOperations(context.workspacePath);
    const statusResult = await gitOps.getStatus(context.workspacePath);
    
    let changesContext = '';
    if (statusResult.success) {
      const { staged, modified, untracked } = statusResult.data;
      changesContext = `
Files changed:
- Staged: ${staged.length > 0 ? staged.join(', ') : 'None'}
- Modified: ${modified.length > 0 ? modified.join(', ') : 'None'}  
- Untracked: ${untracked.length > 0 ? untracked.join(', ') : 'None'}
      `.trim();
    }

    const systemPrompt = `You are an expert software engineer creating merge request summaries. 
    
Your task is to analyze the changes and generate a comprehensive merge request summary.

IMPORTANT: You must respond with a valid JSON object containing the following fields:
- title: A concise, descriptive title (max 100 chars)
- description: A detailed description with sections for what was changed, why, and how to test
- changes: An array of key changes made
- impact: Assessment of the impact level (low/medium/high)
- confidence: Your confidence in the changes (0-100)
- suggestedLabels: Optional array of relevant labels
- estimatedReviewTime: Optional estimated review time (e.g., "15 minutes", "1 hour")

Repository: ${context.repoUrl}
Source Branch: ${context.sourceBranch}
Target Branch: ${context.targetBranch}

${changesContext}

${context.originalQuestion ? `Original Request: ${context.originalQuestion}` : ''}
${context.claudeResponse ? `Claude's Implementation: ${context.claudeResponse}` : ''}
${context.modifiedFiles ? `Modified Files: ${context.modifiedFiles.join(', ')}` : ''}`;

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1500,
      temperature: 0.1,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: 'Generate a merge request summary for these changes. Respond with valid JSON only.'
        }
      ]
    });

    const responseText = response.content?.[0]?.type === 'text' ? response.content[0].text : '';
    
    try {
      // Parse the JSON response
      const summary: MergeRequestSummary = JSON.parse(responseText);
      
      // Validate required fields
      if (!summary.title || !summary.description || !summary.changes || !summary.impact) {
        throw new Error('Missing required fields in Claude response');
      }

      return { success: true, data: summary };
    } catch (parseError) {
      return {
        success: false,
        error: new Error(`Failed to parse Claude response as JSON: ${parseError}`)
      };
    }

  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to generate MR summary: ${error}`)
    };
  }
}

/**
 * Create an automated merge request after Claude Code edits
 */
export async function createAutomaticMergeRequest(
  context: MergeRequestContext,
  options: AutoMergeRequestOptions = {}
): Promise<AsyncResult<GitLabMergeRequest>> {
  try {
    // Generate MR summary
    const summaryResult = await generateMergeRequestSummary(context);
    if (!summaryResult.success) {
      return {
        success: false,
        error: new Error(`Failed to generate MR summary: ${summaryResult.error.message}`)
      };
    }

    const summary = summaryResult.data;

    // Create GitLab API client
    const gitlabApi = await createGitLabAPI();
    if (!gitlabApi) {
      return {
        success: false,
        error: new Error('GitLab API not configured. Please check GitLab configuration in settings.')
      };
    }

    // Extract project ID from repo URL
    const projectId = GitLabAPI.extractProjectIdFromUrl(context.repoUrl);
    if (!projectId) {
      return {
        success: false,
        error: new Error(`Failed to extract project ID from repository URL: ${context.repoUrl}`)
      };
    }

    // Create merge request options
    const mrOptions: CreateMergeRequestOptions = {
      projectId,
      title: summary.title,
      description: formatMergeRequestDescription(summary, context),
      sourceBranch: context.sourceBranch,
      targetBranch: context.targetBranch,
      labels: [...(summary.suggestedLabels || []), ...(options.labels || [])],
      ...(options.assigneeId !== undefined && { assigneeId: options.assigneeId }),
      removeSourceBranch: options.removeSourceBranch ?? true,
      ...(options.squash !== undefined && { squash: options.squash })
    };

    // Create the merge request
    const mrResult = await gitlabApi.createMergeRequest(mrOptions);
    
    return mrResult;

  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to create automatic merge request: ${error}`)
    };
  }
}

/**
 * Format the merge request description with proper markdown
 */
function formatMergeRequestDescription(
  summary: MergeRequestSummary,
  context: MergeRequestContext
): string {
  const sections = [
    '## Summary',
    summary.description,
    '',
    '## Key Changes',
    ...summary.changes.map(change => `- ${change}`),
    '',
    '## Impact Assessment',
    `**Level:** ${summary.impact}`,
    `**Confidence:** ${summary.confidence}%`,
    ''
  ];

  if (summary.estimatedReviewTime) {
    sections.push(`**Estimated Review Time:** ${summary.estimatedReviewTime}`, '');
  }

  if (context.originalQuestion) {
    sections.push(
      '## Original Request',
      '```',
      context.originalQuestion,
      '```',
      ''
    );
  }

  if (context.modifiedFiles && context.modifiedFiles.length > 0) {
    sections.push(
      '## Modified Files',
      ...context.modifiedFiles.map(file => `- \`${file}\``),
      ''
    );
  }

  sections.push(
    '---',
    '*This merge request was automatically generated by Claude Code integration.*'
  );

  return sections.join('\n');
}

/**
 * Get current git context for MR creation
 */
export async function getGitContextForMR(
  workspacePath: FilePath,
  repoUrl: GitUrl
): Promise<AsyncResult<Pick<MergeRequestContext, 'sourceBranch' | 'targetBranch'>>> {
  try {
    const gitOps = new GitOperations(workspacePath);
    
    // Get current branch (source)
    const currentBranchResult = await gitOps.getCurrentBranch(workspacePath);
    if (!currentBranchResult.success) {
      return {
        success: false,
        error: new Error(`Failed to get current branch: ${currentBranchResult.error.message}`)
      };
    }

    const sourceBranch = currentBranchResult.data;
    
    // Default target branch is usually 'main' or 'master'
    // You could enhance this to fetch from GitLab project settings
    const targetBranch = 'main'; // or 'master' - could be configurable

    return {
      success: true,
      data: {
        sourceBranch,
        targetBranch
      }
    };
  } catch (error) {
    return {
      success: false,
      error: new Error(`Failed to get git context: ${error}`)
    };
  }
} 