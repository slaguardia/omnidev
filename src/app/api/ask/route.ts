import { NextRequest, NextResponse } from 'next/server';
import { initializeWorkspaceManager, loadWorkspace } from '@/lib/managers/workspace-manager';
import { checkClaudeCodeAvailability } from '@/lib/claudeCode';
import { withAuth } from '@/lib/auth/middleware';
import { access } from 'node:fs/promises';
import type { WorkspaceId } from '@/lib/types/index';
import { executeOrQueue, type ClaudeCodeJobPayload } from '@/lib/queue';
import {
  validateAndParseAskRouteParams,
  parseJsonBody,
  createRequestTimer,
  notFound,
  serverError,
  serviceUnavailable,
} from '@/lib/api';

// This api route needs either next-auth or api key authentication
export async function POST(request: NextRequest) {
  const timer = createRequestTimer('ASK API');

  try {
    // Authentication check
    const authResult = await withAuth(request);
    if (!authResult.success) {
      return authResult.response!;
    }

    console.log(
      `[ASK API] Authentication successful for user: ${authResult.auth!.clientName} (${authResult.auth!.userId})`
    );

    // Parse and validate request body (Zod)
    const bodyResult = await parseJsonBody(request, 'ASK API');
    if (!bodyResult.success) {
      return bodyResult.response;
    }

    const validationResult = validateAndParseAskRouteParams(bodyResult.data, 'ASK API');
    if (!validationResult.success) {
      return validationResult.error!;
    }

    const { workspaceId, question, context, sourceBranch, callback } = validationResult.data!;

    // Initialize workspace manager
    console.log(`[ASK API] Initializing workspace manager...`);
    const initStart = Date.now();
    const initResult = await initializeWorkspaceManager();
    console.log(`[ASK API] Workspace manager initialized in ${Date.now() - initStart}ms`);

    if (!initResult.success) {
      console.error(`[ASK API] Failed to initialize workspace manager:`, initResult.error?.message);
      return serverError(initResult.error, 'Failed to initialize workspace manager');
    }

    // Get workspace
    console.log(`[ASK API] Loading workspace: ${workspaceId}`);
    const workspaceStart = Date.now();
    const workspaceResult = await loadWorkspace(workspaceId as WorkspaceId);
    console.log(`[ASK API] Workspace loaded in ${Date.now() - workspaceStart}ms`);

    if (!workspaceResult.success) {
      console.error(`[ASK API] Failed to load workspace:`, workspaceResult.error?.message);
      return notFound('Failed to load workspace', workspaceResult.error?.message);
    }

    const workspace = workspaceResult.data;
    console.log(`[ASK API] Workspace selected`, {
      id: workspace.id,
      targetBranch: workspace.targetBranch,
    });

    // Check if workspace directory exists
    console.log(`[ASK API] Checking workspace directory access`);
    try {
      await access(workspace.path);
      console.log(`[ASK API] Workspace directory accessible`);
    } catch (error) {
      console.error(`[ASK API] Workspace directory not accessible:`, error);
      return notFound('Workspace directory not found. The workspace may have been deleted.');
    }

    // Check Claude Code availability
    console.log(`[ASK API] Checking Claude Code availability...`);
    const availabilityStart = Date.now();
    const availabilityCheck = await checkClaudeCodeAvailability();
    const availabilityTime = Date.now() - availabilityStart;
    console.log(`[ASK API] Claude Code availability check completed in ${availabilityTime}ms:`, {
      success: availabilityCheck.success,
      available: availabilityCheck.success ? availabilityCheck.data : false,
      error: availabilityCheck.success ? undefined : availabilityCheck.error?.message,
    });

    if (!availabilityCheck.success || !availabilityCheck.data) {
      const errorMessage = !availabilityCheck.success
        ? availabilityCheck.error?.message
        : 'Not installed or not accessible';
      console.error(`[ASK API] Claude Code not available:`, errorMessage);
      return serviceUnavailable(
        'Claude Code is not available. Please ensure Claude Code is installed and accessible.'
      );
    }

    // Queue the job for background processing (always returns immediately)
    console.log(`[ASK API] 🚀 Queueing Claude Code job for repository analysis`);
    console.log(`[ASK API] Job parameters:`, {
      questionLength: question.length,
      contextLength: context?.length || 0,
      sourceBranch: sourceBranch || workspace.targetBranch || 'default',
      workspaceId: workspace.id,
    });

    try {
      // Build job payload
      const jobPayload: ClaudeCodeJobPayload = {
        workspaceId: workspace.id as WorkspaceId,
        workspacePath: workspace.path,
        question,
        repoUrl: workspace.repoUrl,
      };
      if (context !== null && context !== undefined) {
        jobPayload.context = context;
      }
      const effectiveSourceBranch = sourceBranch || workspace.targetBranch;
      if (effectiveSourceBranch) {
        jobPayload.sourceBranch = effectiveSourceBranch;
      }
      if (callback) {
        jobPayload.callback = callback;
      }

      // Always queue the job (forceQueue: true) - returns immediately
      const execution = await executeOrQueue('claude-code', jobPayload, { forceQueue: true });

      // forceQueue guarantees immediate: false, but TypeScript needs the check
      if (execution.immediate) {
        // This branch should never execute with forceQueue: true
        throw new Error('Unexpected immediate execution with forceQueue enabled');
      }

      console.log(`[ASK API] 📋 Job queued with ID: ${execution.jobId} in ${timer.elapsed()}ms`);

      return NextResponse.json({
        success: true,
        queued: true,
        jobId: execution.jobId,
        message: 'Job queued - poll /api/jobs/:jobId for results',
        workspace: {
          id: workspace.id,
          targetBranch: workspace.targetBranch,
        },
      });
    } catch (queueError) {
      console.error(`[ASK API] ❌ Failed to queue job after ${timer.elapsed()}ms:`, queueError);
      return serverError(queueError, 'Failed to queue job');
    }
  } catch (error) {
    timer.logError(error);
    return serverError(error);
  }
}
