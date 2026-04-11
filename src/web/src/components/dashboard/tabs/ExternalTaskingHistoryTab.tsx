'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { usePersistedState } from '@/hooks';
import { Button } from '@heroui/button';
import { Switch } from '@heroui/switch';
import { Skeleton } from '@heroui/skeleton';
import { Chip } from '@heroui/chip';
import { Select, SelectItem } from '@heroui/select';
import { Pagination } from '@heroui/pagination';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/modal';
import { Tooltip } from '@heroui/tooltip';
import { Tabs, Tab } from '@heroui/tabs';
import SnippetsTab from './SnippetsTab';
import type { Workspace } from '@/lib/dashboard/types';
import {
  RefreshCw,
  Clock,
  Loader2,
  MessageSquare,
  Pencil,
  CheckCircle2,
  XCircle,
  Hourglass,
  Calendar,
  FolderGit2,
  X,
  Trash2,
  AlertCircle,
  Info,
  ExternalLink,
} from 'lucide-react';
import type { JobStatus, ClaudeCodeJobResult, ClaudeCodeJobPayload } from '@/lib/queue';

/**
 * All possible job statuses
 */
const ALL_STATUSES: JobStatus[] = ['pending', 'processing', 'completed', 'failed'];

/**
 * Status configuration for display
 */
const STATUS_CONFIG: Record<
  JobStatus,
  {
    label: string;
    icon: React.ElementType;
    color: 'default' | 'primary' | 'success' | 'danger' | 'warning';
  }
> = {
  pending: { label: 'Pending', icon: Hourglass, color: 'default' },
  processing: { label: 'Processing', icon: Loader2, color: 'primary' },
  completed: { label: 'Completed', icon: CheckCircle2, color: 'success' },
  failed: { label: 'Failed', icon: XCircle, color: 'danger' },
};

/**
 * Transformed job item from the API
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
 * Full job detail from /api/jobs/:id
 */
interface FullJobDetail {
  id: string;
  type: string;
  status: JobStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: ClaudeCodeJobResult;
  error?: string;
  payload?: ClaudeCodeJobPayload;
}

/**
 * Workspace info for filter dropdown
 */
interface WorkspaceInfo {
  id: string;
  name: string;
}

/**
 * API response structure
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
 * Date range presets
 */
type DateRangePreset = 'all' | 'today' | 'last7days' | 'last30days' | 'custom';

const DATE_RANGE_PRESETS: Record<DateRangePreset, { label: string }> = {
  all: { label: 'All Time' },
  today: { label: 'Today' },
  last7days: { label: 'Last 7 Days' },
  last30days: { label: 'Last 30 Days' },
  custom: { label: 'Custom Range' },
};

/**
 * Available page sizes
 */
const PAGE_SIZES = [10, 25, 50, 100] as const;
type PageSize = (typeof PAGE_SIZES)[number];
const DEFAULT_PAGE_SIZE: PageSize = 25;

/**
 * Format a Date to ISO date string (YYYY-MM-DD)
 */
function formatDateToISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Calculate start and end dates from a preset
 */
function getDateRangeFromPreset(preset: DateRangePreset): {
  startDate: string | null;
  endDate: string | null;
} {
  if (preset === 'all') {
    return { startDate: null, endDate: null };
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endDate = formatDateToISO(today);

  switch (preset) {
    case 'today':
      return { startDate: endDate, endDate };
    case 'last7days': {
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      return { startDate: formatDateToISO(start), endDate };
    }
    case 'last30days': {
      const start = new Date(today);
      start.setDate(start.getDate() - 29);
      return { startDate: formatDateToISO(start), endDate };
    }
    default:
      return { startDate: null, endDate: null };
  }
}

/**
 * Loading skeleton for the tab
 */
function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex justify-between items-center">
        <Skeleton className="h-8 w-64 rounded-lg" />
        <div className="flex items-center gap-4">
          <Skeleton className="h-6 w-28 rounded-lg" />
          <Skeleton className="h-9 w-24 rounded-lg" />
        </div>
      </div>

      {/* Job list skeleton */}
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="p-4 glass-card">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-4 rounded-full" />
                  <Skeleton className="h-4 w-32 rounded" />
                  <Skeleton className="h-5 w-12 rounded-full" />
                </div>
                <Skeleton className="h-4 w-full rounded" />
                <Skeleton className="h-4 w-48 rounded" />
              </div>
              <Skeleton className="h-8 w-8 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Empty state when no jobs exist
 */
function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="text-center py-12">
      <Clock className="w-12 h-12 text-default-300 mx-auto mb-4" />
      {hasFilters ? (
        <>
          <p className="text-default-600">No jobs match the current filters.</p>
          <p className="text-sm text-default-500">
            Try adjusting your filters or clearing them to see more results.
          </p>
        </>
      ) : (
        <>
          <p className="text-default-600">No external tasking history yet.</p>
          <p className="text-sm text-default-500">
            Make requests through the Operations tab to see your history here.
          </p>
        </>
      )}
    </div>
  );
}

/**
 * Format a timestamp as relative time (e.g., "5m ago", "2h ago", "3d ago")
 */
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = Date.now();
  const diff = now - date.getTime();

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ago`;
  }
  if (hours > 0) {
    return `${hours}h ago`;
  }
  if (minutes > 0) {
    return `${minutes}m ago`;
  }
  return 'just now';
}

/**
 * Format duration in milliseconds to human readable (e.g., "1.2s", "45s", "2m 30s")
 */
function formatDuration(ms: number | null): string | null {
  if (!ms) return null;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/**
 * Format elapsed time from a start date to now
 */
function formatElapsedTime(startDate: string): string {
  const start = new Date(startDate).getTime();
  const now = Date.now();
  const elapsed = Math.max(0, now - start);

  const seconds = Math.floor(elapsed / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Hook to get updating elapsed time for a processing job
 */
function useElapsedTime(startedAt: string | null): string {
  const [elapsed, setElapsed] = useState<string>(() =>
    startedAt ? formatElapsedTime(startedAt) : '0s'
  );

  useEffect(() => {
    if (!startedAt) return;

    // Update immediately
    setElapsed(formatElapsedTime(startedAt));

    // Update every second
    const interval = setInterval(() => {
      setElapsed(formatElapsedTime(startedAt));
    }, 1000);

    return () => clearInterval(interval);
  }, [startedAt]);

  return elapsed;
}

/**
 * Card for displaying the currently processing job
 */
function CurrentlyProcessingCard({ job }: { job: ExternalTaskingHistoryItem }) {
  const elapsedTime = useElapsedTime(job.startedAt);

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-medium flex items-center gap-2">
        <Loader2 className="w-5 h-5 text-primary-500 animate-spin" />
        Currently Processing
      </h3>
      <div className="p-4 glass-card border-2 border-primary-500/30 bg-primary-50/50 dark:bg-primary-500/10">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {/* Top row: workspace name and operation badge */}
            <div className="flex items-center gap-2 mb-2">
              <span className="font-medium text-default-700 dark:text-default-200">
                {job.workspaceName}
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full border ${
                  job.editRequest
                    ? 'bg-warning-100 text-warning-800 border-warning-300 dark:bg-warning-500/20 dark:text-warning-300 dark:border-warning-500/40'
                    : 'bg-primary-100 text-primary-800 border-primary-300 dark:bg-primary-500/20 dark:text-primary-300 dark:border-primary-500/40'
                }`}
              >
                {job.editRequest ? (
                  <Pencil className="w-3 h-3" />
                ) : (
                  <MessageSquare className="w-3 h-3" />
                )}
                {job.editRequest ? 'Edit' : 'Ask'}
              </span>
            </div>

            {/* Question preview (2-line clamp) */}
            <p className="text-sm text-default-600 dark:text-default-400 line-clamp-2 mb-2">
              {job.question}
            </p>

            {/* Bottom row: elapsed time */}
            <div className="flex items-center gap-4 text-xs text-default-500">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {elapsedTime}
              </span>
            </div>
          </div>

          {/* Pulsing indicator */}
          <div className="flex-shrink-0">
            <div className="relative">
              <div className="w-3 h-3 rounded-full bg-primary-500 animate-pulse" />
              <div className="absolute inset-0 w-3 h-3 rounded-full bg-primary-500 animate-ping opacity-75" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Props for JobCard component
 */
interface JobCardProps {
  job: ExternalTaskingHistoryItem;
  onDelete: (jobId: string) => void;
  onClick: (job: ExternalTaskingHistoryItem) => void;
  isDeleting: boolean;
}

/**
 * Card component for displaying a single job in the list
 */
function JobCard({ job, onDelete, onClick, isDeleting }: JobCardProps) {
  const config = STATUS_CONFIG[job.status];
  const StatusIcon = config.icon;
  const duration = formatDuration(job.executionTimeMs);

  return (
    <div
      className="p-4 glass-card cursor-pointer hover:bg-default-100/50 transition-colors"
      onClick={() => onClick(job)}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Top row: status icon, workspace name, Ask/Edit badge */}
          <div className="flex items-center gap-2 mb-1">
            <StatusIcon
              className={`w-4 h-4 flex-shrink-0 ${
                job.status === 'completed'
                  ? 'text-success-500'
                  : job.status === 'failed'
                    ? 'text-danger-500'
                    : job.status === 'processing'
                      ? 'text-primary-500 animate-spin'
                      : 'text-default-400'
              }`}
            />
            <span className="font-medium text-sm truncate">{job.workspaceName}</span>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full border flex-shrink-0 ${
                job.editRequest
                  ? 'bg-warning-100 text-warning-800 border-warning-300 dark:bg-warning-500/20 dark:text-warning-300 dark:border-warning-500/40'
                  : 'bg-primary-100 text-primary-800 border-primary-300 dark:bg-primary-500/20 dark:text-primary-300 dark:border-primary-500/40'
              }`}
            >
              {job.editRequest ? (
                <Pencil className="w-3 h-3" />
              ) : (
                <MessageSquare className="w-3 h-3" />
              )}
              {job.editRequest ? 'Edit' : 'Ask'}
            </span>
            {/* Pending indicator */}
            {job.status === 'pending' && (
              <span className="text-xs text-default-400 flex items-center gap-1">
                <Hourglass className="w-3 h-3" />
                Queued
              </span>
            )}
            {/* Failed indicator */}
            {job.status === 'failed' && (
              <span className="text-xs text-danger-500 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Failed
              </span>
            )}
          </div>

          {/* Question preview (2-line clamp) */}
          <p className="text-sm text-default-600 line-clamp-2 mb-2">{job.question}</p>

          {/* Bottom row: timestamp and duration */}
          <div className="flex items-center gap-4 text-xs text-default-500">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatRelativeTime(job.createdAt)}
            </span>
            {duration && <span>Duration: {duration}</span>}
          </div>
        </div>

        {/* Delete button */}
        <div onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm"
            variant="flat"
            color="danger"
            onPress={() => onDelete(job.id)}
            isIconOnly
            isLoading={isDeleting}
            aria-label="Delete job"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Format a date string to locale string
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString();
}

/**
 * Props for the JobDetailModal component
 */
interface JobDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: ExternalTaskingHistoryItem;
  fullJobDetail: FullJobDetail | null;
  isLoadingDetail: boolean;
}

/**
 * Modal component for displaying full job details
 */
function JobDetailModal({
  isOpen,
  onClose,
  job,
  fullJobDetail,
  isLoadingDetail,
}: JobDetailModalProps) {
  const [showRawOutput, setShowRawOutput] = useState(false);
  const [showJsonLogs, setShowJsonLogs] = useState(false);
  const config = STATUS_CONFIG[job.status];
  const StatusIcon = config.icon;

  // Reset toggles when modal closes
  useEffect(() => {
    if (!isOpen) {
      setShowRawOutput(false);
      setShowJsonLogs(false);
    }
  }, [isOpen]);

  // Extract result data
  const result = fullJobDetail?.result;
  const output = result?.output;
  const rawOutput = result?.rawOutput;
  const jsonLogs = result?.jsonLogs;
  const usage = result?.usage;

  // Determine if this is an MR flow
  const hasTargetBranch = job.targetBranch && job.sourceBranch !== job.targetBranch;

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => !open && onClose()}
      size="3xl"
      scrollBehavior="inside"
      classNames={{
        base: 'bg-background/85 backdrop-blur-lg border border-divider/60',
      }}
    >
      <ModalContent>
        {(closeModal) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <StatusIcon
                  className={`w-5 h-5 ${
                    job.status === 'completed'
                      ? 'text-success-500'
                      : job.status === 'failed'
                        ? 'text-danger-500'
                        : job.status === 'processing'
                          ? 'text-primary-500 animate-spin'
                          : 'text-default-400'
                  }`}
                />
                <span>Execution Details</span>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full border ${
                    job.editRequest
                      ? 'bg-warning-100 text-warning-800 border-warning-300 dark:bg-warning-500/20 dark:text-warning-300 dark:border-warning-500/40'
                      : 'bg-primary-100 text-primary-800 border-primary-300 dark:bg-primary-500/20 dark:text-primary-300 dark:border-primary-500/40'
                  }`}
                >
                  {job.editRequest ? (
                    <Pencil className="w-3 h-3" />
                  ) : (
                    <MessageSquare className="w-3 h-3" />
                  )}
                  {job.editRequest ? 'Edit' : 'Ask'}
                </span>
              </div>
              <p className="text-sm font-normal text-default-500">{formatDate(job.createdAt)}</p>
            </ModalHeader>
            <ModalBody>
              {isLoadingDetail ? (
                <div className="space-y-4">
                  <Skeleton className="h-6 w-32 rounded" />
                  <Skeleton className="h-20 w-full rounded" />
                  <Skeleton className="h-6 w-32 rounded" />
                  <Skeleton className="h-40 w-full rounded" />
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Status and timestamps */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h4 className="text-sm font-semibold text-default-700 mb-1">Status</h4>
                      <Chip
                        variant="flat"
                        color={config.color}
                        size="sm"
                        startContent={<StatusIcon className="w-3 h-3" />}
                      >
                        {config.label}
                      </Chip>
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-default-700 mb-1">
                        Execution Time
                      </h4>
                      <p className="text-sm">{formatDuration(job.executionTimeMs) || 'N/A'}</p>
                    </div>
                  </div>

                  {/* Timestamps */}
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-default-500">Created:</span>
                      <p className="font-mono text-xs">{formatDate(job.createdAt)}</p>
                    </div>
                    {job.startedAt && (
                      <div>
                        <span className="text-default-500">Started:</span>
                        <p className="font-mono text-xs">{formatDate(job.startedAt)}</p>
                      </div>
                    )}
                    {job.completedAt && (
                      <div>
                        <span className="text-default-500">Completed:</span>
                        <p className="font-mono text-xs">{formatDate(job.completedAt)}</p>
                      </div>
                    )}
                  </div>

                  {/* Workspace */}
                  <div>
                    <h4 className="text-sm font-semibold text-default-700 mb-1">Workspace</h4>
                    <p className="text-sm">{job.workspaceName}</p>
                  </div>

                  {/* Branch info */}
                  {job.sourceBranch && (
                    <div>
                      <h4 className="text-sm font-semibold text-default-700 mb-1">
                        {job.editRequest
                          ? hasTargetBranch
                            ? 'Merge Request'
                            : 'Committed To'
                          : 'Branch'}
                      </h4>
                      <div className="flex items-center gap-2 text-sm">
                        {hasTargetBranch ? (
                          <>
                            <span className="font-mono bg-default-100 px-2 py-0.5 rounded">
                              {job.sourceBranch}
                            </span>
                            <span className="text-default-400">→</span>
                            <span className="font-mono bg-default-100 px-2 py-0.5 rounded">
                              {job.targetBranch}
                            </span>
                          </>
                        ) : (
                          <span className="font-mono bg-default-100 px-2 py-0.5 rounded">
                            {job.sourceBranch}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* PR/MR link */}
                  {job.mergeRequestUrl && (
                    <div>
                      <h4 className="text-sm font-semibold text-default-700 mb-1">
                        {job.mergeRequestUrl.includes('github.com')
                          ? 'Pull Request'
                          : 'Merge Request'}
                      </h4>
                      <a
                        href={job.mergeRequestUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-sm text-primary-500 hover:text-primary-600 hover:underline"
                      >
                        <ExternalLink className="w-4 h-4" />
                        {job.mergeRequestUrl}
                      </a>
                    </div>
                  )}

                  {/* Question */}
                  <div>
                    <h4 className="text-sm font-semibold text-default-700 mb-1">Question</h4>
                    <div className="p-3 bg-default-100 rounded-lg">
                      <p className="text-sm whitespace-pre-wrap">{job.question}</p>
                    </div>
                  </div>

                  {/* Response */}
                  {output && (
                    <div>
                      <h4 className="text-sm font-semibold text-default-700 mb-1">Response</h4>
                      <div className="p-3 bg-default-100 rounded-lg max-h-96 overflow-y-auto">
                        <p className="text-sm whitespace-pre-wrap font-mono">{output}</p>
                      </div>
                    </div>
                  )}

                  {/* Execution Stream */}
                  {(rawOutput || jsonLogs) && (
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-default-700">Execution Stream</h4>
                      <div className="flex flex-wrap gap-2">
                        {rawOutput && (
                          <Button
                            size="sm"
                            variant="flat"
                            onClick={() => setShowRawOutput((v) => !v)}
                          >
                            {showRawOutput ? 'Hide Raw Output' : 'Show Raw Output'}
                          </Button>
                        )}
                        {jsonLogs && (
                          <Button
                            size="sm"
                            variant="flat"
                            onClick={() => setShowJsonLogs((v) => !v)}
                          >
                            {showJsonLogs
                              ? 'Hide JSON Logs'
                              : `Show JSON Logs (${jsonLogs.length})`}
                          </Button>
                        )}
                        {rawOutput && (
                          <Button
                            size="sm"
                            variant="flat"
                            onClick={() => navigator.clipboard.writeText(rawOutput)}
                          >
                            Copy Raw Output
                          </Button>
                        )}
                      </div>

                      {showRawOutput && rawOutput && (
                        <div>
                          <p className="text-xs text-default-500 mb-1">
                            Raw stdout capture (includes stream-json + wrapper output).
                          </p>
                          <div className="p-3 bg-default-100 rounded-lg max-h-96 overflow-y-auto">
                            <pre className="text-xs whitespace-pre-wrap font-mono">{rawOutput}</pre>
                          </div>
                        </div>
                      )}

                      {showJsonLogs && jsonLogs && (
                        <div>
                          <p className="text-xs text-default-500 mb-1">
                            Parsed stream-json logs captured during execution.
                          </p>
                          <div className="p-3 bg-default-100 rounded-lg max-h-96 overflow-y-auto">
                            <pre className="text-xs whitespace-pre-wrap font-mono">
                              {JSON.stringify(jsonLogs, null, 2)}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Error message for failed jobs */}
                  {(job.error || fullJobDetail?.error) && (
                    <div>
                      <h4 className="text-sm font-semibold text-danger-500 mb-1">Error</h4>
                      <div className="p-3 bg-danger-50 dark:bg-danger-500/10 rounded-lg">
                        <p className="text-sm text-danger-600 dark:text-danger-400">
                          {job.error || fullJobDetail?.error}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Usage & Cost breakdown */}
                  {usage && (
                    <div>
                      <h4 className="text-sm font-semibold text-default-700 mb-2">Usage & Cost</h4>
                      <div className="p-4 bg-primary-50 dark:bg-primary-500/10 rounded-lg border border-primary-200 dark:border-primary-500/20">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          {usage.costUsd !== undefined && (
                            <div>
                              <p className="text-xs text-default-500 mb-1">Cost</p>
                              <p className="text-lg font-semibold text-primary-600 dark:text-primary-400">
                                ${usage.costUsd.toFixed(4)}
                              </p>
                            </div>
                          )}
                          {usage.inputTokens !== undefined && (
                            <div>
                              <p className="text-xs text-default-500 mb-1">Input Tokens</p>
                              <p className="text-sm font-medium text-default-700 dark:text-default-300">
                                {usage.inputTokens.toLocaleString()}
                              </p>
                            </div>
                          )}
                          {usage.outputTokens !== undefined && (
                            <div>
                              <p className="text-xs text-default-500 mb-1">Output Tokens</p>
                              <p className="text-sm font-medium text-default-700 dark:text-default-300">
                                {usage.outputTokens.toLocaleString()}
                              </p>
                            </div>
                          )}
                          {(usage.inputTokens !== undefined ||
                            usage.outputTokens !== undefined) && (
                            <div>
                              <p className="text-xs text-default-500 mb-1">Total Tokens</p>
                              <p className="text-sm font-medium text-default-700 dark:text-default-300">
                                {(
                                  (usage.inputTokens || 0) + (usage.outputTokens || 0)
                                ).toLocaleString()}
                              </p>
                            </div>
                          )}
                        </div>
                        {(usage.cacheCreationInputTokens !== undefined ||
                          usage.cacheReadInputTokens !== undefined) && (
                          <div className="mt-3 pt-3 border-t border-primary-200 dark:border-primary-500/20">
                            <div className="flex items-center gap-1 mb-2">
                              <p className="text-xs text-default-500">Cache Usage</p>
                              <Tooltip
                                content="Cache tokens represent input tokens that were either read from a previously created cache (saving cost) or used to create a new cache entry."
                                placement="top"
                                showArrow
                              >
                                <button
                                  type="button"
                                  aria-label="Cache usage information"
                                  className="flex items-center justify-center w-4 h-4 rounded hover:bg-default-200/60 transition-colors"
                                >
                                  <Info className="w-3 h-3 text-default-400" />
                                </button>
                              </Tooltip>
                            </div>
                            <div className="flex gap-4 text-xs">
                              {usage.cacheCreationInputTokens !== undefined && (
                                <div>
                                  <span className="text-default-500">Created: </span>
                                  <span className="font-medium text-default-700 dark:text-default-300">
                                    {usage.cacheCreationInputTokens.toLocaleString()}{' '}
                                    <span className="text-default-400">tokens</span>
                                  </span>
                                </div>
                              )}
                              {usage.cacheReadInputTokens !== undefined && (
                                <div>
                                  <span className="text-default-500">Read: </span>
                                  <span className="font-medium text-default-700 dark:text-default-300">
                                    {usage.cacheReadInputTokens.toLocaleString()}{' '}
                                    <span className="text-default-400">tokens</span>
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Pending/Processing state message */}
                  {(job.status === 'pending' || job.status === 'processing') && !output && (
                    <div className="p-4 bg-default-100 rounded-lg text-center">
                      <p className="text-default-600">
                        {job.status === 'pending'
                          ? 'Job is waiting in the queue to be processed.'
                          : 'Job is currently being processed...'}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <Button color="primary" variant="flat" onPress={closeModal}>
                Close
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}

type TaskingSubView = 'history' | 'snippets';

interface ExternalTaskingHistoryTabProps {
  workspaces: Workspace[];
  getProjectDisplayName: (repoUrl: string) => string;
}

/**
 * ExternalTaskingHistoryTab - Unified tab for viewing claude-code job history
 *
 * This component replaces the old ExecutionHistoryTab and QueueTab with a single
 * unified view that shows all claude-code jobs with pagination and filtering.
 */
export default function ExternalTaskingHistoryTab({
  workspaces,
  getProjectDisplayName,
}: ExternalTaskingHistoryTabProps) {
  const [subView, setSubView] = useState<TaskingSubView>('history');
  const [data, setData] = useState<ExternalTaskingHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = usePersistedState(
    'externalTaskingHistory.autoRefresh',
    false
  );
  const [isManuallyRefreshing, setIsManuallyRefreshing] = useState(false);

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Detail modal state
  const [selectedJob, setSelectedJob] = useState<ExternalTaskingHistoryItem | null>(null);
  const [fullJobDetail, setFullJobDetail] = useState<FullJobDetail | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  // Status filter - persisted to localStorage, default all selected
  const [selectedStatuses, setSelectedStatuses] = usePersistedState<JobStatus[]>(
    'externalTaskingHistory.statusFilter',
    [...ALL_STATUSES]
  );

  // Workspace filter - persisted to localStorage
  const [selectedWorkspaceId, setSelectedWorkspaceId] = usePersistedState<string | null>(
    'externalTaskingHistory.workspaceFilter',
    null
  );

  // Date range filter - persisted to localStorage
  const [dateRangePreset, setDateRangePreset] = usePersistedState<DateRangePreset>(
    'externalTaskingHistory.dateRangePreset',
    'all'
  );
  const [customStartDate, setCustomStartDate] = usePersistedState<string>(
    'externalTaskingHistory.customStartDate',
    ''
  );
  const [customEndDate, setCustomEndDate] = usePersistedState<string>(
    'externalTaskingHistory.customEndDate',
    ''
  );

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = usePersistedState<PageSize>(
    'externalTaskingHistory.pageSize',
    DEFAULT_PAGE_SIZE
  );

  /**
   * Fetch data from the API
   */
  const fetchData = useCallback(async () => {
    try {
      // Build query params with all filters
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));

      // Only add status filter if not all selected (optimization)
      if (selectedStatuses.length > 0 && selectedStatuses.length < ALL_STATUSES.length) {
        selectedStatuses.forEach((status) => params.append('status', status));
      }

      // Workspace filter
      if (selectedWorkspaceId) {
        params.set('workspaceId', selectedWorkspaceId);
      }

      // Date range filter
      if (dateRangePreset === 'custom') {
        if (customStartDate) {
          params.set('startDate', customStartDate);
        }
        if (customEndDate) {
          params.set('endDate', customEndDate);
        }
      } else if (dateRangePreset !== 'all') {
        const { startDate, endDate } = getDateRangeFromPreset(dateRangePreset);
        if (startDate) {
          params.set('startDate', startDate);
        }
        if (endDate) {
          params.set('endDate', endDate);
        }
      }

      const response = await fetch(`/api/external-tasking/history?${params.toString()}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      const json: ExternalTaskingHistoryResponse = await response.json();
      setData(json);
      setError(null);
    } catch (err) {
      console.error('[EXTERNAL TASKING HISTORY TAB] Failed to fetch:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch history');
    } finally {
      setLoading(false);
    }
  }, [
    page,
    pageSize,
    selectedStatuses,
    selectedWorkspaceId,
    dateRangePreset,
    customStartDate,
    customEndDate,
  ]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 3 seconds when enabled
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  // Reset manual refresh state when loading completes
  useEffect(() => {
    if (!loading) {
      setIsManuallyRefreshing(false);
    }
  }, [loading]);

  const handleManualRefresh = () => {
    setIsManuallyRefreshing(true);
    fetchData();
  };

  /**
   * Toggle a status in the filter
   * If all statuses are selected and we're toggling one off, deselect all others
   * If we're clicking the only selected status, select all
   */
  const handleStatusToggle = (status: JobStatus) => {
    setSelectedStatuses((current) => {
      if (current.includes(status)) {
        // If this is the only selected status, select all
        if (current.length === 1) {
          return [...ALL_STATUSES];
        }
        // Otherwise, deselect this status
        return current.filter((s) => s !== status);
      } else {
        // Add this status to selection
        return [...current, status];
      }
    });
    // Reset to page 1 when filter changes
    setPage(1);
  };

  /**
   * Handle workspace filter change
   */
  const handleWorkspaceChange = (keys: React.Key | Set<React.Key>) => {
    const keyArray = Array.from(keys as Set<React.Key>);
    const selectedKey = keyArray[0] as string | undefined;
    setSelectedWorkspaceId(selectedKey === '__all__' ? null : selectedKey || null);
    setPage(1);
  };

  /**
   * Handle date range preset change
   */
  const handleDateRangeChange = (keys: React.Key | Set<React.Key>) => {
    const keyArray = Array.from(keys as Set<React.Key>);
    const selectedKey = keyArray[0] as DateRangePreset | undefined;
    if (selectedKey) {
      setDateRangePreset(selectedKey);
      setPage(1);
    }
  };

  /**
   * Clear all filters to defaults
   */
  const handleClearFilters = () => {
    setSelectedStatuses([...ALL_STATUSES]);
    setSelectedWorkspaceId(null);
    setDateRangePreset('all');
    setCustomStartDate('');
    setCustomEndDate('');
    setPage(1);
  };

  /**
   * Handle page size change
   */
  const handlePageSizeChange = (keys: React.Key | Set<React.Key>) => {
    const keyArray = Array.from(keys as Set<React.Key>);
    const selectedKey = keyArray[0] as string | undefined;
    if (selectedKey) {
      const newPageSize = Number(selectedKey) as PageSize;
      setPageSize(newPageSize);
      setPage(1); // Reset to first page when page size changes
    }
  };

  /**
   * Handle job deletion
   */
  const handleDeleteJob = async (jobId: string) => {
    if (deletingId) return; // Prevent concurrent deletes
    setDeletingId(jobId);
    try {
      const response = await fetch(`/api/queue/jobs/${jobId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[EXTERNAL TASKING HISTORY TAB] Delete failed:', errorData);
      }
      // Refresh data after delete
      await fetchData();
    } catch (err) {
      console.error('[EXTERNAL TASKING HISTORY TAB] Delete error:', err);
    } finally {
      setDeletingId(null);
    }
  };

  /**
   * Handle job click (open detail modal)
   */
  const handleJobClick = async (job: ExternalTaskingHistoryItem) => {
    setSelectedJob(job);
    setIsDetailModalOpen(true);
    setIsLoadingDetail(true);
    setFullJobDetail(null);

    try {
      const response = await fetch(`/api/jobs/${job.id}`);
      if (response.ok) {
        const detail: FullJobDetail = await response.json();
        setFullJobDetail(detail);
      } else {
        console.error(
          '[EXTERNAL TASKING HISTORY TAB] Failed to fetch job detail:',
          response.status
        );
      }
    } catch (err) {
      console.error('[EXTERNAL TASKING HISTORY TAB] Error fetching job detail:', err);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  /**
   * Handle detail modal close
   */
  const handleDetailModalClose = () => {
    setIsDetailModalOpen(false);
    setSelectedJob(null);
    setFullJobDetail(null);
  };

  // Show loading skeleton on initial load
  if (loading && !data) {
    return <LoadingSkeleton />;
  }

  // Show error state
  if (error && !data) {
    return (
      <div className="space-y-6">
        <div className="flex justify-end">
          <Button
            color="primary"
            size="sm"
            variant="flat"
            onClick={handleManualRefresh}
            isLoading={isManuallyRefreshing}
            startContent={<RefreshCw className="w-4 h-4" />}
          >
            Retry
          </Button>
        </div>
        <div className="p-4 bg-danger-50 dark:bg-danger-500/10 rounded-lg">
          <p className="text-danger-600 dark:text-danger-400">{error}</p>
        </div>
      </div>
    );
  }

  const hasActiveFilters =
    selectedStatuses.length < ALL_STATUSES.length ||
    selectedWorkspaceId !== null ||
    dateRangePreset !== 'all';
  const isEmpty = data && data.items.length === 0 && !data.currentJob;

  if (subView === 'snippets') {
    return (
      <div className="space-y-6">
        <Tabs
          selectedKey={subView}
          onSelectionChange={(key) => setSubView(key as TaskingSubView)}
          size="md"
          color="primary"
          variant="light"
          classNames={{ tabList: 'gap-2' }}
        >
          <Tab key="history" title="History" />
          <Tab key="snippets" title="Snippets" />
        </Tabs>
        <SnippetsTab workspaces={workspaces} getProjectDisplayName={getProjectDisplayName} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <Tabs
          selectedKey={subView}
          onSelectionChange={(key) => setSubView(key as TaskingSubView)}
          size="md"
          color="primary"
          variant="light"
          classNames={{ tabList: 'gap-2' }}
        >
          <Tab key="history" title="History" />
          <Tab key="snippets" title="Snippets" />
        </Tabs>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch size="sm" isSelected={autoRefresh} onValueChange={setAutoRefresh} />
            <span className="text-sm text-default-600">Auto-refresh</span>
          </div>
          <Button
            color="primary"
            size="sm"
            variant="flat"
            onClick={handleManualRefresh}
            isLoading={isManuallyRefreshing}
            startContent={<RefreshCw className="w-4 h-4" />}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters section */}
      {data && (
        <div className="space-y-4">
          {/* Status filter chips */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-default-500 mr-1">Status:</span>
            {ALL_STATUSES.map((status) => {
              const config = STATUS_CONFIG[status];
              const Icon = config.icon;
              const isSelected = selectedStatuses.includes(status);
              const count = data.statusCounts[status];

              return (
                <Chip
                  key={status}
                  variant={isSelected ? 'solid' : 'bordered'}
                  color={isSelected ? config.color : 'default'}
                  className="cursor-pointer transition-all hover:scale-105"
                  startContent={
                    <Icon
                      className={`w-3 h-3 ${status === 'processing' && isSelected ? 'animate-spin' : ''}`}
                    />
                  }
                  onClick={() => handleStatusToggle(status)}
                >
                  {config.label}
                  <span
                    className={`ml-1 px-1.5 py-0.5 text-xs rounded-full ${
                      isSelected
                        ? 'bg-white/20 text-inherit'
                        : 'bg-default-200 dark:bg-default-100 text-default-600'
                    }`}
                  >
                    {count}
                  </span>
                </Chip>
              );
            })}
          </div>

          {/* Workspace and date range filters */}
          <div className="flex flex-wrap items-end gap-4">
            {/* Workspace dropdown */}
            <div className="w-48">
              <Select
                size="sm"
                label="Workspace"
                labelPlacement="outside"
                placeholder="All Workspaces"
                selectedKeys={selectedWorkspaceId ? [selectedWorkspaceId] : ['__all__']}
                onSelectionChange={handleWorkspaceChange}
                variant="bordered"
                startContent={<FolderGit2 className="w-4 h-4 text-default-400" />}
                classNames={{
                  trigger: 'min-h-10',
                }}
              >
                {[{ id: '__all__', name: 'All Workspaces' }, ...data.availableWorkspaces].map(
                  (workspace) => (
                    <SelectItem key={workspace.id}>{workspace.name}</SelectItem>
                  )
                )}
              </Select>
            </div>

            {/* Date range dropdown */}
            <div className="w-40">
              <Select
                size="sm"
                label="Date Range"
                labelPlacement="outside"
                selectedKeys={[dateRangePreset]}
                onSelectionChange={handleDateRangeChange}
                variant="bordered"
                startContent={<Calendar className="w-4 h-4 text-default-400" />}
                classNames={{
                  trigger: 'min-h-10',
                }}
              >
                {(Object.keys(DATE_RANGE_PRESETS) as DateRangePreset[]).map((preset) => (
                  <SelectItem key={preset}>{DATE_RANGE_PRESETS[preset].label}</SelectItem>
                ))}
              </Select>
            </div>

            {/* Custom date range inputs */}
            {dateRangePreset === 'custom' && (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-default-500">Start Date</label>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => {
                      setCustomStartDate(e.target.value);
                      setPage(1);
                    }}
                    className="h-10 px-3 text-sm border border-default-200 rounded-lg bg-transparent focus:border-primary-500 focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-default-500">End Date</label>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => {
                      setCustomEndDate(e.target.value);
                      setPage(1);
                    }}
                    className="h-10 px-3 text-sm border border-default-200 rounded-lg bg-transparent focus:border-primary-500 focus:outline-none"
                  />
                </div>
              </>
            )}

            {/* Clear filters button */}
            {hasActiveFilters && (
              <Button
                size="sm"
                variant="flat"
                color="default"
                onClick={handleClearFilters}
                startContent={<X className="w-4 h-4" />}
                className="h-10"
              >
                Clear Filters
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {isEmpty && <EmptyState hasFilters={hasActiveFilters} />}

      {/* Currently processing job (pinned at top) */}
      {data?.currentJob && <CurrentlyProcessingCard job={data.currentJob} />}

      {/* Job list */}
      {!isEmpty && data && data.items.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-medium">History</h3>
          <div className="space-y-3">
            {data.items.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                onDelete={handleDeleteJob}
                onClick={handleJobClick}
                isDeleting={deletingId === job.id}
              />
            ))}
          </div>
        </div>
      )}

      {/* Pagination controls */}
      {data && data.totalPages > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-default-200">
          {/* Page size selector and results summary */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-default-500">Show:</span>
              <Select
                size="sm"
                selectedKeys={[String(pageSize)]}
                onSelectionChange={handlePageSizeChange}
                variant="bordered"
                className="w-20"
                classNames={{
                  trigger: 'min-h-8 h-8',
                }}
              >
                {PAGE_SIZES.map((size) => (
                  <SelectItem key={String(size)}>{size}</SelectItem>
                ))}
              </Select>
              <span className="text-sm text-default-500">per page</span>
            </div>
            <span className="text-sm text-default-600">
              Showing{' '}
              <span className="font-medium">
                {data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1}
              </span>
              -
              <span className="font-medium">{Math.min(data.page * data.pageSize, data.total)}</span>{' '}
              of <span className="font-medium">{data.total}</span> results
            </span>
          </div>

          {/* Page navigation */}
          {data.totalPages > 1 && (
            <Pagination
              total={data.totalPages}
              page={page}
              onChange={setPage}
              showControls
              boundaries={1}
              siblings={1}
              size="sm"
              color="primary"
              classNames={{
                wrapper: 'gap-1',
                item: 'min-w-8 w-8 h-8',
                cursor: 'min-w-8 w-8 h-8',
              }}
            />
          )}
        </div>
      )}

      {/* Job Detail Modal */}
      {selectedJob && (
        <JobDetailModal
          isOpen={isDetailModalOpen}
          onClose={handleDetailModalClose}
          job={selectedJob}
          fullJobDetail={fullJobDetail}
          isLoadingDetail={isLoadingDetail}
        />
      )}
    </div>
  );
}
