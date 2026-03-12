'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { Button } from '@heroui/button';
import { Chip } from '@heroui/chip';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/modal';
import {
  GitBranch,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  RotateCcw,
  AlertTriangle,
  PlayCircle,
  FileCode,
} from 'lucide-react';
import type { WorkflowDefinition } from '@/lib/types/index';
import type { RalphTaskData } from './types';

export interface ExecuteModalProps {
  isOpen: boolean;
  taskId: string | null;
  onClose: () => void;
  onSuccess: () => void;
  tasks: RalphTaskData[];
  definition: WorkflowDefinition;
}

export default function ExecuteModal({
  isOpen,
  taskId,
  onClose,
  onSuccess,
  tasks,
  definition,
}: ExecuteModalProps) {
  const [branchInfo, setBranchInfo] = useState<{
    baseBranch: string;
    featureBranch: string;
    branchConflict: boolean;
    deliveryMethod: 'merge-request' | 'direct-commit';
  } | null>(null);
  const [planInfo, setPlanInfo] = useState<{
    currentPlan: string | null;
    iterationCount: number;
    lastOutcome: string | null;
  } | null>(null);
  const [isPlanExpanded, setIsPlanExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch branch preview info when modal opens
  useEffect(() => {
    if (!isOpen || !taskId) return;

    setError(null);
    setLoading(true);
    setBranchInfo(null);
    setPlanInfo(null);
    setIsPlanExpanded(false);

    fetch(`/api/ralph/tasks/${taskId}/execute`)
      .then(async (response) => {
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        setBranchInfo({
          baseBranch: data.branchInfo?.baseBranch || 'main',
          featureBranch: data.branchInfo?.featureBranch || `ralph/${taskId}`,
          branchConflict: data.branchConflict || false,
          deliveryMethod: data.deliveryMethod || 'merge-request',
        });
        setPlanInfo({
          currentPlan: data.planInfo?.currentPlan || null,
          iterationCount: data.planInfo?.iterationCount || 0,
          lastOutcome: data.planInfo?.lastOutcome || null,
        });
      })
      .catch((err) => {
        console.error('[EXECUTE MODAL] Failed to fetch execute preview:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch branch info');
      })
      .finally(() => setLoading(false));
  }, [isOpen, taskId]);

  const handleClose = useCallback(() => {
    setBranchInfo(null);
    setPlanInfo(null);
    setError(null);
    onClose();
  }, [onClose]);

  const handleConfirmExecute = useCallback(async () => {
    if (!taskId) return;

    console.log('[EXECUTE MODAL] Confirming execute for task:', taskId);
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/ralph/tasks/${taskId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmBranchCreation: true }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
      }

      handleClose();
      onSuccess();
    } catch (err) {
      console.error('[EXECUTE MODAL] Failed to execute task:', err);
      setError(err instanceof Error ? err.message : 'Failed to execute task');
    } finally {
      setLoading(false);
    }
  }, [taskId, handleClose, onSuccess]);

  const handleBackToPlanning = useCallback(async () => {
    if (!taskId) return;

    const currentTask = tasks.find((t) => t.id === taskId);
    const currentStageIndex = definition.stages.findIndex((s) => s.id === currentTask?.status);
    const previousStage = currentStageIndex > 0 ? definition.stages[currentStageIndex - 1] : null;
    const toStatus = previousStage?.id ?? 'draft';

    console.log('[EXECUTE MODAL] Sending task back to previous stage:', taskId, '->', toStatus);
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/ralph/tasks/${taskId}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toStatus }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      handleClose();
      onSuccess();
    } catch (err) {
      console.error('[EXECUTE MODAL] Failed to send task back to planning:', err);
      setError(err instanceof Error ? err.message : 'Failed to transition task');
    } finally {
      setLoading(false);
    }
  }, [taskId, tasks, definition, handleClose, onSuccess]);

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
      size="lg"
      scrollBehavior="inside"
    >
      <ModalContent>
        {(onCloseModal) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <GitBranch className="w-5 h-5 text-primary" />
                <span>Start Execution</span>
              </div>
            </ModalHeader>
            <ModalBody>
              {loading && !branchInfo ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : error && !branchInfo ? (
                <div className="flex flex-col items-center gap-3 py-4">
                  <AlertTriangle className="w-12 h-12 text-danger" />
                  <p className="text-danger text-center">{error}</p>
                </div>
              ) : branchInfo ? (
                <div className="space-y-4">
                  {/* Plan Review Section */}
                  {planInfo?.currentPlan && (
                    <div className="border border-divider rounded-lg overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setIsPlanExpanded(!isPlanExpanded)}
                        className="w-full flex items-center justify-between p-3 bg-content2 hover:bg-content3 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <FileCode className="w-4 h-4 text-secondary-500" />
                          <span className="font-medium text-sm">Generated Plan</span>
                          {planInfo.iterationCount > 0 && (
                            <Chip size="sm" color="secondary" variant="flat">
                              {planInfo.iterationCount} iteration
                              {planInfo.iterationCount !== 1 ? 's' : ''}
                            </Chip>
                          )}
                        </div>
                        {isPlanExpanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>
                      {isPlanExpanded && (
                        <div className="p-3 bg-content1 max-h-64 overflow-y-auto">
                          <pre className="text-xs whitespace-pre-wrap font-mono">
                            {planInfo.currentPlan}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}

                  {branchInfo.deliveryMethod === 'direct-commit' ? (
                    <>
                      <p className="text-default-600">
                        This will start execution by committing directly to the target branch. No
                        feature branch will be created.
                      </p>

                      <div className="bg-default-100 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-default-500 text-sm">Target branch:</span>
                          <code className="bg-primary-100 text-primary px-2 py-1 rounded text-sm">
                            {branchInfo.baseBranch}
                          </code>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-default-600">
                        This will create a new feature branch and start execution. Review the plan
                        above and confirm the branch configuration:
                      </p>

                      <div className="bg-default-100 rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-default-500 text-sm">Base branch:</span>
                          <code className="bg-default-200 px-2 py-1 rounded text-sm">
                            {branchInfo.baseBranch}
                          </code>
                        </div>
                        <div className="flex items-center justify-center">
                          <ArrowRight className="w-4 h-4 text-default-400" />
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-default-500 text-sm">Feature branch:</span>
                          <code className="bg-primary-100 text-primary px-2 py-1 rounded text-sm">
                            {branchInfo.featureBranch}
                          </code>
                        </div>
                      </div>

                      {branchInfo.branchConflict && (
                        <div className="flex items-start gap-2 p-3 bg-danger-50 border border-danger-200 rounded-lg">
                          <AlertTriangle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-danger font-medium">Branch name conflict</p>
                            <p className="text-danger-600 text-sm">
                              A branch named &ldquo;{branchInfo.featureBranch}&rdquo; already
                              exists. Please edit the task to use a different feature branch name
                              before executing.
                            </p>
                          </div>
                        </div>
                      )}
                    </>
                  )}

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
              <div className="flex justify-between w-full">
                <Button
                  variant="flat"
                  color="warning"
                  onPress={handleBackToPlanning}
                  isDisabled={loading || !branchInfo}
                  startContent={<RotateCcw className="w-4 h-4" />}
                >
                  Back to Planning
                </Button>
                <div className="flex gap-2">
                  <Button variant="light" onPress={onCloseModal} isDisabled={loading}>
                    Cancel
                  </Button>
                  <Button
                    color="primary"
                    onPress={handleConfirmExecute}
                    isLoading={loading}
                    isDisabled={
                      loading ||
                      !branchInfo ||
                      (branchInfo.deliveryMethod !== 'direct-commit' && branchInfo.branchConflict)
                    }
                    startContent={!loading && <PlayCircle className="w-4 h-4" />}
                  >
                    {branchInfo?.deliveryMethod === 'direct-commit'
                      ? 'Start Execution'
                      : 'Create Branch & Execute'}
                  </Button>
                </div>
              </div>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
