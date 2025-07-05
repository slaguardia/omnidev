import type { Workspace, WorkspaceId } from '@/lib/types/index';
import type { AskForm, EditForm } from '@/lib/dashboard/types';
import { NextResponse } from 'next/server';

export interface AskRouteParams {
    workspaceId: WorkspaceId;
    question: string;
    context: string | null;
    sourceBranch: string;
}

export interface EditRouteParams extends AskRouteParams {
    createMR: boolean;
    taskId?: string;
    taskName?: string;
    newBranchName?: string;
}

export interface WorkspaceValidationResult {
    success: boolean;
    workspace?: Workspace;
    error?: string;
    response?: NextResponse;
}

// Utility functions for type-safe payload transformation
export const transformAskFormToParams = (form: AskForm): AskRouteParams => ({
    workspaceId: form.workspaceId as WorkspaceId,
    question: form.question,
    context: form.context || null,
    sourceBranch: form.sourceBranch,
});

export const transformEditFormToParams = (form: EditForm): EditRouteParams => {
    const params: EditRouteParams = {
        workspaceId: form.workspaceId as WorkspaceId,
        question: form.question,
        context: form.context || null,
        sourceBranch: form.sourceBranch,
        createMR: form.createMR,
    };
    
    // Only include optional properties if they have values
    if (form.taskId && form.taskId.trim()) {
        params.taskId = form.taskId;
    }
    if (form.taskName && form.taskName.trim()) {
        params.taskName = form.taskName;
    }
    if (form.newBranchName && form.newBranchName.trim()) {
        params.newBranchName = form.newBranchName;
    }
    
    return params;
};