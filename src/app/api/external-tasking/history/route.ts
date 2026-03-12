import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { listJobs } from '@/lib/queue';
import type { Job, JobStatus, ClaudeCodeJobPayload, ClaudeCodeJobResult } from '@/lib/queue';
import { getProjectDisplayName } from '@/lib/dashboard/helpers';

/**
 * Valid statuses for filtering
 */
const VALID_STATUSES: readonly JobStatus[] = [
  'pending',
  'processing',
  'completed',
  'failed',
] as const;

/**
 * Query parameters for external tasking history
 */
interface HistoryQueryParams {
  page: number;
  pageSize: number;
  status: JobStatus[] | null;
  workspaceId: string | null;
  startDate: string | null;
  endDate: string | null;
}

/**
 * Transformed job item for the response
 */
interface ExternalTaskingHistoryItem {
  id: string;
  status: JobStatus;
  workspaceId: string;
  workspaceName: string;
  question: string;
  editRequest: boolean;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  executionTimeMs: number | null;
  sourceBranch: string | null;
  targetBranch: string | null;
  mergeRequestUrl: string | null;
  error: string | null;
  hasResult: boolean;
}

/**
 * Workspace info for filter dropdown
 */
interface WorkspaceInfo {
  id: string;
  name: string;
}

/**
 * Response structure for paginated history
 */
interface ExternalTaskingHistoryResponse {
  items: ExternalTaskingHistoryItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  currentJob: ExternalTaskingHistoryItem | null;
  statusCounts: {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  };
  availableWorkspaces: WorkspaceInfo[];
}

/**
 * Parse query parameters from request URL
 */
function parseQueryParams(request: NextRequest): HistoryQueryParams {
  const url = new URL(request.url);

  // Page (1-indexed, default 1)
  const pageRaw = url.searchParams.get('page');
  const page = pageRaw ? Math.max(1, Math.floor(Number(pageRaw)) || 1) : 1;

  // Page size (default 25, max 100)
  const pageSizeRaw = url.searchParams.get('pageSize');
  let pageSize = pageSizeRaw ? Math.floor(Number(pageSizeRaw)) || 25 : 25;
  pageSize = Math.max(1, Math.min(100, pageSize));

  // Status filter (supports repeated params or comma-separated)
  const statusRaw = url.searchParams.getAll('status').flatMap((s) =>
    s
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
  );
  const status: JobStatus[] | null =
    statusRaw.length > 0
      ? (Array.from(new Set(statusRaw)).filter((s) =>
          (VALID_STATUSES as readonly string[]).includes(s)
        ) as JobStatus[])
      : null;

  // Workspace ID filter
  const workspaceId = url.searchParams.get('workspaceId') || null;

  // Date range filters (ISO format strings)
  const startDate = url.searchParams.get('startDate') || null;
  const endDate = url.searchParams.get('endDate') || null;

  return {
    page,
    pageSize,
    status: status && status.length > 0 ? status : null,
    workspaceId,
    startDate,
    endDate,
  };
}

/**
 * Transform a Job into an ExternalTaskingHistoryItem
 */
function transformJob(job: Job<ClaudeCodeJobPayload>): ExternalTaskingHistoryItem {
  const payload = job.payload;
  const result = job.result as ClaudeCodeJobResult | undefined;

  // Derive workspace name from repo URL or use workspace ID
  const workspaceName = payload.repoUrl
    ? getProjectDisplayName(payload.repoUrl)
    : String(payload.workspaceId);

  // Extract branch info from gitInitResult if available
  let sourceBranch: string | null = payload.sourceBranch || null;
  let targetBranch: string | null = null;

  if (result?.gitInitResult && typeof result.gitInitResult === 'object') {
    const gitInit = result.gitInitResult as {
      sourceBranch?: string;
      targetBranch?: string;
    };
    if (gitInit.sourceBranch) {
      sourceBranch = gitInit.sourceBranch;
    }
    if (gitInit.targetBranch) {
      targetBranch = gitInit.targetBranch;
    }
  }

  // Extract merge request URL from postExecution
  const mergeRequestUrl = result?.postExecution?.mergeRequestUrl || null;

  return {
    id: job.id,
    status: job.status,
    workspaceId: String(payload.workspaceId),
    workspaceName,
    question: payload.question,
    editRequest: payload.editRequest ?? payload.createMR ?? false,
    createdAt: job.createdAt,
    startedAt: job.startedAt || null,
    completedAt: job.completedAt || null,
    executionTimeMs: result?.executionTimeMs || null,
    sourceBranch,
    targetBranch,
    mergeRequestUrl,
    error: job.error || null,
    hasResult: !!job.result,
  };
}

/**
 * GET /api/external-tasking/history
 *
 * Get paginated claude-code job history with filtering support.
 *
 * Query params:
 * - page: Page number (1-indexed, default: 1)
 * - pageSize: Items per page (default: 25, max: 100)
 * - status: Job status filter (repeated or comma-separated: pending, processing, completed, failed)
 * - workspaceId: Filter by workspace ID
 * - startDate: Filter jobs created on or after this ISO date
 * - endDate: Filter jobs created on or before this ISO date
 *
 * Response:
 * - items: Array of job items for the current page
 * - total: Total number of matching jobs
 * - page: Current page number
 * - pageSize: Items per page
 * - totalPages: Total number of pages
 * - currentJob: Currently processing job (if any)
 * - statusCounts: Count of jobs by status (for filter badges)
 */
export async function GET(request: NextRequest) {
  try {
    // Authentication check
    const authResult = await withAuth(request);
    if (!authResult.success) {
      return authResult.response!;
    }

    const params = parseQueryParams(request);

    // Fetch all jobs (we filter in memory since the file-based storage doesn't support complex queries)
    const allJobs = await listJobs();

    // Filter to only claude-code jobs
    const claudeCodeJobs = allJobs.filter(
      (job) => job.type === 'claude-code'
    ) as Job<ClaudeCodeJobPayload>[];

    // Calculate status counts before applying status filter (for UI badges)
    const statusCounts = {
      pending: claudeCodeJobs.filter((j) => j.status === 'pending').length,
      processing: claudeCodeJobs.filter((j) => j.status === 'processing').length,
      completed: claudeCodeJobs.filter((j) => j.status === 'completed').length,
      failed: claudeCodeJobs.filter((j) => j.status === 'failed').length,
    };

    // Extract unique workspaces from all jobs (for filter dropdown)
    const workspaceMap = new Map<string, string>();
    for (const job of claudeCodeJobs) {
      const workspaceId = String(job.payload.workspaceId);
      if (!workspaceMap.has(workspaceId)) {
        const workspaceName = job.payload.repoUrl
          ? getProjectDisplayName(job.payload.repoUrl)
          : workspaceId;
        workspaceMap.set(workspaceId, workspaceName);
      }
    }
    const availableWorkspaces: WorkspaceInfo[] = Array.from(workspaceMap.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // Find currently processing job
    const processingJob = claudeCodeJobs.find((j) => j.status === 'processing');
    const currentJob = processingJob ? transformJob(processingJob) : null;

    // Apply filters
    let filteredJobs = claudeCodeJobs;

    // Status filter
    if (params.status) {
      filteredJobs = filteredJobs.filter((job) => params.status!.includes(job.status));
    }

    // Workspace ID filter
    if (params.workspaceId) {
      filteredJobs = filteredJobs.filter(
        (job) => String(job.payload.workspaceId) === params.workspaceId
      );
    }

    // Date range filters
    if (params.startDate) {
      const startTime = new Date(params.startDate).getTime();
      if (!Number.isNaN(startTime)) {
        filteredJobs = filteredJobs.filter((job) => new Date(job.createdAt).getTime() >= startTime);
      }
    }

    if (params.endDate) {
      const endTime = new Date(params.endDate).getTime();
      if (!Number.isNaN(endTime)) {
        // Add a day to include the end date fully
        const endOfDay = endTime + 24 * 60 * 60 * 1000 - 1;
        filteredJobs = filteredJobs.filter((job) => new Date(job.createdAt).getTime() <= endOfDay);
      }
    }

    // Sort by createdAt descending (newest first) - already sorted by listJobs, but ensure it
    filteredJobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Calculate pagination
    const total = filteredJobs.length;
    const totalPages = Math.max(1, Math.ceil(total / params.pageSize));
    const page = Math.min(params.page, totalPages);
    const startIndex = (page - 1) * params.pageSize;
    const endIndex = startIndex + params.pageSize;

    // Get page slice
    const pageJobs = filteredJobs.slice(startIndex, endIndex);

    // Transform jobs for response
    const items = pageJobs.map(transformJob);

    const response: ExternalTaskingHistoryResponse = {
      items,
      total,
      page,
      pageSize: params.pageSize,
      totalPages,
      currentJob,
      statusCounts,
      availableWorkspaces,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[EXTERNAL TASKING HISTORY API] Error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
