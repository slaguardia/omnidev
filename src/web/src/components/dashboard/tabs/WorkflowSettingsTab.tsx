'use client';

import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useImperativeHandle,
  forwardRef,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invalidateRalphBoardData } from '@/hooks/queries/useRalphBoardInvalidation';
import { addToast } from '@heroui/toast';
import { Button } from '@heroui/button';
import { Textarea, Input } from '@heroui/input';
import { Switch } from '@heroui/switch';
import { Card, CardBody, CardHeader } from '@heroui/card';
import { Chip } from '@heroui/chip';
import { Select, SelectItem } from '@heroui/select';
import { Checkbox } from '@heroui/checkbox';
import { ChevronDown, Plus, Trash2, Info, GripVertical, Eye, Pencil, Terminal } from 'lucide-react';
import { Reorder, useDragControls } from 'framer-motion';
import type { WorkflowStageDefinition, WorkflowDefinition, CliPermission } from '@/lib/types/index';
import { DEFAULT_WORKFLOW_DEFINITION, STAGE_COLORS } from '@/lib/workflow/definition';

/**
 * Ensure a stage ID is unique by appending a number if needed
 */
function ensureUniqueId(id: string, existingIds: string[]): string {
  if (!existingIds.includes(id)) return id;
  let counter = 2;
  while (existingIds.includes(`${id}-${counter}`)) {
    counter++;
  }
  return `${id}-${counter}`;
}

interface StageItemProps {
  stage: WorkflowStageDefinition;
  index: number;
  isExpanded: boolean;
  enableLayoutAnimation: boolean;
  onToggleExpanded: (stageId: string) => void;
  onUpdateStage: (index: number, updates: Partial<WorkflowStageDefinition>) => void;
  onRemoveStage: (index: number) => void;
  canDelete: boolean;
}

function StageItem({
  stage,
  index,
  isExpanded,
  enableLayoutAnimation: _enableLayoutAnimation,
  onToggleExpanded,
  onUpdateStage,
  onRemoveStage,
  canDelete,
}: StageItemProps) {
  const controls = useDragControls();
  const isDragging = useRef(false);
  const [_dragging, setDragging] = useState(false);

  return (
    <Reorder.Item
      value={stage}
      dragListener={false}
      dragControls={controls}
      onDragStart={() => {
        isDragging.current = true;
        setDragging(true);
      }}
      onDragEnd={() => {
        requestAnimationFrame(() => {
          isDragging.current = false;
          setDragging(false);
        });
      }}
      whileDrag={{ boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}
      initial={false}
      animate={false}
      transition={{ layout: { duration: 0 }, default: { duration: 0 } }}
      className="list-none"
    >
      <Card className="glass-card-static">
        <CardHeader
          className="px-4 py-3 cursor-pointer items-center"
          onClick={() => {
            if (!isDragging.current) onToggleExpanded(stage.id);
          }}
        >
          <div className="flex items-center gap-2 flex-1">
            <div
              className="cursor-grab active:cursor-grabbing touch-none p-1 -ml-1 text-default-400 hover:text-default-600"
              onPointerDown={(e) => {
                e.stopPropagation();
                controls.start(e);
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <GripVertical className="w-4 h-4" />
            </div>
            <div className="w-36 truncate">
              <Chip size="sm" variant="flat" color={stage.color}>
                {stage.label}
              </Chip>
            </div>
            <div className="w-24">
              <Chip
                size="sm"
                variant="dot"
                color={stage.executionMode === 'edit' ? 'warning' : 'default'}
              >
                {stage.executionMode === 'edit' ? 'Edit' : 'Read-only'}
              </Chip>
            </div>
            <div className="w-24">
              {stage.config.prompt && (
                <Chip size="sm" variant="flat" color="primary">
                  Has prompt
                </Chip>
              )}
            </div>
            <div className="w-24">
              {stage.config.returnQuestions && (
                <Chip size="sm" variant="flat" color="secondary">
                  Questions
                </Chip>
              )}
            </div>
          </div>
          <ChevronDown
            className={`w-4 h-4 text-default-400 transition-transform ${
              isExpanded ? 'rotate-180' : ''
            }`}
          />
        </CardHeader>
        {isExpanded && (
          <CardBody className="px-4 py-3 space-y-4 border-t border-divider">
            {/* ID and Label */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Stage ID (slug)"
                value={stage.id}
                onChange={(e) => {
                  const newId = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
                  if (newId && newId !== 'draft' && newId !== 'complete') {
                    onUpdateStage(index, { id: newId });
                  }
                }}
                variant="bordered"
                description="Lowercase alphanumeric with hyphens. Cannot be 'draft' or 'complete'."
                classNames={{ input: 'font-mono text-sm' }}
              />
              <Input
                label="Display Label"
                value={stage.label}
                onChange={(e) => onUpdateStage(index, { label: e.target.value })}
                variant="bordered"
              />
            </div>

            {/* Color and Execution Mode */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Color"
                selectedKeys={new Set([stage.color])}
                onSelectionChange={(keys) => {
                  const selected = Array.from(keys)[0] as string;
                  if (selected) {
                    onUpdateStage(index, {
                      color: selected as WorkflowStageDefinition['color'],
                    });
                  }
                }}
                variant="bordered"
              >
                {STAGE_COLORS.map((color) => (
                  <SelectItem key={color}>
                    {color.charAt(0).toUpperCase() + color.slice(1)}
                  </SelectItem>
                ))}
              </Select>
              <div className="flex flex-col gap-2 justify-center">
                <Switch
                  isSelected={stage.executionMode === 'edit'}
                  onValueChange={(val) =>
                    onUpdateStage(index, {
                      executionMode: val ? 'edit' : 'readonly',
                    })
                  }
                  size="sm"
                  startContent={<Pencil className="w-3 h-3" />}
                  endContent={<Eye className="w-3 h-3" />}
                >
                  Edit Mode
                </Switch>
                <p className="text-xs text-foreground-400">
                  {stage.executionMode === 'edit'
                    ? 'Creates a feature branch and runs Claude Code with edit permissions.'
                    : 'Read-only analysis — no code changes.'}
                </p>
              </div>
            </div>

            {/* Prompt Template */}
            <Textarea
              label="Prompt Template"
              value={stage.config.prompt ?? ''}
              onChange={(e) =>
                onUpdateStage(index, {
                  config: {
                    ...stage.config,
                    prompt: e.target.value || null,
                  },
                })
              }
              variant="bordered"
              minRows={4}
              maxRows={15}
              classNames={{
                input: 'font-mono text-sm',
              }}
              description="The prompt sent to Claude Code when this stage runs. Leave empty to skip execution."
            />

            <div className="text-xs text-foreground-400 bg-content2/50 p-2 rounded-lg space-y-1">
              <div className="flex items-center gap-2">
                <Info className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="font-medium">Available template variables:</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 pl-5">
                <span>
                  <code className="text-primary-500">{'{title}'}</code> — task title
                </span>
                <span>
                  <code className="text-primary-500">{'{description}'}</code> — task description
                </span>
                <span>
                  <code className="text-primary-500">{'{filePaths}'}</code> — relevant file paths
                </span>
                <span>
                  <code className="text-primary-500">{'{artifactPath}'}</code> — stage artifact file
                  path
                </span>
                <span>
                  <code className="text-primary-500">{'{previousStageOutput}'}</code> — output from
                  preceding stage
                </span>
                <span>
                  <code className="text-primary-500">{'{stageOutput:name}'}</code> — output from a
                  specific stage
                </span>
              </div>
            </div>

            {/* Iteration & Questions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                type="number"
                label="Max Iterations"
                value={String(stage.config.maxIterations)}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val) && val >= 1) {
                    onUpdateStage(index, {
                      config: { ...stage.config, maxIterations: val },
                    });
                  }
                }}
                variant="bordered"
                min={1}
                max={10}
                description="Number of loop iterations (1 = single pass)"
              />

              <div className="flex flex-col gap-2">
                <Switch
                  isSelected={stage.config.returnQuestions}
                  onValueChange={(val) =>
                    onUpdateStage(index, {
                      config: { ...stage.config, returnQuestions: val },
                    })
                  }
                  size="sm"
                >
                  Return Questions
                </Switch>
                <p className="text-xs text-foreground-400">
                  When enabled, Claude will be asked to list questions. Execution pauses for human
                  answers before continuing.
                </p>
              </div>
            </div>

            {/* CLI Access */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Switch
                  isSelected={stage.config.cli?.enabled ?? false}
                  onValueChange={(val) =>
                    onUpdateStage(index, {
                      config: {
                        ...stage.config,
                        cli: val
                          ? {
                              enabled: true,
                              permissions: stage.config.cli?.permissions ?? ['tasks:read'],
                            }
                          : { enabled: false, permissions: [] },
                      },
                    })
                  }
                  size="sm"
                  startContent={<Terminal className="w-3 h-3" />}
                >
                  CLI Access
                </Switch>
                <p className="text-xs text-foreground-400">
                  Allow the agent to use the <code>ralph</code> CLI during this stage.
                </p>
              </div>
              {stage.config.cli?.enabled && (
                <div className="pl-2 space-y-2">
                  <p className="text-xs text-foreground-400 font-medium">Permissions:</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(
                      [
                        ['tasks:read', 'Read tasks'],
                        ['tasks:create', 'Create tasks'],
                        ['subtasks:create', 'Create subtasks'],
                        ['tasks:update', 'Update tasks'],
                        ['tasks:transition', 'Transition tasks'],
                        ['deps:read', 'Read deps'],
                        ['deps:write', 'Write deps'],
                        ['stages:run', 'Run stages'],
                      ] as [CliPermission, string][]
                    ).map(([perm, label]) => (
                      <Checkbox
                        key={perm}
                        size="sm"
                        isSelected={stage.config.cli?.permissions.includes(perm) ?? false}
                        onValueChange={(checked) => {
                          const current = stage.config.cli?.permissions ?? [];
                          const next = checked
                            ? [...current, perm]
                            : current.filter((p) => p !== perm);
                          onUpdateStage(index, {
                            config: {
                              ...stage.config,
                              cli: { enabled: true, permissions: next },
                            },
                          });
                        }}
                      >
                        <span className="text-xs">{label}</span>
                      </Checkbox>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Delete button */}
            <div className="flex justify-end pt-2 border-t border-divider">
              <Button
                size="sm"
                variant="flat"
                color="danger"
                startContent={<Trash2 className="w-3 h-3" />}
                isDisabled={!canDelete}
                onPress={() => onRemoveStage(index)}
              >
                Delete Stage
              </Button>
            </div>
          </CardBody>
        )}
      </Card>
    </Reorder.Item>
  );
}

export interface WorkflowSettingsHandle {
  save: () => void;
  reset: () => void;
}

export type WorkflowBusyState = 'idle' | 'saving' | 'resetting';

interface WorkflowSettingsTabProps {
  onBusyStateChange?: (state: WorkflowBusyState) => void;
}

const WorkflowSettingsTab = forwardRef<WorkflowSettingsHandle, WorkflowSettingsTabProps>(
  function WorkflowSettingsTab({ onBusyStateChange }, ref) {
    const queryClient = useQueryClient();

    // Load definition from API
    const { data: serverDefinition } = useQuery({
      queryKey: ['workflow-definition'],
      queryFn: async () => {
        const res = await fetch('/api/workflow/definition');
        if (!res.ok) throw new Error('Failed to load workflow definition');
        const json = (await res.json()) as { definition: WorkflowDefinition };
        return json.definition;
      },
      staleTime: 60_000,
    });

    // Local editable copy
    const [localDefinition, setLocalDefinition] = useState<WorkflowDefinition | null>(null);
    const [synced, setSynced] = useState(false);

    // Sync server data into local state once
    if (serverDefinition && !synced) {
      setLocalDefinition(serverDefinition);
      setSynced(true);
    }

    const definition: WorkflowDefinition =
      localDefinition ?? serverDefinition ?? DEFAULT_WORKFLOW_DEFINITION;
    const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set());
    const [busyState, setBusyState] = useState<WorkflowBusyState>('idle');

    // Suppress layout animation on mount AND when the parent tab goes from display:none → visible.
    // The dashboard hides inactive tabs with display:none, which causes Framer Motion to see
    // items jump from (0,0) to their real positions and animate the transition.
    const [layoutReady, setLayoutReady] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const hasBeenVisible = useRef(false);

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;

      const observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (entry?.isIntersecting) {
            if (!hasBeenVisible.current) {
              // Initial mount — enable after two frames so the browser has painted
              hasBeenVisible.current = true;
              requestAnimationFrame(() => {
                requestAnimationFrame(() => setLayoutReady(true));
              });
            } else {
              // Re-appearing after being hidden — suppress animation for this frame
              setLayoutReady(false);
              requestAnimationFrame(() => {
                requestAnimationFrame(() => setLayoutReady(true));
              });
            }
          }
        },
        { threshold: 0 }
      );

      observer.observe(el);
      return () => observer.disconnect();
    }, []);

    const toggleExpanded = useCallback((stageId: string) => {
      setExpandedStages((prev) => {
        const next = new Set(prev);
        if (next.has(stageId)) {
          next.delete(stageId);
        } else {
          next.add(stageId);
        }
        return next;
      });
    }, []);

    const updateDefinition = useCallback(
      (updates: Partial<WorkflowDefinition>) => {
        setLocalDefinition((prev) => ({
          ...(prev ?? definition),
          ...updates,
        }));
      },
      [definition]
    );

    const updateStage = useCallback(
      (index: number, updates: Partial<WorkflowStageDefinition>) => {
        const newStages = [...definition.stages];
        const current = newStages[index];
        if (!current) return;
        newStages[index] = { ...current, ...updates };
        updateDefinition({ stages: newStages });
      },
      [definition.stages, updateDefinition]
    );

    const handleReorder = useCallback(
      (newOrder: WorkflowStageDefinition[]) => {
        updateDefinition({ stages: newOrder });
      },
      [updateDefinition]
    );

    const addStage = useCallback(() => {
      const existingIds = definition.stages.map((s) => s.id);
      const newId = ensureUniqueId('new-stage', existingIds);
      const newStage: WorkflowStageDefinition = {
        id: newId,
        label: 'New Stage',
        color: 'default',
        executionMode: 'readonly',
        config: {
          prompt: null,
          maxIterations: 1,
          returnQuestions: false,
          autoLoop: false,
        },
      };
      updateDefinition({ stages: [...definition.stages, newStage] });
      setExpandedStages((prev) => new Set(prev).add(newId));
    }, [definition.stages, updateDefinition]);

    const removeStage = useCallback(
      (index: number) => {
        if (definition.stages.length <= 1) return; // Must have at least one stage
        const newStages = definition.stages.filter((_, i) => i !== index);
        updateDefinition({ stages: newStages });
      },
      [definition.stages, updateDefinition]
    );

    const handleSave = useCallback(async () => {
      setBusyState('saving');
      try {
        const res = await fetch('/api/workflow/definition', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(definition),
        });
        const data = (await res.json()) as { success?: boolean; error?: string; message?: string };
        if (res.ok && data.success) {
          addToast({
            title: 'Success',
            description: 'Workflow definition saved',
            color: 'success',
          });
          queryClient.invalidateQueries({ queryKey: ['workflow-definition'] });
          invalidateRalphBoardData(queryClient);
        } else {
          addToast({
            title: 'Error',
            description: data.error ?? 'Failed to save',
            color: 'danger',
          });
        }
      } catch (error) {
        addToast({
          title: 'Error',
          description: error instanceof Error ? error.message : 'Failed to save',
          color: 'danger',
        });
      } finally {
        setBusyState('idle');
      }
    }, [definition, queryClient]);

    const handleReset = useCallback(async () => {
      setBusyState('resetting');
      try {
        const res = await fetch('/api/workflow/definition', { method: 'DELETE' });
        const data = (await res.json()) as { success?: boolean; error?: string };
        if (res.ok && data.success) {
          setLocalDefinition(DEFAULT_WORKFLOW_DEFINITION);
          addToast({
            title: 'Success',
            description: 'Workflow reset to defaults',
            color: 'success',
          });
          queryClient.invalidateQueries({ queryKey: ['workflow-definition'] });
          invalidateRalphBoardData(queryClient);
        } else {
          addToast({
            title: 'Error',
            description: data.error ?? 'Failed to reset',
            color: 'danger',
          });
        }
      } catch (error) {
        addToast({
          title: 'Error',
          description: error instanceof Error ? error.message : 'Failed to reset',
          color: 'danger',
        });
      } finally {
        setBusyState('idle');
      }
    }, [queryClient]);

    useImperativeHandle(
      ref,
      () => ({
        save: handleSave,
        reset: handleReset,
      }),
      [handleSave, handleReset]
    );

    // Report busy state to parent
    useEffect(() => {
      onBusyStateChange?.(busyState);
    }, [busyState, onBusyStateChange]);

    return (
      <div ref={containerRef} className="space-y-6">
        {/* Stage List */}
        <div className="space-y-3">
          {/* Draft bookend indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-content2/50 rounded-lg text-xs text-default-400">
            <Chip size="sm" variant="flat" color="default">
              Draft
            </Chip>
            <span>System stage — all tasks start here</span>
          </div>

          <Reorder.Group
            axis="y"
            values={definition.stages}
            onReorder={handleReorder}
            className="space-y-3"
          >
            {definition.stages.map((stage, index) => (
              <StageItem
                key={stage.id}
                stage={stage}
                index={index}
                isExpanded={expandedStages.has(stage.id)}
                enableLayoutAnimation={layoutReady}
                onToggleExpanded={toggleExpanded}
                onUpdateStage={updateStage}
                onRemoveStage={removeStage}
                canDelete={definition.stages.length > 1}
              />
            ))}
          </Reorder.Group>

          {/* Complete bookend indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-content2/50 rounded-lg text-xs text-default-400">
            <Chip size="sm" variant="flat" color="success">
              Complete
            </Chip>
            <span>System stage — tasks finish here</span>
          </div>

          {/* Add Stage button */}
          <Button
            variant="flat"
            color="default"
            startContent={<Plus className="w-4 h-4" />}
            onPress={addStage}
            className="w-full"
          >
            Add Stage
          </Button>
        </div>
      </div>
    );
  }
);

export default WorkflowSettingsTab;
