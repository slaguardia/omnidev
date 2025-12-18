import type { WorkspaceId } from '@/lib/common/types';
import type { AskForm, EditForm } from '@/lib/dashboard/types';
import { NextResponse } from 'next/server';
import type { Workspace } from '@/lib/workspace/types';

export interface AskRouteParams {
  workspaceId: WorkspaceId;
  question: string;
  context?: string | null;
  /** Optional. If omitted, routes default to the workspace's targetBranch. */
  sourceBranch?: string;
  /** Optional webhook callback invoked when the queued job completes/fails. */
  callback?: {
    url: string;
    secret?: string;
  };
}

export interface EditRouteParams extends AskRouteParams {
  /** Optional. Defaults to false. */
  createMR?: boolean;
}

export interface WorkspaceValidationResult {
  success: boolean;
  workspace?: Workspace;
  error?: string;
  response?: NextResponse;
}

// Utility functions for type-safe payload transformation
export const transformAskFormToParams = (form: AskForm): AskRouteParams => {
  const params: AskRouteParams = {
    workspaceId: form.workspaceId as WorkspaceId,
    question: form.question,
    context: form.context || null,
  };

  if (form.sourceBranch && form.sourceBranch.trim().length > 0) {
    params.sourceBranch = form.sourceBranch.trim();
  }

  return params;
};

export const transformEditFormToParams = (form: EditForm): EditRouteParams => {
  const params: EditRouteParams = {
    workspaceId: form.workspaceId as WorkspaceId,
    question: form.question,
    context: form.context || null,
    createMR: form.createMR,
  };

  if (form.sourceBranch && form.sourceBranch.trim().length > 0) {
    params.sourceBranch = form.sourceBranch.trim();
  }

  return params;
};
