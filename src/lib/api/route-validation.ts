import { NextResponse } from 'next/server';
import { AskRouteParams, EditRouteParams } from '@/lib/api/types';
import { z } from 'zod';
import type { WorkspaceId } from '@/lib/common/types';

// Zod schemas for route params
const AskRouteParamsSchema = z.object({
  workspaceId: z.string().min(1, 'Workspace ID is required'),
  question: z.string().min(1, 'Question is required'),
  context: z.string().nullable().optional(),
  sourceBranch: z.string().min(1).optional(),
  callback: z
    .object({
      url: z.string().url(),
      secret: z.string().min(1).optional(),
    })
    .optional(),
});

const EditRouteParamsSchema = AskRouteParamsSchema.extend({
  createMR: z.boolean().optional().default(false),
});

/**
 * Validates and parses ask route parameters with defaults using Zod
 */
export function validateAndParseAskRouteParams(
  body: unknown,
  logPrefix: string
): { success: boolean; data?: AskRouteParams; error?: NextResponse } {
  // Log request payload
  const {
    workspaceId,
    question,
    context,
    sourceBranch: sourceBranchRaw,
  } = (body as Record<string, unknown>) || {};
  console.log(`[${logPrefix}] Request payload:`, {
    workspaceId,
    questionLength: typeof question === 'string' ? question.length : 0,
    contextLength: typeof context === 'string' ? context.length : 0,
    sourceBranch: sourceBranchRaw,
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
  const { sourceBranch: parsedSourceBranch, callback: rawCallback, ...rest } = data;
  const parsedCallback =
    rawCallback && typeof rawCallback === 'object'
      ? {
          url: rawCallback.url,
          ...(rawCallback.secret !== undefined ? { secret: rawCallback.secret } : {}),
        }
      : undefined;
  const parsedData: AskRouteParams = {
    ...rest,
    workspaceId: data.workspaceId as WorkspaceId,
    context: data.context !== undefined ? data.context : null,
    ...(parsedSourceBranch !== undefined ? { sourceBranch: parsedSourceBranch } : {}),
    ...(parsedCallback !== undefined ? { callback: parsedCallback } : {}),
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
    sourceBranch: sourceBranchRaw,
    createMR,
  } = (body as Record<string, unknown>) || {};
  console.log(`[${logPrefix}] Request payload:`, {
    workspaceId,
    questionLength: typeof question === 'string' ? question.length : 0,
    contextLength: typeof context === 'string' ? context.length : 0,
    sourceBranch: sourceBranchRaw,
    createMR,
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

  // Cast workspaceId and ensure context is string|null
  const data = result.data;
  const { sourceBranch: parsedSourceBranch, callback: rawCallback, ...rest } = data;
  const parsedCallback =
    rawCallback && typeof rawCallback === 'object'
      ? {
          url: rawCallback.url,
          ...(rawCallback.secret !== undefined ? { secret: rawCallback.secret } : {}),
        }
      : undefined;
  const parsedData: EditRouteParams = {
    ...rest,
    workspaceId: data.workspaceId as WorkspaceId,
    context: data.context !== undefined ? data.context : null,
    ...(parsedSourceBranch !== undefined ? { sourceBranch: parsedSourceBranch } : {}),
    ...(parsedCallback !== undefined ? { callback: parsedCallback } : {}),
  };

  return {
    success: true,
    data: parsedData,
  };
}
