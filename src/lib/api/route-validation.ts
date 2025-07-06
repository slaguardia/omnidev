import { NextResponse } from 'next/server';
import { AskRouteParams, EditRouteParams } from '@/lib/api/types';

//TODO: Implement zod validation for the request body

/**
 * Validates and parses ask route parameters with defaults
 */
export function validateAndParseAskRouteParams(
  body: AskRouteParams,
  logPrefix: string
): { success: boolean; data?: AskRouteParams; error?: NextResponse } {
  const { workspaceId, question, context, sourceBranch } = body;

  // Log request payload
  console.log(`[${logPrefix}] Request payload:`, {
    workspaceId,
    questionLength: question?.length || 0,
    contextLength: context?.length || 0,
    sourceBranch,
    timestamp: new Date().toISOString()
  });

  // Validate required fields
  if (!workspaceId || !question || !sourceBranch) {
    console.log(`[${logPrefix}] Invalid request - missing required fields`);
    return {
      success: false,
      error: NextResponse.json(
        { error: 'Workspace ID and question are required' },
        { status: 400 }
      )
    };
  }

  // Prepare parsed data with defaults
  const parsedData: AskRouteParams = {
    workspaceId: workspaceId,
    question: question,
    context: context || null,
    sourceBranch: sourceBranch,
  };

  return {
    success: true,
    data: parsedData
  };
}

/**
 * Validates and parses edit route parameters with defaults
 * TODO: make this better with Zod
 */
export function validateAndParseEditRouteParams(
  body: EditRouteParams,
  logPrefix: string
): { success: boolean; data?: EditRouteParams; error?: NextResponse } {
  const { workspaceId, question, context, sourceBranch, createMR, taskId, taskName, newBranchName } = body;

  // Log request payload
  console.log(`[${logPrefix}] Request payload:`, {
    workspaceId,
    questionLength: question?.length || 0,
    contextLength: context?.length || 0,
    sourceBranch,
    createMR,
    taskId,
    taskName,
    newBranchName,
    timestamp: new Date().toISOString()
  });

  // Validate required fields
  if (!workspaceId || !question || !sourceBranch || createMR === undefined) {
    console.log(`[${logPrefix}] Invalid request - missing required fields`, {
      workspaceId: !!workspaceId,
      question: !!question,
      sourceBranch: !!sourceBranch,
      createMR: createMR
    });
    return {
      success: false,
      error: NextResponse.json(
        { error: 'Workspace ID, question, source branch, and create MR are required' },
        { status: 400 }
      )
    };
  }

  // Prepare parsed data with defaults
  const parsedData: EditRouteParams = {
    workspaceId: workspaceId,
    question: question,
    context: context || null,
    sourceBranch: sourceBranch,
    createMR: createMR,
    taskId: taskId || '',
    taskName: taskName || '',
    newBranchName: newBranchName || ''
  };

  return {
    success: true,
    data: parsedData
  };
} 