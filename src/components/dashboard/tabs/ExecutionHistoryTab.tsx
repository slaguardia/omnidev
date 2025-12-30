'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@heroui/button';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/modal';
import { Switch } from '@heroui/switch';
import {
  History,
  Trash2,
  Eye,
  Clock,
  CheckCircle,
  XCircle,
  Info,
  MessageSquare,
  Pencil,
  RefreshCw,
  GitBranch,
} from 'lucide-react';
import { Tooltip } from '@heroui/tooltip';
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
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [isManuallyRefreshing, setIsManuallyRefreshing] = useState(false);

  // Auto-refresh every 3 seconds when enabled
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(onRefresh, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh, onRefresh]);

  // Reset manual refresh state when loading completes
  useEffect(() => {
    if (!loading) {
      setIsManuallyRefreshing(false);
    }
  }, [loading]);

  const handleManualRefresh = () => {
    setIsManuallyRefreshing(true);
    onRefresh();
  };

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
          <History className="w-6 h-6 text-default-500" />
          Execution History
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
            onClick={handleManualRefresh}
            isLoading={isManuallyRefreshing}
            startContent={<RefreshCw className="w-4 h-4" />}
          >
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
      <div className="space-y-4">
        {history.map((execution) => (
          <div key={execution.id} className="p-4 glass-card">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {execution.status === 'success' ? (
                    <CheckCircle className="w-4 h-4 text-success-500 flex-shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-danger-500 flex-shrink-0" />
                  )}
                  <span className="font-medium text-sm truncate">{execution.workspaceName}</span>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full border flex-shrink-0 ${
                      execution.editRequest
                        ? 'bg-warning-100 text-warning-800 border-warning-300 dark:bg-warning-500/20 dark:text-warning-300 dark:border-warning-500/40'
                        : 'bg-primary-100 text-primary-800 border-primary-300 dark:bg-primary-500/20 dark:text-primary-300 dark:border-primary-500/40'
                    }`}
                  >
                    {execution.editRequest ? (
                      <Pencil className="w-3 h-3" />
                    ) : (
                      <MessageSquare className="w-3 h-3" />
                    )}
                    {execution.editRequest ? 'Edit' : 'Ask'}
                  </span>
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
                  {execution.sourceBranch && (
                    <span className="flex items-center gap-1">
                      <GitBranch className="w-3 h-3" />
                      {execution.sourceBranch}
                      {execution.targetBranch && execution.sourceBranch !== execution.targetBranch && (
                        <span className="text-default-400">→ {execution.targetBranch}</span>
                      )}
                    </span>
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
          base: 'bg-background/85 backdrop-blur-lg border border-divider/60',
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
                  {selectedExecution && (
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full border ${
                        selectedExecution.editRequest
                          ? 'bg-warning-100 text-warning-800 border-warning-300 dark:bg-warning-500/20 dark:text-warning-300 dark:border-warning-500/40'
                          : 'bg-primary-100 text-primary-800 border-primary-300 dark:bg-primary-500/20 dark:text-primary-300 dark:border-primary-500/40'
                      }`}
                    >
                      {selectedExecution.editRequest ? (
                        <Pencil className="w-3 h-3" />
                      ) : (
                        <MessageSquare className="w-3 h-3" />
                      )}
                      {selectedExecution.editRequest ? 'Edit' : 'Ask'}
                    </span>
                  )}
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
                    {(selectedExecution.sourceBranch || selectedExecution.targetBranch) && (
                      <div>
                        <h4 className="text-sm font-semibold text-default-700 mb-1">Branch</h4>
                        <div className="flex items-center gap-2 text-sm">
                          <GitBranch className="w-4 h-4 text-default-500" />
                          {selectedExecution.sourceBranch && (
                            <span className="font-mono bg-default-100 px-2 py-0.5 rounded">
                              {selectedExecution.sourceBranch}
                            </span>
                          )}
                          {selectedExecution.targetBranch &&
                            selectedExecution.sourceBranch !== selectedExecution.targetBranch && (
                              <>
                                <span className="text-default-400">→</span>
                                <span className="font-mono bg-default-100 px-2 py-0.5 rounded">
                                  {selectedExecution.targetBranch}
                                </span>
                              </>
                            )}
                        </div>
                      </div>
                    )}
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

                    {/* Usage Information from JSON Logs - moved to bottom */}
                    {selectedExecution.jsonLogs && (
                      <div>
                        <h4 className="text-sm font-semibold text-default-700 mb-2">
                          Usage & Cost
                        </h4>
                        {(() => {
                          // Extract usage from JSON logs
                          const resultLog = selectedExecution.jsonLogs.find(
                            (log) => log.type === 'result'
                          );
                          const usage = resultLog?.usage as
                            | {
                                input_tokens?: number;
                                output_tokens?: number;
                                cache_creation_input_tokens?: number;
                                cache_read_input_tokens?: number;
                              }
                            | undefined;
                          const costUsd = resultLog?.total_cost_usd as number | undefined;

                          if (!usage && costUsd === undefined) {
                            return (
                              <p className="text-sm text-default-500">
                                Usage information not available
                              </p>
                            );
                          }

                          return (
                            <div className="p-4 bg-primary-50 dark:bg-primary-500/10 rounded-lg border border-primary-200 dark:border-primary-500/20">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {costUsd !== undefined && (
                                  <div>
                                    <p className="text-xs text-default-500 mb-1">Cost</p>
                                    <p className="text-lg font-semibold text-primary-600 dark:text-primary-400">
                                      ${costUsd.toFixed(4)}
                                    </p>
                                  </div>
                                )}
                                {usage?.input_tokens !== undefined && (
                                  <div>
                                    <p className="text-xs text-default-500 mb-1">Input Tokens</p>
                                    <p className="text-sm font-medium text-default-700 dark:text-default-300">
                                      {usage.input_tokens.toLocaleString()}
                                    </p>
                                  </div>
                                )}
                                {usage?.output_tokens !== undefined && (
                                  <div>
                                    <p className="text-xs text-default-500 mb-1">Output Tokens</p>
                                    <p className="text-sm font-medium text-default-700 dark:text-default-300">
                                      {usage.output_tokens.toLocaleString()}
                                    </p>
                                  </div>
                                )}
                                {(usage?.input_tokens !== undefined ||
                                  usage?.output_tokens !== undefined) && (
                                  <div>
                                    <p className="text-xs text-default-500 mb-1">Total Tokens</p>
                                    <p className="text-sm font-medium text-default-700 dark:text-default-300">
                                      {(
                                        (usage.input_tokens || 0) + (usage.output_tokens || 0)
                                      ).toLocaleString()}
                                    </p>
                                  </div>
                                )}
                              </div>
                              {(usage?.cache_creation_input_tokens !== undefined ||
                                usage?.cache_read_input_tokens !== undefined) && (
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
                                    {usage.cache_creation_input_tokens !== undefined && (
                                      <div>
                                        <span className="text-default-500">Created: </span>
                                        <span className="font-medium text-default-700 dark:text-default-300">
                                          {usage.cache_creation_input_tokens.toLocaleString()}{' '}
                                          <span className="text-default-400">tokens</span>
                                        </span>
                                      </div>
                                    )}
                                    {usage.cache_read_input_tokens !== undefined && (
                                      <div>
                                        <span className="text-default-500">Read: </span>
                                        <span className="font-medium text-default-700 dark:text-default-300">
                                          {usage.cache_read_input_tokens.toLocaleString()}{' '}
                                          <span className="text-default-400">tokens</span>
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()}
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
          base: 'bg-background/85 backdrop-blur-lg border border-divider/60',
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
