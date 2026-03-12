'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { Button } from '@heroui/button';
import { Input, Textarea } from '@heroui/input';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/modal';
import { CheckCircle, ArrowRight, AlertTriangle, ExternalLink } from 'lucide-react';

export interface CompleteModalProps {
  isOpen: boolean;
  taskId: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CompleteModal({ isOpen, taskId, onClose, onSuccess }: CompleteModalProps) {
  const [prInfo, setPrInfo] = useState<{
    provider: 'github' | 'gitlab' | 'other';
    sourceBranch: string | null;
    targetBranch: string;
    defaultTitle: string;
    defaultBody: string;
    canCreatePr: boolean;
    deliveryMethod: 'merge-request' | 'direct-commit';
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prTitle, setPrTitle] = useState('');
  const [prBody, setPrBody] = useState('');
  const [prDraft, setPrDraft] = useState(false);
  const [skipPr, setSkipPr] = useState(false);

  // Fetch PR info when modal opens
  useEffect(() => {
    if (!isOpen || !taskId) return;

    setError(null);
    setLoading(true);
    setPrInfo(null);
    setSkipPr(false);
    setPrDraft(false);

    fetch(`/api/ralph/tasks/${taskId}/complete`)
      .then(async (response) => {
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        setPrInfo({
          provider: data.prInfo?.provider || 'other',
          sourceBranch: data.prInfo?.sourceBranch || null,
          targetBranch: data.prInfo?.targetBranch || 'main',
          defaultTitle: data.prInfo?.defaultTitle || '',
          defaultBody: data.prInfo?.defaultBody || '',
          canCreatePr: data.canCreatePr || false,
          deliveryMethod: data.deliveryMethod || 'merge-request',
        });
        setPrTitle(data.prInfo?.defaultTitle || '');
        setPrBody(data.prInfo?.defaultBody || '');
      })
      .catch((err) => {
        console.error('[COMPLETE MODAL] Failed to fetch complete preview:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch PR info');
      })
      .finally(() => setLoading(false));
  }, [isOpen, taskId]);

  const handleClose = useCallback(() => {
    setPrInfo(null);
    setError(null);
    setPrTitle('');
    setPrBody('');
    setSkipPr(false);
    setPrDraft(false);
    onClose();
  }, [onClose]);

  const handleConfirmComplete = useCallback(async () => {
    if (!taskId) return;

    console.log('[COMPLETE MODAL] Confirming complete for task:', taskId);
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/ralph/tasks/${taskId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: prTitle || undefined,
          body: prBody || undefined,
          skipPr,
          draft: prDraft,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
      }

      handleClose();
      onSuccess();
    } catch (err) {
      console.error('[COMPLETE MODAL] Failed to complete task:', err);
      setError(err instanceof Error ? err.message : 'Failed to complete task');
    } finally {
      setLoading(false);
    }
  }, [taskId, prTitle, prBody, skipPr, prDraft, handleClose, onSuccess]);

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
                <CheckCircle className="w-5 h-5 text-success" />
                <span>Complete Task</span>
              </div>
            </ModalHeader>
            <ModalBody>
              {loading && !prInfo ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : error && !prInfo ? (
                <div className="flex flex-col items-center gap-3 py-4">
                  <AlertTriangle className="w-12 h-12 text-danger" />
                  <p className="text-danger text-center">{error}</p>
                </div>
              ) : prInfo ? (
                <div className="space-y-4">
                  {prInfo.deliveryMethod === 'direct-commit' ? (
                    <>
                      <p className="text-default-600">
                        This direct-commit task will be marked as complete.
                      </p>
                      <p className="text-default-500 text-sm">
                        No pull request will be created for direct-commit tasks.
                      </p>
                    </>
                  ) : prInfo.canCreatePr ? (
                    <>
                      <p className="text-default-600">
                        Create a {prInfo.provider === 'github' ? 'pull request' : 'merge request'}{' '}
                        for this task, or skip and just mark it complete.
                      </p>

                      {/* Branch info */}
                      <div className="bg-default-100 rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-default-500 text-sm">Source branch:</span>
                          <code className="bg-primary-100 text-primary px-2 py-1 rounded text-sm">
                            {prInfo.sourceBranch}
                          </code>
                        </div>
                        <div className="flex items-center justify-center">
                          <ArrowRight className="w-4 h-4 text-default-400" />
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-default-500 text-sm">Target branch:</span>
                          <code className="bg-default-200 px-2 py-1 rounded text-sm">
                            {prInfo.targetBranch}
                          </code>
                        </div>
                      </div>

                      {/* Skip PR checkbox */}
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="skipPr"
                          checked={skipPr}
                          onChange={(e) => setSkipPr(e.target.checked)}
                          className="w-4 h-4 rounded border-default-300"
                        />
                        <label htmlFor="skipPr" className="text-sm text-default-600">
                          Skip {prInfo.provider === 'github' ? 'PR' : 'MR'} creation (just mark task
                          complete)
                        </label>
                      </div>

                      {/* PR details form (hidden when skipping) */}
                      {!skipPr && (
                        <div className="space-y-4 border-t border-default-200 pt-4">
                          <Input
                            label={`${prInfo.provider === 'github' ? 'PR' : 'MR'} Title`}
                            value={prTitle}
                            onValueChange={setPrTitle}
                            placeholder="Enter title"
                          />
                          <Textarea
                            label="Description"
                            value={prBody}
                            onValueChange={setPrBody}
                            placeholder="Enter description"
                            minRows={4}
                            maxRows={10}
                          />
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id="prDraft"
                              checked={prDraft}
                              onChange={(e) => setPrDraft(e.target.checked)}
                              className="w-4 h-4 rounded border-default-300"
                            />
                            <label htmlFor="prDraft" className="text-sm text-default-600">
                              Create as draft
                            </label>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="text-default-600">
                        {prInfo.sourceBranch
                          ? 'Automatic PR creation is not available for this repository provider.'
                          : 'No feature branch configured for this task.'}
                      </p>
                      <p className="text-default-500 text-sm">
                        The task will be marked as complete without creating a pull request.
                      </p>
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
              <Button variant="light" onPress={onCloseModal} isDisabled={loading}>
                Cancel
              </Button>
              <Button
                color="success"
                onPress={handleConfirmComplete}
                isLoading={loading}
                isDisabled={loading || !prInfo}
                startContent={
                  !loading &&
                  (skipPr || !prInfo?.canCreatePr || prInfo?.deliveryMethod === 'direct-commit' ? (
                    <CheckCircle className="w-4 h-4" />
                  ) : (
                    <ExternalLink className="w-4 h-4" />
                  ))
                }
              >
                {skipPr || !prInfo?.canCreatePr || prInfo?.deliveryMethod === 'direct-commit'
                  ? 'Mark Complete'
                  : `Create ${prInfo?.provider === 'github' ? 'PR' : 'MR'} & Complete`}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
