import { NextResponse } from 'next/server';
import { AskRouteParams, EditRouteParams } from '@/lib/api/types';
import { z } from 'zod';
import type { WorkspaceId } from '@/lib/common/types';

//TODO: Implement zod validation for the request body

// Zod schemas for route params
const AskRouteParamsSchema = z.object({
  workspaceId: z.string().min(1, 'Workspace ID is required'),
  question: z.string().min(1, 'Question is required'),
  context: z.string().nullable().optional(),
  sourceBranch: z.string().min(1, 'Source branch is required'),
});

const EditRouteParamsSchema = AskRouteParamsSchema.extend({
  createMR: z.boolean(),
  taskId: z.string().optional(),
  taskName: z.string().optional(),
  newBranchName: z.string().optional(),
});

/**
 * Validates and parses ask route parameters with defaults using Zod
 */
export function validateAndParseAskRouteParams(
  body: unknown,
  logPrefix: string
): { success: boolean; data?: AskRouteParams; error?: NextResponse } {
  // Log request payload
  const { workspaceId, question, context, sourceBranch } = (body as Record<string, unknown>) || {};
  console.log(`[${logPrefix}] Request payload:`, {
    workspaceId,
    questionLength: typeof question === 'string' ? question.length : 0,
    contextLength: typeof context === 'string' ? context.length : 0,
    sourceBranch,
    timestamp: new Date().toISOString(),
  });

  const result = AskRouteParamsSchema.safeParse(body);
  if (!result.success) {
    console.log(`[${logPrefix}] Invalid request - Zod errors`, result.error.flatten());
    return {
      success: false,
      error: NextResponse.json(
        { error: 'Invalid request', details: result.error.flatten() },
        { status: 400 }
      ),
    };
  }

  // Cast workspaceId to WorkspaceId and ensure context is string|null
  const data = result.data;
  const parsedData: AskRouteParams = {
    ...data,
    workspaceId: data.workspaceId as WorkspaceId,
    context: data.context !== undefined ? data.context : null,
  };

  return {
    success: true,
    data: parsedData,
  };
}

/**
 * Validates and parses edit route parameters with defaults using Zod
 */
export function validateAndParseEditRouteParams(
  body: unknown,
  logPrefix: string
): { success: boolean; data?: EditRouteParams; error?: NextResponse } {
  // Log request payload
  const {
    workspaceId,
    question,
    context,
    sourceBranch,
    createMR,
    taskId,
    taskName,
    newBranchName,
  } = (body as Record<string, unknown>) || {};
  console.log(`[${logPrefix}] Request payload:`, {
    workspaceId,
    questionLength: typeof question === 'string' ? question.length : 0,
    contextLength: typeof context === 'string' ? context.length : 0,
    sourceBranch,
    createMR,
    taskId,
    taskName,
    newBranchName,
    timestamp: new Date().toISOString(),
  });

  const result = EditRouteParamsSchema.safeParse(body);
  if (!result.success) {
    console.log(`[${logPrefix}] Invalid request - Zod errors`, result.error.flatten());
    return {
      success: false,
      error: NextResponse.json(
        { error: 'Invalid request', details: result.error.flatten() },
        { status: 400 }
      ),
    };
  }

  // Fill in empty string for optional fields if undefined, and cast workspaceId, ensure context is string|null
  const data = result.data;
  const parsedData: EditRouteParams = {
    ...data,
    workspaceId: data.workspaceId as WorkspaceId,
    context: data.context !== undefined ? data.context : null,
    taskId: data.taskId ?? '',
    taskName: data.taskName ?? '',
    newBranchName: data.newBranchName ?? '',
  };

  return {
    success: true,
    data: parsedData,
  };
}
