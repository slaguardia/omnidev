'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@heroui/button';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/modal';
import { Switch } from '@heroui/switch';
import {
  ListOrdered,
  RefreshCw,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  Eye,
  Hourglass,
  Info,
  MessageSquare,
  Pencil,
} from 'lucide-react';
import { Tooltip } from '@heroui/tooltip';
import type { Job, JobStatus, JobType, ClaudeCodeJobPayload } from '@/lib/queue';

interface QueueStatusResponse {
  isProcessing: boolean;
  hasPending: boolean;
  counts: {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  };
  currentJob: Job | null;
  pendingJobs: Job[];
  recentJobs: Job[];
}

export default function QueueTab() {
  const [queueStatus, setQueueStatus] = useState<QueueStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  const fetchQueueStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/queue/status');
      if (response.ok) {
        const data = await response.json();
        setQueueStatus(data);
      }
    } catch (error) {
      console.error('Failed to fetch queue status:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchQueueStatus();
  }, [fetchQueueStatus]);

  // Auto-refresh every 3 seconds when enabled
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(fetchQueueStatus, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchQueueStatus]);

  const handleViewDetails = (job: Job) => {
    setSelectedJob(job);
    setIsDetailModalOpen(true);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  };

  const getJobTypeLabel = (type: JobType) => {
    const labels: Record<JobType, string> = {
      'claude-code': 'Claude Code',
      'git-push': 'Git Push',
      'git-mr': 'Merge Request',
      'workspace-cleanup': 'Cleanup',
    };
    return labels[type] || type;
  };

  const getStatusIcon = (status: JobStatus) => {
    switch (status) {
      case 'pending':
        return <Hourglass className="w-4 h-4 text-warning-500" />;
      case 'processing':
        return <Loader2 className="w-4 h-4 text-primary-500 animate-spin" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-success-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-danger-500" />;
      default:
        return <Clock className="w-4 h-4 text-default-500" />;
    }
  };

  const getStatusBadge = (status: JobStatus) => {
    const styles: Record<JobStatus, string> = {
      pending: 'bg-warning-100 text-warning-700 dark:bg-warning-500/20 dark:text-warning-400',
      processing: 'bg-primary-100 text-primary-700 dark:bg-primary-500/20 dark:text-primary-400',
      completed: 'bg-success-100 text-success-700 dark:bg-success-500/20 dark:text-success-400',
      failed: 'bg-danger-100 text-danger-700 dark:bg-danger-500/20 dark:text-danger-400',
    };
    return (
      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${styles[status]}`}>
        {status}
      </span>
    );
  };

  const getOperationBadge = (job: Job) => {
    if (job.type !== 'claude-code') return null;
    const payload = job.payload as ClaudeCodeJobPayload;
    const isEdit = payload.editRequest === true;
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full border ${
          isEdit
            ? 'bg-warning-100 text-warning-800 border-warning-300 dark:bg-warning-500/20 dark:text-warning-300 dark:border-warning-500/40'
            : 'bg-primary-100 text-primary-800 border-primary-300 dark:bg-primary-500/20 dark:text-primary-300 dark:border-primary-500/40'
        }`}
      >
        {isEdit ? <Pencil className="w-3 h-3" /> : <MessageSquare className="w-3 h-3" />}
        {isEdit ? 'Edit' : 'Ask'}
      </span>
    );
  };

  const JobCard = ({ job, showActions = true }: { job: Job; showActions?: boolean }) => (
    <div className="p-4 glass-card">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {getStatusIcon(job.status)}
            <span className="font-medium text-sm">{getJobTypeLabel(job.type)}</span>
            {getOperationBadge(job)}
            {getStatusBadge(job.status)}
          </div>
          <p className="text-xs text-default-500 font-mono mb-2 truncate">ID: {job.id}</p>
          <div className="flex items-center gap-4 text-xs text-default-500">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatRelativeTime(job.createdAt)}
            </span>
            {job.startedAt && <span>Started: {formatRelativeTime(job.startedAt)}</span>}
            {job.completedAt && <span>Completed: {formatRelativeTime(job.completedAt)}</span>}
          </div>
        </div>
        {showActions && (
          <Button
            size="sm"
            variant="flat"
            onClick={() => handleViewDetails(job)}
            startContent={<Eye className="w-4 h-4" />}
          >
            View
          </Button>
        )}
      </div>
    </div>
  );

  if (loading && !queueStatus) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold flex items-center gap-2">
          <ListOrdered className="w-6 h-6 text-default-500" />
          Request Queue
        </h2>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch size="sm" isSelected={autoRefresh} onValueChange={setAutoRefresh} />
            <span className="text-sm text-default-600">Auto-refresh</span>
          </div>
          <Button
            color="primary"
            size="sm"
            variant="flat"
            onClick={fetchQueueStatus}
            isLoading={loading}
            startContent={<RefreshCw className="w-4 h-4" />}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {queueStatus && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-lg bg-primary-50 dark:bg-primary-500/10 border border-primary-200 dark:border-primary-500/20">
            <div className="flex items-center gap-2 mb-1">
              <Loader2
                className={`w-4 h-4 text-primary-500 ${queueStatus.counts.processing > 0 ? 'animate-spin' : ''}`}
              />
              <span className="text-sm font-medium text-primary-700 dark:text-primary-400">
                Processing
              </span>
            </div>
            <p className="text-2xl font-bold text-primary-600 dark:text-primary-300">
              {queueStatus.counts.processing}
            </p>
          </div>
          <div className="p-4 rounded-lg bg-warning-50 dark:bg-warning-500/10 border border-warning-200 dark:border-warning-500/20">
            <div className="flex items-center gap-2 mb-1">
              <Hourglass className="w-4 h-4 text-warning-500" />
              <span className="text-sm font-medium text-warning-700 dark:text-warning-400">
                Pending
              </span>
            </div>
            <p className="text-2xl font-bold text-warning-600 dark:text-warning-300">
              {queueStatus.counts.pending}
            </p>
          </div>
          <div className="p-4 rounded-lg bg-success-50 dark:bg-success-500/10 border border-success-200 dark:border-success-500/20">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="w-4 h-4 text-success-500" />
              <span className="text-sm font-medium text-success-700 dark:text-success-400">
                Completed
              </span>
            </div>
            <p className="text-2xl font-bold text-success-600 dark:text-success-300">
              {queueStatus.counts.completed}
            </p>
          </div>
          <div className="p-4 rounded-lg bg-danger-50 dark:bg-danger-500/10 border border-danger-200 dark:border-danger-500/20">
            <div className="flex items-center gap-2 mb-1">
              <XCircle className="w-4 h-4 text-danger-500" />
              <span className="text-sm font-medium text-danger-700 dark:text-danger-400">
                Failed
              </span>
            </div>
            <p className="text-2xl font-bold text-danger-600 dark:text-danger-300">
              {queueStatus.counts.failed}
            </p>
          </div>
        </div>
      )}

      {/* Currently Processing */}
      {queueStatus?.currentJob && (
        <div className="space-y-3">
          <h3 className="text-lg font-medium flex items-center gap-2">
            <Loader2 className="w-5 h-5 text-primary-500 animate-spin" />
            Currently Processing
          </h3>
          <JobCard job={queueStatus.currentJob} />
        </div>
      )}

      {/* Pending Jobs */}
      {queueStatus && queueStatus.pendingJobs.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-medium flex items-center gap-2">
            <Hourglass className="w-5 h-5 text-warning-500" />
            Pending Jobs ({queueStatus.pendingJobs.length})
          </h3>
          <div className="space-y-4">
            {queueStatus.pendingJobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        </div>
      )}

      {/* Recent Jobs */}
      {queueStatus && queueStatus.recentJobs.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-medium flex items-center gap-2">
            <Clock className="w-5 h-5 text-default-500" />
            Recent Jobs
          </h3>
          <div className="space-y-4">
            {queueStatus.recentJobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {queueStatus &&
        !queueStatus.currentJob &&
        queueStatus.pendingJobs.length === 0 &&
        queueStatus.recentJobs.length === 0 && (
          <div className="text-center py-12">
            <p className="text-default-600">No jobs in the queue.</p>
            <p className="text-sm text-default-500">
              Jobs will appear here when you make requests through the Operations tab.
            </p>
          </div>
        )}

      {/* Detail Modal */}
      <Modal
        isOpen={isDetailModalOpen}
        onOpenChange={setIsDetailModalOpen}
        size="3xl"
        scrollBehavior="inside"
        classNames={{
          base: 'bg-background/85 backdrop-blur-lg border border-divider/60',
        }}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  {selectedJob && getStatusIcon(selectedJob.status)}
                  <span>Job Details</span>
                  {selectedJob && getStatusBadge(selectedJob.status)}
                </div>
                <p className="text-sm font-normal text-default-500">
                  {selectedJob && formatDate(selectedJob.createdAt)}
                </p>
              </ModalHeader>
              <ModalBody>
                {selectedJob && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h4 className="text-sm font-semibold text-default-700 mb-1">Job ID</h4>
                        <p className="text-sm font-mono">{selectedJob.id}</p>
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-default-700 mb-1">Type</h4>
                        <p className="text-sm">{getJobTypeLabel(selectedJob.type)}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h4 className="text-sm font-semibold text-default-700 mb-1">Created</h4>
                        <p className="text-sm">{formatDate(selectedJob.createdAt)}</p>
                      </div>
                      {selectedJob.startedAt && (
                        <div>
                          <h4 className="text-sm font-semibold text-default-700 mb-1">Started</h4>
                          <p className="text-sm">{formatDate(selectedJob.startedAt)}</p>
                        </div>
                      )}
                      {selectedJob.completedAt && (
                        <div>
                          <h4 className="text-sm font-semibold text-default-700 mb-1">Completed</h4>
                          <p className="text-sm">{formatDate(selectedJob.completedAt)}</p>
                        </div>
                      )}
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-default-700 mb-1">Payload</h4>
                      <div className="p-3 bg-default-100 rounded-lg max-h-48 overflow-y-auto">
                        <pre className="text-xs font-mono whitespace-pre-wrap">
                          {JSON.stringify(selectedJob.payload, null, 2)}
                        </pre>
                      </div>
                    </div>
                    {selectedJob.result !== undefined && selectedJob.result !== null && (
                      <>
                        {/* Result Output */}
                        {selectedJob.type === 'claude-code' &&
                          selectedJob.result &&
                          typeof selectedJob.result === 'object' &&
                          'output' in selectedJob.result && (
                            <div>
                              <h4 className="text-sm font-semibold text-default-700 mb-1">
                                Output
                              </h4>
                              <div className="p-3 bg-default-100 rounded-lg max-h-64 overflow-y-auto">
                                <p className="text-sm whitespace-pre-wrap font-mono">
                                  {String(selectedJob.result.output)}
                                </p>
                              </div>
                            </div>
                          )}

                        {/* Full Result JSON (for non-claude-code jobs or as fallback) */}
                        {(!selectedJob.result ||
                          typeof selectedJob.result !== 'object' ||
                          (selectedJob.type === 'claude-code' &&
                            !('output' in selectedJob.result))) && (
                          <div>
                            <h4 className="text-sm font-semibold text-success-600 mb-1">Result</h4>
                            <div className="p-3 bg-success-50 dark:bg-success-500/10 rounded-lg max-h-64 overflow-y-auto">
                              <pre className="text-xs font-mono whitespace-pre-wrap">
                                {JSON.stringify(selectedJob.result, null, 2)}
                              </pre>
                            </div>
                          </div>
                        )}

                        {/* Usage Information - moved to bottom */}
                        {selectedJob.type === 'claude-code' &&
                          selectedJob.result &&
                          typeof selectedJob.result === 'object' &&
                          (() => {
                            // Define usage type
                            type UsageInfo = {
                              costUsd?: number;
                              inputTokens?: number;
                              outputTokens?: number;
                              cacheCreationInputTokens?: number;
                              cacheReadInputTokens?: number;
                            };

                            // Try to get usage from result.usage first
                            let usage: UsageInfo | null = null;

                            if ('usage' in selectedJob.result && selectedJob.result.usage) {
                              usage = selectedJob.result.usage as UsageInfo;
                            } else if (
                              'jsonLogs' in selectedJob.result &&
                              selectedJob.result.jsonLogs
                            ) {
                              // Fallback: extract from JSON logs
                              const jsonLogs = selectedJob.result.jsonLogs as Array<{
                                type?: string;
                                usage?: {
                                  input_tokens?: number;
                                  output_tokens?: number;
                                  cache_creation_input_tokens?: number;
                                  cache_read_input_tokens?: number;
                                };
                                total_cost_usd?: number;
                              }>;
                              const resultLog = jsonLogs.find((log) => log.type === 'result');
                              if (resultLog?.usage) {
                                const u = resultLog.usage;
                                const usageObj: UsageInfo = {};
                                if (u.input_tokens !== undefined)
                                  usageObj.inputTokens = u.input_tokens;
                                if (u.output_tokens !== undefined)
                                  usageObj.outputTokens = u.output_tokens;
                                if (u.cache_creation_input_tokens !== undefined)
                                  usageObj.cacheCreationInputTokens = u.cache_creation_input_tokens;
                                if (u.cache_read_input_tokens !== undefined)
                                  usageObj.cacheReadInputTokens = u.cache_read_input_tokens;
                                if (resultLog.total_cost_usd !== undefined)
                                  usageObj.costUsd = resultLog.total_cost_usd;
                                usage = usageObj;
                              }
                            }

                            if (!usage) {
                              return null;
                            }

                            return (
                              <div>
                                <h4 className="text-sm font-semibold text-default-700 mb-2">
                                  Usage & Cost
                                </h4>
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
                                        <p className="text-xs text-default-500 mb-1">
                                          Input Tokens
                                        </p>
                                        <p className="text-sm font-medium text-default-700 dark:text-default-300">
                                          {usage.inputTokens.toLocaleString()}
                                        </p>
                                      </div>
                                    )}
                                    {usage.outputTokens !== undefined && (
                                      <div>
                                        <p className="text-xs text-default-500 mb-1">
                                          Output Tokens
                                        </p>
                                        <p className="text-sm font-medium text-default-700 dark:text-default-300">
                                          {usage.outputTokens.toLocaleString()}
                                        </p>
                                      </div>
                                    )}
                                    {(usage.inputTokens !== undefined ||
                                      usage.outputTokens !== undefined) && (
                                      <div>
                                        <p className="text-xs text-default-500 mb-1">
                                          Total Tokens
                                        </p>
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
                                          content="Cache tokens represent input tokens that were either read from a previously created cache (saving cost) or used to create a new cache entry. These are measured in tokens, same as input/output tokens."
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
                            );
                          })()}
                      </>
                    )}
                    {selectedJob.error && (
                      <div>
                        <h4 className="text-sm font-semibold text-danger-500 mb-1">Error</h4>
                        <div className="p-3 bg-danger-50 dark:bg-danger-500/10 rounded-lg">
                          <p className="text-sm text-danger-600 dark:text-danger-400">
                            {selectedJob.error}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </ModalBody>
              <ModalFooter>
                <Button color="primary" variant="flat" onPress={onClose}>
                  Close
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
