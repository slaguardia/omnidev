'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { Button } from '@heroui/button';
import { Chip } from '@heroui/chip';
import { Input, Textarea } from '@heroui/input';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/modal';
import { CheckCircle, CheckCircle2, AlertTriangle, RotateCcw, ExternalLink } from 'lucide-react';
import type { RalphTaskStatus } from './types';

export interface FeatureCompleteModalProps {
  isOpen: boolean;
  taskId: string | null;
  onClose: () => void;
  onSuccess: () => void;
  statusColors: Record<string, string>;
}

interface FeatureCompleteStats {
  totalStories: number;
  completedStories: number;
  incompleteStories: number;
  allChildrenComplete: boolean;
  totalDurationFormatted: string;
  totalIterations: number;
  prUrls: string[];
  childSummaries: Array<{
    id: string;
    title: string;
    status: RalphTaskStatus;
    prUrl: string | null;
    completedAt: string | null;
    durationFormatted: string;
  }>;
}

export default function FeatureCompleteModal({
  isOpen,
  taskId,
  onClose,
  onSuccess,
  statusColors,
}: FeatureCompleteModalProps) {
  const [stats, setStats] = useState<FeatureCompleteStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summaryNotes, setSummaryNotes] = useState('');
  const [forceComplete, setForceComplete] = useState(false);
  const [forceCompleteReason, setForceCompleteReason] = useState('');
  const [reopenStoryId, setReopenStoryId] = useState<string | null>(null);
  const [reopenReason, setReopenReason] = useState('');

  // Fetch completion stats when modal opens
  useEffect(() => {
    if (!isOpen || !taskId) return;

    setError(null);
    setLoading(true);
    setStats(null);
    setSummaryNotes('');
    setForceComplete(false);
    setForceCompleteReason('');
    setReopenStoryId(null);
    setReopenReason('');

    fetch(`/api/ralph/tasks/${taskId}/complete-feature`)
      .then(async (response) => {
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        setStats(data.stats || null);
      })
      .catch((err) => {
        console.error('[FEATURE COMPLETE MODAL] Failed to fetch stats:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch completion info');
      })
      .finally(() => setLoading(false));
  }, [isOpen, taskId]);

  const handleClose = useCallback(() => {
    setStats(null);
    setError(null);
    setSummaryNotes('');
    setForceComplete(false);
    setForceCompleteReason('');
    setReopenStoryId(null);
    setReopenReason('');
    onClose();
  }, [onClose]);

  const handleConfirmFeatureComplete = useCallback(async () => {
    if (!taskId) return;

    console.log('[FEATURE COMPLETE MODAL] Confirming feature complete:', taskId);
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/ralph/tasks/${taskId}/complete-feature`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summaryNotes: summaryNotes || undefined,
          force: forceComplete,
          forceReason: forceComplete ? forceCompleteReason : undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
      }

      handleClose();
      onSuccess();
    } catch (err) {
      console.error('[FEATURE COMPLETE MODAL] Failed to complete feature:', err);
      setError(err instanceof Error ? err.message : 'Failed to complete task');
    } finally {
      setLoading(false);
    }
  }, [taskId, summaryNotes, forceComplete, forceCompleteReason, handleClose, onSuccess]);

  const handleReopenStory = useCallback(async () => {
    if (!taskId || !reopenStoryId || !reopenReason.trim()) return;

    console.log('[FEATURE COMPLETE MODAL] Reopening story:', reopenStoryId);
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/ralph/tasks/${taskId}/complete-feature`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyId: reopenStoryId,
          reason: reopenReason,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
      }

      setReopenStoryId(null);
      setReopenReason('');

      // Refetch stats
      const statsResponse = await fetch(`/api/ralph/tasks/${taskId}/complete-feature`);
      if (statsResponse.ok) {
        const data = await statsResponse.json();
        setStats(data.stats || null);
      }
      onSuccess();
    } catch (err) {
      console.error('[FEATURE COMPLETE MODAL] Failed to reopen story:', err);
      setError(err instanceof Error ? err.message : 'Failed to reopen story');
    } finally {
      setLoading(false);
    }
  }, [taskId, reopenStoryId, reopenReason, onSuccess]);

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
      size="2xl"
      scrollBehavior="inside"
    >
      <ModalContent>
        {(onCloseModal) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-success" />
                <span>Complete Task</span>
              </div>
            </ModalHeader>
            <ModalBody>
              {loading && !stats ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : error && !stats ? (
                <div className="flex flex-col items-center gap-3 py-4">
                  <AlertTriangle className="w-12 h-12 text-danger" />
                  <p className="text-danger text-center">{error}</p>
                </div>
              ) : stats ? (
                <div className="space-y-6">
                  {/* Completion Status */}
                  <div
                    className={`p-4 rounded-lg ${stats.allChildrenComplete ? 'bg-success-50 dark:bg-success-900/20 border border-success-200' : 'bg-warning-50 dark:bg-warning-900/20 border border-warning-200'}`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {stats.allChildrenComplete ? (
                        <>
                          <CheckCircle2 className="w-5 h-5 text-success" />
                          <span className="font-medium text-success-700 dark:text-success-300">
                            All {stats.totalStories} subtasks complete
                          </span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-5 h-5 text-warning" />
                          <span className="font-medium text-warning-700 dark:text-warning-300">
                            {stats.incompleteStories} of {stats.totalStories} subtasks incomplete
                          </span>
                        </>
                      )}
                    </div>
                    {!stats.allChildrenComplete && (
                      <p className="text-sm text-warning-600 dark:text-warning-400">
                        You can force complete the task, but some work may be left undone.
                      </p>
                    )}
                  </div>

                  {/* Aggregate Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-3 bg-default-100 rounded-lg text-center">
                      <div className="text-2xl font-bold text-primary">
                        {stats.completedStories}/{stats.totalStories}
                      </div>
                      <div className="text-xs text-default-500">Stories Complete</div>
                    </div>
                    <div className="p-3 bg-default-100 rounded-lg text-center">
                      <div className="text-2xl font-bold text-secondary">
                        {stats.totalDurationFormatted}
                      </div>
                      <div className="text-xs text-default-500">Total Duration</div>
                    </div>
                    <div className="p-3 bg-default-100 rounded-lg text-center">
                      <div className="text-2xl font-bold text-warning">{stats.totalIterations}</div>
                      <div className="text-xs text-default-500">Planning Iterations</div>
                    </div>
                    <div className="p-3 bg-default-100 rounded-lg text-center">
                      <div className="text-2xl font-bold text-success">{stats.prUrls.length}</div>
                      <div className="text-xs text-default-500">PRs Created</div>
                    </div>
                  </div>

                  {/* Child Stories Summary */}
                  <div>
                    <div className="text-sm font-medium mb-2">Story Summary</div>
                    <div className="border border-default-200 rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-default-100">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium text-default-600">
                              Story
                            </th>
                            <th className="px-3 py-2 text-center font-medium text-default-600">
                              Status
                            </th>
                            <th className="px-3 py-2 text-center font-medium text-default-600">
                              Duration
                            </th>
                            <th className="px-3 py-2 text-center font-medium text-default-600">
                              PR
                            </th>
                            <th className="px-3 py-2 text-center font-medium text-default-600">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-default-200">
                          {stats.childSummaries.map((child) => (
                            <tr key={child.id} className="hover:bg-default-50">
                              <td className="px-3 py-2 truncate max-w-[200px]" title={child.title}>
                                {child.title}
                              </td>
                              <td className="px-3 py-2 text-center">
                                <Chip
                                  size="sm"
                                  variant="flat"
                                  color={
                                    child.status === 'complete'
                                      ? 'success'
                                      : ((statusColors[child.status] as
                                          | 'default'
                                          | 'warning'
                                          | 'secondary'
                                          | 'success'
                                          | 'primary'
                                          | 'danger') ?? 'default')
                                  }
                                >
                                  {child.status}
                                </Chip>
                              </td>
                              <td className="px-3 py-2 text-center text-default-500">
                                {child.durationFormatted}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {child.prUrl ? (
                                  <a
                                    href={child.prUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-primary hover:underline flex items-center justify-center gap-1"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                ) : (
                                  <span className="text-default-300">&mdash;</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {child.status === 'complete' && (
                                  <Button
                                    size="sm"
                                    variant="light"
                                    color="warning"
                                    className="h-6 min-w-0 px-2"
                                    onPress={() => {
                                      setReopenStoryId(child.id);
                                      setReopenReason('');
                                    }}
                                  >
                                    <RotateCcw className="w-3 h-3" />
                                  </Button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Reopen Story Form */}
                  {reopenStoryId && (
                    <div className="p-4 bg-warning-50 dark:bg-warning-900/20 border border-warning-200 rounded-lg space-y-3">
                      <div className="flex items-center gap-2 text-warning-700 dark:text-warning-300">
                        <RotateCcw className="w-4 h-4" />
                        <span className="font-medium">Reopen Story</span>
                      </div>
                      <p className="text-sm text-warning-600">
                        Story: {stats.childSummaries.find((c) => c.id === reopenStoryId)?.title}
                      </p>
                      <Input
                        size="sm"
                        label="Reason for reopening"
                        placeholder="e.g., Need to add error handling, missed a requirement"
                        value={reopenReason}
                        onValueChange={setReopenReason}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="flat"
                          onPress={() => {
                            setReopenStoryId(null);
                            setReopenReason('');
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          color="warning"
                          onPress={handleReopenStory}
                          isDisabled={!reopenReason.trim()}
                          isLoading={loading}
                        >
                          Reopen Story
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Summary Notes */}
                  {!reopenStoryId && (
                    <div>
                      <Textarea
                        label="Completion Summary (optional)"
                        placeholder="Add any notes about this task completion..."
                        value={summaryNotes}
                        onValueChange={setSummaryNotes}
                        minRows={3}
                        maxRows={6}
                      />
                    </div>
                  )}

                  {/* Force Complete Option */}
                  {!stats.allChildrenComplete && !reopenStoryId && (
                    <div className="p-4 bg-default-100 rounded-lg space-y-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="forceComplete"
                          checked={forceComplete}
                          onChange={(e) => setForceComplete(e.target.checked)}
                          className="w-4 h-4 rounded border-default-300"
                        />
                        <label htmlFor="forceComplete" className="text-sm text-default-600">
                          Force complete with incomplete stories
                        </label>
                      </div>
                      {forceComplete && (
                        <Input
                          size="sm"
                          label="Reason for force completion (required)"
                          placeholder="e.g., Remaining stories deferred to next sprint"
                          value={forceCompleteReason}
                          onValueChange={setForceCompleteReason}
                          isRequired
                        />
                      )}
                    </div>
                  )}

                  {/* PRs Created Links */}
                  {stats.prUrls.length > 0 && (
                    <div>
                      <div className="text-sm font-medium mb-2">Pull Requests Created</div>
                      <div className="flex flex-wrap gap-2">
                        {stats.prUrls.map((url, idx) => (
                          <a
                            key={idx}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-sm text-primary hover:underline bg-primary-50 dark:bg-primary-900/20 px-2 py-1 rounded"
                          >
                            <ExternalLink className="w-3 h-3" />
                            PR #{idx + 1}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Error Display */}
                  {error && (
                    <div className="flex items-start gap-2 p-3 bg-danger-50 border border-danger-200 rounded-lg">
                      <AlertTriangle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
                      <p className="text-danger text-sm">{error}</p>
                    </div>
                  )}
                </div>
              ) : null}
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={onCloseModal} isDisabled={loading}>
                Cancel
              </Button>
              <Button
                color="success"
                onPress={handleConfirmFeatureComplete}
                isLoading={loading}
                isDisabled={
                  loading ||
                  !stats ||
                  !!reopenStoryId ||
                  (!stats?.allChildrenComplete && (!forceComplete || !forceCompleteReason.trim()))
                }
                startContent={!loading && <CheckCircle className="w-4 h-4" />}
              >
                {stats?.allChildrenComplete
                  ? 'Complete Task'
                  : forceComplete
                    ? 'Force Complete Task'
                    : 'Complete Task'}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
