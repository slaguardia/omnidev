'use client';

import React, { useState } from 'react';
import { Button } from '@heroui/button';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/modal';
import { History, Trash2, Eye, Clock, CheckCircle, XCircle } from 'lucide-react';
import { ExecutionHistoryEntry } from '@/lib/dashboard/types';

interface ExecutionHistoryTabProps {
  history: ExecutionHistoryEntry[];
  loading: boolean;
  onRefresh: () => void;
  onDelete: (executionId: string) => Promise<{ success: boolean; message: string }>;
  onClearAll: () => Promise<{ success: boolean; message: string }>;
}

export default function ExecutionHistoryTab({
  history,
  loading,
  onRefresh,
  onDelete,
  onClearAll,
}: ExecutionHistoryTabProps) {
  const [selectedExecution, setSelectedExecution] = useState<ExecutionHistoryEntry | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const [showRawOutput, setShowRawOutput] = useState(false);
  const [showJsonLogs, setShowJsonLogs] = useState(false);

  const handleViewDetails = (execution: ExecutionHistoryEntry) => {
    setSelectedExecution(execution);
    setIsDetailModalOpen(true);
    setShowRawOutput(false);
    setShowJsonLogs(false);
  };

  const handleClearAll = async () => {
    await onClearAll();
    setIsClearConfirmOpen(false);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return 'N/A';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold flex items-center gap-2">
          <History className="w-6 h-6 text-purple-500" />
          Execution History
        </h2>
        <div className="flex items-center gap-2">
          <Button color="primary" size="sm" variant="flat" onClick={onRefresh} isLoading={loading}>
            Refresh
          </Button>
          {history.length > 0 && (
            <Button
              color="danger"
              size="sm"
              variant="flat"
              onClick={() => setIsClearConfirmOpen(true)}
              startContent={<Trash2 className="w-4 h-4" />}
            >
              Clear All
            </Button>
          )}
        </div>
      </div>

      {/* History List */}
      <div className="space-y-3">
        {history.map((execution) => (
          <div
            key={execution.id}
            className="p-4 border border-default-200 rounded-lg hover:border-default-300 transition-colors"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {execution.status === 'success' ? (
                    <CheckCircle className="w-4 h-4 text-success-500 flex-shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-danger-500 flex-shrink-0" />
                  )}
                  <span className="font-medium text-sm truncate">{execution.workspaceName}</span>
                </div>
                <p className="text-sm text-default-600 line-clamp-2 mb-2">{execution.question}</p>
                <div className="flex items-center gap-4 text-xs text-default-500">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDate(execution.executedAt)}
                  </span>
                  {execution.executionTimeMs && (
                    <span>Duration: {formatDuration(execution.executionTimeMs)}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  size="sm"
                  variant="flat"
                  onClick={() => handleViewDetails(execution)}
                  startContent={<Eye className="w-4 h-4" />}
                >
                  View
                </Button>
                <Button
                  size="sm"
                  variant="flat"
                  color="danger"
                  onClick={() => onDelete(execution.id)}
                  isIconOnly
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}

        {history.length === 0 && !loading && (
          <div className="text-center py-12">
            <p className="text-default-600">No execution history yet.</p>
            <p className="text-sm text-default-500">
              Ask Claude a question in the Operations tab to see your history here.
            </p>
          </div>
        )}

        {loading && history.length === 0 && (
          <div className="text-center py-12">
            <p className="text-default-600">Loading history...</p>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      <Modal
        isOpen={isDetailModalOpen}
        onOpenChange={setIsDetailModalOpen}
        size="3xl"
        scrollBehavior="inside"
        classNames={{
          base: 'dark:bg-slate-800/95 bg-white/95 backdrop-blur-lg border dark:border-white/10 border-gray/20',
        }}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  {selectedExecution?.status === 'success' ? (
                    <CheckCircle className="w-5 h-5 text-success-500" />
                  ) : (
                    <XCircle className="w-5 h-5 text-danger-500" />
                  )}
                  <span>Execution Details</span>
                </div>
                <p className="text-sm font-normal text-default-500">
                  {selectedExecution && formatDate(selectedExecution.executedAt)}
                </p>
              </ModalHeader>
              <ModalBody>
                {selectedExecution && (
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-semibold text-default-700 mb-1">Workspace</h4>
                      <p className="text-sm">{selectedExecution.workspaceName}</p>
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-default-700 mb-1">Question</h4>
                      <div className="p-3 bg-default-100 rounded-lg">
                        <p className="text-sm whitespace-pre-wrap">{selectedExecution.question}</p>
                      </div>
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-default-700 mb-1">Response</h4>
                      <div className="p-3 bg-default-100 rounded-lg max-h-96 overflow-y-auto">
                        <p className="text-sm whitespace-pre-wrap font-mono">
                          {selectedExecution.response}
                        </p>
                      </div>
                    </div>

                    {(selectedExecution.rawOutput || selectedExecution.jsonLogs) && (
                      <div className="space-y-3">
                        <h4 className="text-sm font-semibold text-default-700">Execution Stream</h4>
                        <div className="flex flex-wrap gap-2">
                          {selectedExecution.rawOutput && (
                            <Button
                              size="sm"
                              variant="flat"
                              onClick={() => setShowRawOutput((v) => !v)}
                            >
                              {showRawOutput ? 'Hide Raw Output' : 'Show Raw Output'}
                            </Button>
                          )}
                          {selectedExecution.jsonLogs && (
                            <Button
                              size="sm"
                              variant="flat"
                              onClick={() => setShowJsonLogs((v) => !v)}
                            >
                              {showJsonLogs
                                ? 'Hide JSON Logs'
                                : `Show JSON Logs (${selectedExecution.jsonLogs.length})`}
                            </Button>
                          )}
                          {selectedExecution.rawOutput && (
                            <Button
                              size="sm"
                              variant="flat"
                              onClick={() =>
                                navigator.clipboard.writeText(selectedExecution.rawOutput || '')
                              }
                            >
                              Copy Raw Output
                            </Button>
                          )}
                        </div>

                        {showRawOutput && selectedExecution.rawOutput && (
                          <div>
                            <p className="text-xs text-default-500 mb-1">
                              Raw stdout capture (includes stream-json + wrapper output).
                            </p>
                            <div className="p-3 bg-default-100 rounded-lg max-h-96 overflow-y-auto">
                              <pre className="text-xs whitespace-pre-wrap font-mono">
                                {selectedExecution.rawOutput}
                              </pre>
                            </div>
                          </div>
                        )}

                        {showJsonLogs && selectedExecution.jsonLogs && (
                          <div>
                            <p className="text-xs text-default-500 mb-1">
                              Parsed stream-json logs captured during execution.
                            </p>
                            <div className="p-3 bg-default-100 rounded-lg max-h-96 overflow-y-auto">
                              <pre className="text-xs whitespace-pre-wrap font-mono">
                                {JSON.stringify(selectedExecution.jsonLogs, null, 2)}
                              </pre>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {selectedExecution.errorMessage && (
                      <div>
                        <h4 className="text-sm font-semibold text-danger-500 mb-1">Error</h4>
                        <div className="p-3 bg-danger-50 dark:bg-danger-500/10 rounded-lg">
                          <p className="text-sm text-danger-600 dark:text-danger-400">
                            {selectedExecution.errorMessage}
                          </p>
                        </div>
                      </div>
                    )}
                    {selectedExecution.executionTimeMs && (
                      <div>
                        <h4 className="text-sm font-semibold text-default-700 mb-1">
                          Execution Time
                        </h4>
                        <p className="text-sm">
                          {formatDuration(selectedExecution.executionTimeMs)}
                        </p>
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

      {/* Clear Confirmation Modal */}
      <Modal
        isOpen={isClearConfirmOpen}
        onOpenChange={setIsClearConfirmOpen}
        size="sm"
        classNames={{
          base: 'dark:bg-slate-800/95 bg-white/95 backdrop-blur-lg border dark:border-white/10 border-gray/20',
        }}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Clear All History?</ModalHeader>
              <ModalBody>
                <p className="text-default-600">
                  This will permanently delete all {history.length} execution records. This action
                  cannot be undone.
                </p>
              </ModalBody>
              <ModalFooter>
                <Button variant="flat" onPress={onClose}>
                  Cancel
                </Button>
                <Button color="danger" onPress={handleClearAll}>
                  Clear All
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
