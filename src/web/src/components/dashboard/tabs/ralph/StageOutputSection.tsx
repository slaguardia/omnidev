'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@heroui/button';
import { Chip } from '@heroui/chip';
import { Textarea } from '@heroui/input';
import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from '@heroui/dropdown';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/modal';
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  PlayCircle,
  FileText,
  Trash2,
  Timer,
  StopCircle,
  RotateCw,
  CheckCircle2,
  MessageCircleQuestion,
  X,
  RefreshCw,
} from 'lucide-react';
import { ChatMarkdown } from '@/components/dashboard/tabs/chat/ChatMarkdown';
import { JobEventTimeline } from '@/components/dashboard/JobEventTimeline';
import type { StageOutput, StageQuestion } from '@/lib/managers/ralph-task-manager';
import type { WorkflowStageDefinition } from '@/lib/types/index';

interface StageOutputSectionProps {
  stageDef: WorkflowStageDefinition;
  stageOutput: StageOutput | undefined;
  isCurrentStage: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onRunStage: () => void;
  onRerunStage: () => void;
  isRunning: boolean;
  onClearIteration?: (iterationIndex: number) => void;
  onClearStageOutput?: () => void;
  onCancelLoop?: () => void;
  executionError?: string | null;
  // Question handling props
  answerInputs: Record<string, string>;
  onAnswerChange: (questionId: string, value: string) => void;
  onAnswerBlur: (questionId: string) => void;
  onDismissQuestion: (questionId: string) => void;
  savingAnswerId: string | null;
  dismissingId: string | null;
}

const STAGE_COLOR_CLASSES: Record<string, string> = {
  default: 'text-default-500',
  warning: 'text-warning-500',
  secondary: 'text-secondary-500',
  success: 'text-success-500',
  primary: 'text-primary-500',
  danger: 'text-danger-500',
};

function ElapsedTimer({ activeJobId }: { activeJobId: string | null | undefined }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!activeJobId) {
      setElapsed(0);
      return;
    }
    setElapsed(0);
    const interval = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(interval);
  }, [activeJobId]);

  if (!activeJobId) return null;

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const display = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  return <span className="text-xs text-default-400 tabular-nums">{display}</span>;
}

function RunningIterationSkeleton({
  stageLabel,
  activeJobId,
}: {
  stageLabel: string;
  activeJobId: string | null | undefined;
}) {
  return (
    <div className="p-3 bg-content2 rounded-lg space-y-3 border border-primary/20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
          <span className="text-sm font-medium text-primary">{stageLabel} is running...</span>
        </div>
        <div className="flex items-center gap-2">
          <Timer className="w-3 h-3 text-default-400" />
          <ElapsedTimer activeJobId={activeJobId} />
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-3 bg-content1 rounded animate-pulse w-full" />
        <div className="h-3 bg-content1 rounded animate-pulse w-5/6" />
        <div className="h-3 bg-content1 rounded animate-pulse w-4/6" />
      </div>
    </div>
  );
}

const COMPLETION_REASON_LABELS: Record<
  string,
  { label: string; color: 'success' | 'warning' | 'danger' | 'default' }
> = {
  complete: { label: 'Completed', color: 'success' },
  'max-iterations': { label: 'Max iterations reached', color: 'warning' },
  error: { label: 'Stopped on error', color: 'danger' },
  questions: { label: 'Paused for questions', color: 'warning' },
  cancelled: { label: 'Cancelled', color: 'default' },
};

/**
 * Build a human-readable summary of what happened across iterations.
 */
function buildIterationSummary(stageOutput: StageOutput): string | null {
  const count = stageOutput.iterations.length;
  if (count === 0) return null;

  const totalMs = stageOutput.iterations.reduce((sum, it) => sum + it.executionTimeMs, 0);
  const totalSecs = Math.round(totalMs / 1000);
  const timeStr =
    totalSecs >= 60 ? `${Math.floor(totalSecs / 60)}m ${totalSecs % 60}s` : `${totalSecs}s`;

  const answeredCount = stageOutput.pendingQuestions.filter((q) => q.answer).length;

  const parts: string[] = [];
  parts.push(`${count} iteration${count !== 1 ? 's' : ''}`);
  parts.push(timeStr);
  if (answeredCount > 0) {
    parts.push(`${answeredCount} question${answeredCount !== 1 ? 's' : ''} answered`);
  }

  return parts.join(' · ');
}

export default function StageOutputSection({
  stageDef,
  stageOutput,
  isCurrentStage,
  isExpanded,
  onToggle,
  onRunStage,
  onRerunStage,
  isRunning,
  onClearStageOutput,
  onCancelLoop,
  executionError,
  answerInputs,
  onAnswerChange,
  onAnswerBlur,
  onDismissQuestion,
  savingAnswerId,
  dismissingId,
}: StageOutputSectionProps) {
  const [showRerunConfirm, setShowRerunConfirm] = useState(false);

  const hasPrompt = !!stageDef.config.prompt;
  const hasActiveJob = !!stageOutput?.activeJobId;
  const isAutoLooping = !!stageOutput?.autoLoopActive;
  const completionReason = stageOutput?.completionReason;
  const iterations = stageOutput?.iterations ?? [];
  const lastIterationError = iterations.at(-1)?.error;
  const displayError = executionError || lastIterationError;
  const fileOutput = stageOutput?.fileOutput;
  const hasOutput = !!fileOutput || iterations.length > 0;

  // Job id for the live agent_events timeline:
  //   - If a job is currently running for this stage, stream its events live.
  //   - Otherwise fall back to the most recent iteration's job so the
  //     historical event timeline (backfill) stays visible after the run
  //     terminates. JobEventTimeline gracefully renders an empty state when
  //     this is null (no run has happened yet for this stage).
  const timelineJobId = stageOutput?.activeJobId ?? iterations.at(-1)?.jobId ?? null;
  const iconColorClass = STAGE_COLOR_CLASSES[stageDef.color] || 'text-default-500';
  const questions = stageOutput?.pendingQuestions ?? [];
  const unansweredCount = questions.filter((q) => !q.answer).length;

  const iterationSummary = stageOutput ? buildIterationSummary(stageOutput) : null;

  const handleRunClick = () => {
    if (hasOutput) {
      setShowRerunConfirm(true);
    } else {
      onRunStage();
    }
  };

  return (
    <div className="border border-divider rounded-lg overflow-hidden">
      {/* Collapsible header */}
      <div className="flex items-center justify-between p-3 bg-content2">
        <button
          type="button"
          onClick={onToggle}
          className="flex-1 flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <FileText className={`w-4 h-4 ${iconColorClass}`} />
          <span className="font-medium">{stageDef.label}</span>
          {hasActiveJob && isAutoLooping && (
            <Chip
              size="sm"
              color="primary"
              variant="flat"
              startContent={<RotateCw className="w-3 h-3 animate-spin" />}
            >
              Auto-looping ({stageOutput?.currentIteration ?? 0}/{stageOutput?.maxIterations ?? '?'}
              )
            </Chip>
          )}
          {hasActiveJob && !isAutoLooping && (
            <Chip
              size="sm"
              color="primary"
              variant="flat"
              startContent={<Loader2 className="w-3 h-3 animate-spin" />}
            >
              Running
            </Chip>
          )}
          {!hasActiveJob &&
            completionReason &&
            (() => {
              const info = COMPLETION_REASON_LABELS[completionReason];
              return info ? (
                <Chip
                  size="sm"
                  color={info.color}
                  variant="flat"
                  startContent={
                    completionReason === 'complete' ? (
                      <CheckCircle2 className="w-3 h-3" />
                    ) : undefined
                  }
                >
                  {info.label}
                </Chip>
              ) : null;
            })()}
          {/* Unanswered questions badge */}
          {!hasActiveJob && unansweredCount > 0 && (
            <Chip
              size="sm"
              color="warning"
              variant="flat"
              startContent={<MessageCircleQuestion className="w-3 h-3" />}
            >
              {unansweredCount} question{unansweredCount !== 1 ? 's' : ''}
            </Chip>
          )}
          {/* Iteration summary in header */}
          {!hasActiveJob && iterationSummary && (
            <span className="text-xs text-default-400">{iterationSummary}</span>
          )}
        </button>
        <div className="flex items-center gap-2">
          {!isExpanded && hasActiveJob && <ElapsedTimer activeJobId={stageOutput?.activeJobId} />}
          {isAutoLooping && onCancelLoop && (
            <Button
              size="sm"
              variant="flat"
              color="danger"
              startContent={<StopCircle className="w-3.5 h-3.5" />}
              onPress={() => onCancelLoop()}
            >
              Stop Loop
            </Button>
          )}
          {hasOutput && !hasActiveJob && onClearStageOutput && (
            <Dropdown>
              <DropdownTrigger>
                <Button
                  isIconOnly
                  size="sm"
                  variant="light"
                  color="danger"
                  className="w-7 h-7 min-w-7"
                  title="Clear stage output"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </DropdownTrigger>
              <DropdownMenu
                aria-label="Confirm clear stage"
                onAction={(key) => {
                  if (key === 'confirm') onClearStageOutput();
                }}
              >
                <DropdownItem
                  key="confirm"
                  color="danger"
                  className="text-danger"
                  startContent={<Trash2 className="w-3.5 h-3.5" />}
                >
                  Clear all stage output
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
          )}
          {hasPrompt && isCurrentStage && !isAutoLooping && (
            <Button
              size="sm"
              variant="flat"
              color={stageDef.color === 'default' ? 'primary' : stageDef.color}
              startContent={
                isRunning ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : hasOutput ? (
                  <RefreshCw className="w-3.5 h-3.5" />
                ) : (
                  <PlayCircle className="w-3.5 h-3.5" />
                )
              }
              isDisabled={isRunning || hasActiveJob}
              onPress={handleRunClick}
            >
              {hasOutput ? 'Rerun Stage' : 'Run Stage'}
            </Button>
          )}
          <button type="button" onClick={onToggle} className="hover:opacity-80 transition-opacity">
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="p-3 space-y-3">
          {/* Error banner */}
          {completionReason === 'error' && displayError && (
            <div className="p-3 rounded-lg bg-danger-50 dark:bg-danger-500/10 border border-danger-200 dark:border-danger-500/20">
              <p className="text-sm text-danger-700 dark:text-danger-400 whitespace-pre-wrap">
                {displayError}
              </p>
            </div>
          )}

          {/* Live agent activity (events stream from /api/ralph/jobs/:jobId/events).
              Mounted above the artifact so users see real-time tool-use during
              an active run; for terminal runs the timeline backfills the
              historical event list and the artifact below stays primary. */}
          {timelineJobId && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-default-500">Agent activity</p>
              <JobEventTimeline jobId={timelineJobId} />
            </div>
          )}

          {/* Artifact content */}
          {fileOutput && (
            <div className="text-sm bg-content1 p-3 rounded-lg max-h-[32rem] overflow-y-auto min-w-0">
              <ChatMarkdown content={fileOutput} />
            </div>
          )}

          {/* Fallback: show last iteration output when no fileOutput yet */}
          {!fileOutput && iterations.length > 0 && (
            <div className="text-sm bg-content1 p-3 rounded-lg max-h-[32rem] overflow-y-auto min-w-0">
              <ChatMarkdown content={iterations.at(-1)?.output ?? ''} />
            </div>
          )}

          {/* Inline questions */}
          {questions.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-default-500 flex items-center gap-1">
                <MessageCircleQuestion className="w-3.5 h-3.5" />
                {questions.length} question{questions.length !== 1 ? 's' : ''}
                {unansweredCount > 0 && (
                  <span className="text-warning-500">({unansweredCount} unanswered)</span>
                )}
              </p>
              {questions.map((question: StageQuestion, index: number) => {
                const isAnswered = !!question.answer;
                const isSaving = savingAnswerId === question.id;
                const isDismissing = dismissingId === question.id;

                return (
                  <div
                    key={question.id}
                    className={`p-3 rounded-lg space-y-2 ${
                      isAnswered
                        ? 'bg-success-50 dark:bg-success-500/10 border border-success-200 dark:border-success-500/30'
                        : 'bg-warning-50 dark:bg-warning-500/10 border border-warning-200 dark:border-warning-500/30'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={`text-xs font-bold px-1.5 py-0.5 rounded shrink-0 ${
                          isAnswered
                            ? 'text-success-600 bg-success-100 dark:bg-success-500/20'
                            : 'text-warning-600 bg-warning-100 dark:bg-warning-500/20'
                        }`}
                      >
                        Q{index + 1}
                      </span>
                      <p className="text-sm font-medium flex-1">{question.question}</p>
                      <Button
                        isIconOnly
                        size="sm"
                        variant="light"
                        color="danger"
                        className="w-6 h-6 min-w-6 shrink-0"
                        title="Dismiss question"
                        isLoading={isDismissing}
                        onPress={() => onDismissQuestion(question.id)}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <div className="ml-7 relative">
                      <Textarea
                        size="sm"
                        placeholder="Type your answer..."
                        value={answerInputs[question.id] || ''}
                        onChange={(e) => onAnswerChange(question.id, e.target.value)}
                        onBlur={() => onAnswerBlur(question.id)}
                        variant="bordered"
                        minRows={1}
                        className="flex-1"
                      />
                      {isSaving && (
                        <span className="absolute right-2 top-2 text-xs text-default-400">
                          Saving...
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Running skeleton */}
          {hasActiveJob && (
            <RunningIterationSkeleton
              stageLabel={
                isAutoLooping
                  ? `${stageDef.label} — iteration ${(stageOutput?.currentIteration ?? 0) + 1}/${stageOutput?.maxIterations ?? '?'}`
                  : stageDef.label
              }
              activeJobId={stageOutput?.activeJobId}
            />
          )}

          {/* Empty state */}
          {!hasOutput &&
            !hasActiveJob &&
            questions.length === 0 &&
            (!hasPrompt ? (
              <p className="text-sm text-default-500 text-center py-4">
                No prompt configured for this stage.
              </p>
            ) : (
              <p className="text-sm text-default-500 text-center py-4">
                Not yet run. Click &quot;Run Stage&quot; to execute.
              </p>
            ))}
        </div>
      )}

      {/* Rerun confirmation modal */}
      <Modal isOpen={showRerunConfirm} onOpenChange={setShowRerunConfirm} size="sm">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Rerun {stageDef.label}?</ModalHeader>
              <ModalBody>
                <p className="text-sm text-default-600">
                  All previous output, iterations, and questions for{' '}
                  <strong>{stageDef.label}</strong> will be cleared and regenerated.
                </p>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  Cancel
                </Button>
                <Button
                  color="warning"
                  onPress={() => {
                    onClose();
                    onRerunStage();
                  }}
                >
                  Rerun Stage
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
