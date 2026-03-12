'use client';

import React, { useState } from 'react';
import { Button } from '@heroui/button';
import { Input } from '@heroui/input';
import { Trash2 } from 'lucide-react';
import {
  useRalphProjects,
  useCreateRalphProject,
  useDeleteRalphProject,
} from '@/hooks/queries/useRalphProjects';

const PROJECT_COLORS = [
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#06b6d4',
  '#3b82f6',
];

export default function ProjectsSubtab() {
  const { data: projects = [] } = useRalphProjects();
  const createProject = useCreateRalphProject();
  const deleteProject = useDeleteRalphProject();

  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PROJECT_COLORS[0]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    try {
      const input: { name: string; color?: string } = { name: trimmed };
      if (newColor) input.color = newColor;
      await createProject.mutateAsync(input);
      setNewName('');
      setNewColor(PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)]);
    } catch {
      // error is shown via mutation state
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteProject.mutateAsync(id);
      setConfirmDeleteId(null);
    } catch {
      // error shown via mutation state
    }
  };

  return (
    <div className="max-w-lg space-y-6">
      {/* Create new project */}
      <div className="space-y-3">
        <div className="flex items-end gap-2">
          <Input
            label="New Project"
            labelPlacement="outside"
            placeholder="Project name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
            }}
            variant="bordered"
            size="sm"
            className="flex-1"
          />
          <Button
            size="sm"
            color="primary"
            isLoading={createProject.isPending}
            isDisabled={!newName.trim()}
            onPress={handleCreate}
          >
            Add
          </Button>
        </div>
        <div className="flex items-center gap-1.5">
          {PROJECT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setNewColor(c)}
              className={`w-5 h-5 rounded-full transition-all ${newColor === c ? 'ring-2 ring-offset-1 ring-primary scale-110' : 'hover:scale-110'}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      {createProject.isError && (
        <p className="text-xs text-danger">{createProject.error?.message}</p>
      )}

      {/* Existing projects */}
      {projects.length > 0 ? (
        <div className="space-y-1">
          {projects.map((proj) => (
            <div
              key={proj.id}
              className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-content2/50"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: proj.color }}
                />
                <span className="text-sm font-medium truncate">{proj.name}</span>
              </div>
              {confirmDeleteId === proj.id ? (
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    color="danger"
                    variant="flat"
                    isLoading={deleteProject.isPending}
                    onPress={() => handleDelete(proj.id)}
                  >
                    Confirm
                  </Button>
                  <Button size="sm" variant="light" onPress={() => setConfirmDeleteId(null)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="light"
                  color="danger"
                  isIconOnly
                  onPress={() => setConfirmDeleteId(proj.id)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-default-400 py-4">
          No projects yet. Create one above to start organizing tasks.
        </p>
      )}
    </div>
  );
}
