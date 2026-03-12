'use client';

import React, { useState } from 'react';
import { Button } from '@heroui/button';
import { Input } from '@heroui/input';
import { Chip } from '@heroui/chip';
import { Checkbox } from '@heroui/checkbox';
import { Trash2, Pencil, Star, Plus, X, Check } from 'lucide-react';
import { useWorkflowDefinition } from '@/hooks/queries/useWorkflowDefinition';
import {
  useRalphPlaybooks,
  useCreateRalphPlaybook,
  useUpdateRalphPlaybook,
  useDeleteRalphPlaybook,
} from '@/hooks/queries/useRalphPlaybooks';
import type { RalphPlaybook } from './types';

type StatusColor = 'default' | 'warning' | 'secondary' | 'success' | 'primary' | 'danger';

export default function PlaybooksSubtab() {
  const { definition } = useWorkflowDefinition();
  const { data: playbooks = [] } = useRalphPlaybooks();
  const createPlaybook = useCreateRalphPlaybook();
  const updatePlaybook = useUpdateRalphPlaybook();
  const deletePlaybook = useDeleteRalphPlaybook();

  // Create form state
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newStageIds, setNewStageIds] = useState<string[]>([]);
  const [newIsDefault, setNewIsDefault] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStageIds, setEditStageIds] = useState<string[]>([]);
  const [editIsDefault, setEditIsDefault] = useState(false);

  // Delete confirmation
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const allStages = definition.stages;

  const resetCreateForm = () => {
    setNewName('');
    setNewDescription('');
    setNewStageIds([]);
    setNewIsDefault(false);
    setIsCreating(false);
  };

  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed || newStageIds.length === 0) return;
    try {
      await createPlaybook.mutateAsync({
        name: trimmed,
        description: newDescription.trim(),
        stageIds: newStageIds,
        isDefault: newIsDefault,
      });
      resetCreateForm();
    } catch {
      // error shown via mutation state
    }
  };

  const startEdit = (playbook: RalphPlaybook) => {
    setEditingId(playbook.id);
    setEditName(playbook.name);
    setEditDescription(playbook.description);
    setEditStageIds([...playbook.stageIds]);
    setEditIsDefault(playbook.isDefault);
  };

  const handleUpdate = async () => {
    if (!editingId || !editName.trim() || editStageIds.length === 0) return;
    try {
      await updatePlaybook.mutateAsync({
        id: editingId,
        name: editName.trim(),
        description: editDescription.trim(),
        stageIds: editStageIds,
        isDefault: editIsDefault,
      });
      setEditingId(null);
    } catch {
      // error shown via mutation state
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deletePlaybook.mutateAsync(id);
      setConfirmDeleteId(null);
    } catch {
      // error shown via mutation state
    }
  };

  const toggleStageId = (stageId: string, list: string[], setList: (ids: string[]) => void) => {
    if (list.includes(stageId)) {
      setList(list.filter((id) => id !== stageId));
    } else {
      // Insert in workflow order
      const allIds = allStages.map((s) => s.id);
      const newList = [...list, stageId].sort((a, b) => allIds.indexOf(a) - allIds.indexOf(b));
      setList(newList);
    }
  };

  const renderStageChips = (stageIds: string[]) => {
    return stageIds.map((sid) => {
      const stage = allStages.find((s) => s.id === sid);
      if (!stage) return null;
      return (
        <Chip key={sid} size="sm" variant="flat" color={stage.color as StatusColor}>
          {stage.label}
        </Chip>
      );
    });
  };

  const renderStagePicker = (selectedIds: string[], onToggle: (stageId: string) => void) => {
    return (
      <div className="flex flex-wrap gap-2">
        {allStages.map((stage) => {
          const isSelected = selectedIds.includes(stage.id);
          return (
            <Chip
              key={stage.id}
              size="sm"
              variant={isSelected ? 'solid' : 'bordered'}
              color={stage.color as StatusColor}
              className="cursor-pointer select-none"
              onClick={() => onToggle(stage.id)}
            >
              {stage.label}
            </Chip>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-4 px-1">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Playbooks</h3>
          <p className="text-xs text-default-400">
            Define named stage subsets for tasks. A playbook determines which stages a task passes
            through.
          </p>
        </div>
        {!isCreating && (
          <Button
            size="sm"
            color="primary"
            variant="flat"
            startContent={<Plus className="w-3.5 h-3.5" />}
            onPress={() => setIsCreating(true)}
          >
            New Playbook
          </Button>
        )}
      </div>

      {/* Create form */}
      {isCreating && (
        <div className="rounded-lg border dark:border-white/[0.06] border-gray-200 p-4 space-y-3 bg-content2/30">
          <Input
            label="Name"
            labelPlacement="outside"
            placeholder="e.g. Quick Fix"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            variant="bordered"
            size="sm"
          />
          <Input
            label="Description"
            labelPlacement="outside"
            placeholder="Optional description"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            variant="bordered"
            size="sm"
          />
          <div>
            <div className="text-xs font-medium text-default-500 mb-1.5">
              Stages (click to toggle)
            </div>
            {renderStagePicker(newStageIds, (id) => toggleStageId(id, newStageIds, setNewStageIds))}
            {newStageIds.length === 0 && (
              <p className="text-xs text-danger mt-1">Select at least one stage</p>
            )}
          </div>
          <Checkbox size="sm" isSelected={newIsDefault} onValueChange={setNewIsDefault}>
            <span className="text-xs">Set as default playbook</span>
          </Checkbox>

          {createPlaybook.isError && (
            <p className="text-xs text-danger">{createPlaybook.error?.message}</p>
          )}

          <div className="flex items-center gap-2 justify-end">
            <Button size="sm" variant="light" onPress={resetCreateForm}>
              Cancel
            </Button>
            <Button
              size="sm"
              color="primary"
              isLoading={createPlaybook.isPending}
              isDisabled={!newName.trim() || newStageIds.length === 0}
              onPress={handleCreate}
            >
              Create
            </Button>
          </div>
        </div>
      )}

      {/* Playbook list */}
      {playbooks.length > 0 ? (
        <div className="space-y-2">
          {playbooks.map((pb) => {
            const isEditing = editingId === pb.id;

            if (isEditing) {
              return (
                <div
                  key={pb.id}
                  className="rounded-lg border dark:border-white/[0.06] border-gray-200 p-4 space-y-3 bg-content2/30"
                >
                  <Input
                    label="Name"
                    labelPlacement="outside"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    variant="bordered"
                    size="sm"
                  />
                  <Input
                    label="Description"
                    labelPlacement="outside"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    variant="bordered"
                    size="sm"
                  />
                  <div>
                    <div className="text-xs font-medium text-default-500 mb-1.5">
                      Stages (click to toggle)
                    </div>
                    {renderStagePicker(editStageIds, (id) =>
                      toggleStageId(id, editStageIds, setEditStageIds)
                    )}
                    {editStageIds.length === 0 && (
                      <p className="text-xs text-danger mt-1">Select at least one stage</p>
                    )}
                  </div>
                  <Checkbox size="sm" isSelected={editIsDefault} onValueChange={setEditIsDefault}>
                    <span className="text-xs">Set as default playbook</span>
                  </Checkbox>

                  {updatePlaybook.isError && (
                    <p className="text-xs text-danger">{updatePlaybook.error?.message}</p>
                  )}

                  <div className="flex items-center gap-2 justify-end">
                    <Button size="sm" variant="light" onPress={() => setEditingId(null)}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      color="primary"
                      isLoading={updatePlaybook.isPending}
                      isDisabled={!editName.trim() || editStageIds.length === 0}
                      onPress={handleUpdate}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={pb.id}
                className="flex items-start justify-between gap-3 px-4 py-3 rounded-lg bg-content2/50"
              >
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{pb.name}</span>
                    {pb.isDefault && (
                      <Chip
                        size="sm"
                        variant="flat"
                        color="warning"
                        startContent={<Star className="w-3 h-3" />}
                      >
                        Default
                      </Chip>
                    )}
                  </div>
                  {pb.description && <p className="text-xs text-default-400">{pb.description}</p>}
                  <div className="flex flex-wrap gap-1">{renderStageChips(pb.stageIds)}</div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {confirmDeleteId === pb.id ? (
                    <>
                      <Button
                        size="sm"
                        color="danger"
                        variant="flat"
                        isLoading={deletePlaybook.isPending}
                        onPress={() => handleDelete(pb.id)}
                        startContent={<Check className="w-3 h-3" />}
                      >
                        Confirm
                      </Button>
                      <Button
                        size="sm"
                        variant="light"
                        onPress={() => setConfirmDeleteId(null)}
                        startContent={<X className="w-3 h-3" />}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" variant="light" isIconOnly onPress={() => startEdit(pb)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="light"
                        color="danger"
                        isIconOnly
                        onPress={() => setConfirmDeleteId(pb.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : !isCreating ? (
        <p className="text-sm text-default-400 text-center py-8">
          No playbooks yet. Create one to define stage subsets for tasks.
        </p>
      ) : null}
    </div>
  );
}
