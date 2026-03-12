'use client';

import React, { useState, useMemo } from 'react';
import { Chip } from '@heroui/chip';
import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from '@heroui/dropdown';
import { Button } from '@heroui/button';
import { Input } from '@heroui/input';
import { Link, Plus, X, Loader2, AlertTriangle } from 'lucide-react';
import { chipSize, infoChipClasses } from '@/components/Primitives';
import { useRalphTaskDependencies } from '@/hooks/queries/useRalphTaskDependencies';
import { useRalphTasks } from '@/hooks/queries/useRalphTasks';
import {
  useInvalidateRalphTasks,
  useInvalidateRalphTaskDetail,
  useInvalidateRalphTaskDependencies,
} from '@/hooks/queries/useInvalidation';
import type { RalphTaskData } from './types';
import { formatTaskNumber } from './types';

interface DependencySectionProps {
  taskId: string;
  workspaceId: string;
  childIds: string[];
  canEdit: boolean;
  onNavigateToTask: (taskId: string) => void;
}

export default function DependencySection({
  taskId,
  workspaceId,
  childIds,
  canEdit,
  onNavigateToTask,
}: DependencySectionProps) {
  const { data: depInfo, isLoading } = useRalphTaskDependencies(taskId);
  const { data: allTasks = [] } = useRalphTasks();
  const invalidateTasks = useInvalidateRalphTasks();
  const invalidateDetail = useInvalidateRalphTaskDetail();
  const invalidateDeps = useInvalidateRalphTaskDependencies();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterText, setFilterText] = useState('');

  // Filter tasks eligible as blockers: same workspace, not self, not children, not already blocking
  const eligibleTasks = useMemo(() => {
    const currentBlockers = new Set(depInfo?.blockedBy ?? []);
    return allTasks.filter(
      (t: RalphTaskData) =>
        t.workspaceId === workspaceId &&
        t.id !== taskId &&
        !childIds.includes(t.id) &&
        !t.isArchived &&
        !currentBlockers.has(t.id)
    );
  }, [allTasks, workspaceId, taskId, childIds, depInfo?.blockedBy]);

  const filteredTasks = useMemo(() => {
    if (!filterText.trim()) return eligibleTasks;
    const lower = filterText.toLowerCase();
    return eligibleTasks.filter(
      (t) =>
        t.title.toLowerCase().includes(lower) ||
        (t.taskNumber != null && formatTaskNumber(t.taskNumber)?.toLowerCase().includes(lower))
    );
  }, [eligibleTasks, filterText]);

  const updateBlockedBy = async (newBlockedBy: string[]) => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/ralph/tasks/${taskId}/dependencies`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blockedBy: newBlockedBy }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        if (data.code === 'CIRCULAR_DEPENDENCY') {
          setError(data.error || 'Circular dependency detected');
        } else {
          setError(data.error || `HTTP ${response.status}`);
        }
        return;
      }

      // Invalidate all relevant caches
      invalidateDeps(taskId);
      invalidateDetail(taskId);
      invalidateTasks();
    } catch (err) {
      console.error('[DEPENDENCY SECTION] Failed to update dependencies:', err);
      setError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const addBlocker = (blockerId: string) => {
    const current = depInfo?.blockedBy ?? [];
    updateBlockedBy([...current, blockerId]);
    setFilterText('');
  };

  const removeBlocker = (blockerId: string) => {
    const current = depInfo?.blockedBy ?? [];
    updateBlockedBy(current.filter((id) => id !== blockerId));
  };

  const hasBlockers = (depInfo?.blockerDetails?.length ?? 0) > 0;
  const hasBlocks = (depInfo?.blocksDetails?.length ?? 0) > 0;

  // Don't render if no dependencies and can't edit
  if (!canEdit && !hasBlockers && !hasBlocks && !isLoading) return null;

  return (
    <div>
      <div className="text-xs font-medium text-default-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
        <Link className="w-3 h-3" />
        Dependencies
        {(saving || isLoading) && <Loader2 className="w-3 h-3 animate-spin" />}
      </div>

      {/* Blocked By */}
      {(hasBlockers || canEdit) && (
        <div className="mb-2">
          <div className="text-xs text-default-400 mb-1">Blocked by</div>
          <div className="flex flex-wrap gap-1 mb-1.5">
            {depInfo?.blockerDetails?.map((blocker) => {
              const label = `${
                formatTaskNumber(allTasks.find((t) => t.id === blocker.id)?.taskNumber ?? null) ??
                blocker.id.slice(0, 6)
              } ${blocker.title.length > 30 ? blocker.title.slice(0, 30) + '...' : blocker.title}`;
              return canEdit ? (
                <Chip
                  key={blocker.id}
                  size={chipSize}
                  variant="flat"
                  classNames={infoChipClasses}
                  className="cursor-pointer"
                  onClick={() => onNavigateToTask(blocker.id)}
                  onClose={() => removeBlocker(blocker.id)}
                >
                  {label}
                </Chip>
              ) : (
                <Chip
                  key={blocker.id}
                  size={chipSize}
                  variant="flat"
                  classNames={infoChipClasses}
                  className="cursor-pointer"
                  onClick={() => onNavigateToTask(blocker.id)}
                >
                  {label}
                </Chip>
              );
            })}
            {!hasBlockers && !canEdit && <span className="text-xs text-default-400">None</span>}
          </div>

          {canEdit && (
            <Dropdown
              onOpenChange={(open) => {
                if (!open) setFilterText('');
              }}
            >
              <DropdownTrigger>
                <Button
                  size="sm"
                  variant="flat"
                  startContent={<Plus className="w-3 h-3" />}
                  isDisabled={saving || eligibleTasks.length === 0}
                >
                  Add Blocker
                </Button>
              </DropdownTrigger>
              <DropdownMenu
                aria-label="Select blocker task"
                onAction={(key) => addBlocker(key as string)}
                topContent={
                  eligibleTasks.length > 5 ? (
                    <Input
                      size="sm"
                      variant="bordered"
                      placeholder="Filter tasks..."
                      value={filterText}
                      onChange={(e) => setFilterText(e.target.value)}
                      className="px-2 pt-2"
                      autoFocus
                    />
                  ) : undefined
                }
                classNames={{ list: 'max-h-60 overflow-y-auto' }}
              >
                {filteredTasks.map((t) => (
                  <DropdownItem key={t.id} description={t.status} textValue={t.title}>
                    <span className="text-xs">
                      {formatTaskNumber(t.taskNumber) && (
                        <span className="text-default-400 mr-1">
                          {formatTaskNumber(t.taskNumber)}
                        </span>
                      )}
                      {t.title.length > 40 ? t.title.slice(0, 40) + '...' : t.title}
                    </span>
                  </DropdownItem>
                ))}
              </DropdownMenu>
            </Dropdown>
          )}
        </div>
      )}

      {/* Blocks (read-only) */}
      {hasBlocks && (
        <div className="mb-1">
          <div className="text-xs text-default-400 mb-1">Blocks</div>
          <div className="flex flex-wrap gap-1">
            {depInfo?.blocksDetails?.map((blocked) => (
              <Chip
                key={blocked.id}
                size={chipSize}
                variant="flat"
                classNames={infoChipClasses}
                className="cursor-pointer"
                onClick={() => onNavigateToTask(blocked.id)}
              >
                {formatTaskNumber(allTasks.find((t) => t.id === blocked.id)?.taskNumber ?? null) ??
                  blocked.id.slice(0, 6)}{' '}
                {blocked.title.length > 30 ? blocked.title.slice(0, 30) + '...' : blocked.title}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="flex items-center gap-1.5 mt-1.5 text-xs text-danger">
          <AlertTriangle className="w-3 h-3 flex-shrink-0" />
          <span>{error}</span>
          <button
            type="button"
            className="ml-auto text-default-400 hover:text-default-600"
            onClick={() => setError(null)}
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}
