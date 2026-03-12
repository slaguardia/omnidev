'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@heroui/button';
import { Chip } from '@heroui/chip';
import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from '@heroui/dropdown';
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
} from 'lucide-react';
import type { StageOutput, StageIteration } from '@/lib/managers/ralph-task-manager';
import type { WorkflowStageDefinition } from '@/lib/types/index';

interface StageOutputSectionProps {
  stageDef: WorkflowStageDefinition;
  stageOutput: StageOutput | undefined;
  isCurrentStage: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onRunStage: () => void;
  isRunning: boolean;
  onClearIteration?: (iterationIndex: number) => void;
  onCancelLoop?: () => void;
}

/**
 * Color class mapping for stage color tinting on the icon
 */
const STAGE_COLOR_CLASSES: Record<string, string> = {
  default: 'text-default-500',
  warning: 'text-warning-500',
  secondary: 'text-secondary-500',
  success: 'text-success-500',
  primary: 'text-primary-500',
  danger: 'text-danger-500',
};

/**
 * Elapsed timer that ticks every second while a job is active.
 */
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

/**
 * Skeleton loading card shown while a stage job is running.
 */
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

/**
 * StageOutputSection — renders a single workflow stage's collapsible output.
 * Generic: works for any user-defined stage.
 */
/**
 * Completion reason display labels
 */
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

export default function StageOutputSection({
  stageDef,
  stageOutput,
  isCurrentStage,
  isExpanded,
  onToggle,
  onRunStage,
  isRunning,
  onClearIteration,
  onCancelLoop,
}: StageOutputSectionProps) {
  const hasPrompt = !!stageDef.config.prompt;
  const hasActiveJob = !!stageOutput?.activeJobId;
  const isAutoLooping = !!stageOutput?.autoLoopActive;
  const completionReason = stageOutput?.completionReason;
  const iterations = stageOutput?.iterations ?? [];
  const iconColorClass = STAGE_COLOR_CLASSES[stageDef.color] || 'text-default-500';

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
          {iterations.length > 0 && (
            <Chip size="sm" color={stageDef.color} variant="flat">
              {iterations.length} iteration{iterations.length !== 1 ? 's' : ''}
            </Chip>
          )}
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
        </button>
        <div className="flex items-center gap-2">
          {/* Elapsed time in header when collapsed */}
          {!isExpanded && hasActiveJob && <ElapsedTimer activeJobId={stageOutput?.activeJobId} />}
          {/* Stop Loop button — when auto-loop is active */}
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
          {/* Run Stage button — only on the current stage */}
          {hasPrompt && isCurrentStage && !isAutoLooping && (
            <Button
              size="sm"
              variant="flat"
              color={stageDef.color === 'default' ? 'primary' : stageDef.color}
              startContent={
                isRunning ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <PlayCircle className="w-3.5 h-3.5" />
                )
              }
              isDisabled={isRunning || hasActiveJob}
              onPress={() => onRunStage()}
            >
              Run Stage
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
          {/* Existing iterations */}
          {iterations.map((iteration: StageIteration, idx: number) => (
            <div key={idx} className="p-3 bg-content2 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Iteration {iteration.iteration}</span>
                <div className="flex items-center gap-2">
                  {iteration.error && (
                    <Chip size="sm" color="danger" variant="flat">
                      Error
                    </Chip>
                  )}
                  <span className="text-xs text-default-400">
                    {(iteration.executionTimeMs / 1000).toFixed(1)}s
                  </span>
                  {onClearIteration && (
                    <Dropdown>
                      <DropdownTrigger>
                        <Button
                          isIconOnly
                          size="sm"
                          variant="light"
                          color="danger"
                          className="w-6 h-6 min-w-6"
                          title="Remove iteration"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </DropdownTrigger>
                      <DropdownMenu
                        aria-label="Confirm clear"
                        onAction={(key) => {
                          if (key === 'confirm') onClearIteration(idx);
                        }}
                      >
                        <DropdownItem
                          key="confirm"
                          color="danger"
                          className="text-danger"
                          startContent={<Trash2 className="w-3.5 h-3.5" />}
                        >
                          Remove this iteration
                        </DropdownItem>
                      </DropdownMenu>
                    </Dropdown>
                  )}
                </div>
              </div>
              {iteration.error ? (
                <p className="text-sm text-danger-500">{iteration.error}</p>
              ) : (
                <div className="text-sm whitespace-pre-wrap bg-content1 p-3 rounded-lg max-h-96 overflow-y-auto">
                  {iteration.output}
                </div>
              )}
            </div>
          ))}

          {/* Running skeleton — shown whether there are existing iterations or not */}
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

          {/* Empty states (only when no iterations and no active job) */}
          {iterations.length === 0 &&
            !hasActiveJob &&
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
    </div>
  );
}
