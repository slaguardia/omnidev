'use client';

import React, { useState } from 'react';
import { Button } from '@heroui/button';
import { Checkbox } from '@heroui/checkbox';
import { Input } from '@heroui/input';
import { Popover, PopoverTrigger, PopoverContent } from '@heroui/popover';
import {
  Archive,
  BookOpen,
  ChevronRight,
  CircleDot,
  Filter,
  Folder,
  Plus,
  Search,
  X,
} from 'lucide-react';
import type { WorkspaceFilterOption, RalphProject, RalphPlaybook } from './types';

interface TaskState {
  key: string;
  label: string;
  color: string;
}

interface BoardFilterBarProps {
  searchFilter: string;
  onSearchFilterChange: (value: string) => void;
  searchInputRef: React.RefObject<HTMLInputElement>;
  workspaceFilter: string | null;
  workspaceOptions: WorkspaceFilterOption[];
  onWorkspaceFilterChange: (keys: React.Key | Set<React.Key>) => void;
  projectFilter: string | null;
  projects: RalphProject[];
  onProjectFilterChange: (projectId: string | null) => void;
  statusFilter: string | null;
  taskStates: TaskState[];
  statusColors: Record<string, string>;
  onStatusFilterChange: (status: string | null) => void;
  playbookFilter: string | null;
  playbooks: RalphPlaybook[];
  onPlaybookFilterChange: (playbookId: string | null) => void;
  showArchived: boolean;
  onShowArchivedChange: (value: boolean) => void;
  onCreateTask: () => void;
}

type FilterCategory = 'workspace' | 'project' | 'status' | 'playbook' | null;

const CHECKBOX_CLS = { wrapper: 'after:!ring-0 !ring-0 !outline-none' };

const STATUS_COLOR_MAP: Record<string, string> = {
  default: '#71717a',
  warning: '#f59e0b',
  secondary: '#8b5cf6',
  success: '#22c55e',
  primary: '#3b82f6',
  danger: '#ef4444',
};

export default function BoardFilterBar({
  searchFilter,
  onSearchFilterChange,
  searchInputRef,
  workspaceFilter,
  workspaceOptions,
  onWorkspaceFilterChange,
  projectFilter,
  projects,
  onProjectFilterChange,
  statusFilter,
  taskStates,
  statusColors,
  onStatusFilterChange,
  playbookFilter,
  playbooks,
  onPlaybookFilterChange,
  showArchived,
  onShowArchivedChange,
  onCreateTask,
}: BoardFilterBarProps) {
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<FilterCategory>(null);

  const activeFilterCount =
    (workspaceFilter ? 1 : 0) +
    (projectFilter ? 1 : 0) +
    (statusFilter ? 1 : 0) +
    (playbookFilter ? 1 : 0) +
    (showArchived ? 1 : 0);

  return (
    <div className="flex items-center gap-3">
      {/* Search Input */}
      <Input
        ref={searchInputRef}
        size="sm"
        variant="bordered"
        placeholder="Search tasks..."
        value={searchFilter}
        onValueChange={onSearchFilterChange}
        startContent={<Search className="w-4 h-4 text-default-400" />}
        endContent={
          searchFilter && (
            <button
              onClick={() => onSearchFilterChange('')}
              className="text-default-400 hover:text-default-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )
        }
        className="w-48"
        classNames={{ inputWrapper: 'min-h-9' }}
      />

      {/* Filter Popover */}
      <Popover
        isOpen={isFilterOpen}
        onOpenChange={(open) => {
          setIsFilterOpen(open);
          if (!open) setActiveCategory(null);
        }}
        placement="bottom-start"
        shouldCloseOnInteractOutside={(el) => {
          if ((el as HTMLElement).closest?.('[data-filter-cascade]')) return false;
          return true;
        }}
      >
        <PopoverTrigger>
          <Button
            size="sm"
            variant={activeFilterCount > 0 ? 'flat' : 'bordered'}
            startContent={<Filter className="w-4 h-4" />}
          >
            Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 overflow-visible">
          <div className="p-1 w-[180px] flex flex-col gap-0.5">
            {/* Workspace */}
            <CategoryRow
              icon={Folder}
              label="Workspace"
              isActive={activeCategory === 'workspace'}
              hasFilter={!!workspaceFilter}
              onHover={() => setActiveCategory('workspace')}
            >
              <div className="flex flex-col py-1 w-[220px] max-h-[320px] overflow-y-auto">
                {workspaceOptions.length > 0 ? (
                  workspaceOptions.map((ws) => (
                    <label
                      key={ws.id}
                      className="flex items-center justify-between px-3 py-1.5 hover:bg-default-50 cursor-pointer transition-colors"
                    >
                      <Checkbox
                        size="sm"
                        isSelected={workspaceFilter === ws.id}
                        onValueChange={(checked) => {
                          onWorkspaceFilterChange(new Set([checked ? ws.id : '__all__']));
                        }}
                        classNames={CHECKBOX_CLS}
                      >
                        <span className="text-sm">{ws.name}</span>
                      </Checkbox>
                      <span className="text-xs text-default-400 bg-default-100 px-1.5 py-0.5 rounded-full ml-2">
                        {ws.taskCount}
                      </span>
                    </label>
                  ))
                ) : (
                  <div className="px-3 py-2 text-xs text-default-400">No workspaces</div>
                )}
              </div>
            </CategoryRow>

            {/* Project */}
            <CategoryRow
              icon={Folder}
              label="Project"
              isActive={activeCategory === 'project'}
              hasFilter={!!projectFilter}
              onHover={() => setActiveCategory('project')}
            >
              <div className="flex flex-col py-1 w-[220px] max-h-[320px] overflow-y-auto">
                {projects.length > 0 ? (
                  projects.map((proj) => (
                    <label
                      key={proj.id}
                      className="flex items-center px-3 py-1.5 hover:bg-default-50 cursor-pointer transition-colors"
                    >
                      <Checkbox
                        size="sm"
                        isSelected={projectFilter === proj.id}
                        onValueChange={(checked) => {
                          onProjectFilterChange(checked ? proj.id : null);
                        }}
                        classNames={CHECKBOX_CLS}
                      >
                        <span className="flex items-center gap-2 text-sm">
                          <span
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: proj.color }}
                          />
                          {proj.name}
                        </span>
                      </Checkbox>
                    </label>
                  ))
                ) : (
                  <div className="px-3 py-2 text-xs text-default-400">No projects</div>
                )}
              </div>
            </CategoryRow>

            {/* Status */}
            <CategoryRow
              icon={CircleDot}
              label="Status"
              isActive={activeCategory === 'status'}
              hasFilter={!!statusFilter}
              onHover={() => setActiveCategory('status')}
            >
              <div className="flex flex-col py-1 w-[220px] max-h-[320px] overflow-y-auto">
                {taskStates.map((state) => (
                  <label
                    key={state.key}
                    className="flex items-center px-3 py-1.5 hover:bg-default-50 cursor-pointer transition-colors"
                  >
                    <Checkbox
                      size="sm"
                      isSelected={statusFilter === state.key}
                      onValueChange={(checked) => {
                        onStatusFilterChange(checked ? state.key : null);
                      }}
                      classNames={CHECKBOX_CLS}
                    >
                      <span className="flex items-center gap-2 text-sm">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{
                            backgroundColor: STATUS_COLOR_MAP[statusColors[state.key] ?? 'default'],
                          }}
                        />
                        {state.label}
                      </span>
                    </Checkbox>
                  </label>
                ))}
              </div>
            </CategoryRow>

            {/* Playbook */}
            <CategoryRow
              icon={BookOpen}
              label="Playbook"
              isActive={activeCategory === 'playbook'}
              hasFilter={!!playbookFilter}
              onHover={() => setActiveCategory('playbook')}
            >
              <div className="flex flex-col py-1 w-[220px] max-h-[320px] overflow-y-auto">
                {playbooks.length > 0 ? (
                  playbooks.map((pb) => (
                    <label
                      key={pb.id}
                      className="flex items-center px-3 py-1.5 hover:bg-default-50 cursor-pointer transition-colors"
                    >
                      <Checkbox
                        size="sm"
                        isSelected={playbookFilter === pb.id}
                        onValueChange={(checked) => {
                          onPlaybookFilterChange(checked ? pb.id : null);
                        }}
                        classNames={CHECKBOX_CLS}
                      >
                        <span className="text-sm">{pb.name}</span>
                      </Checkbox>
                    </label>
                  ))
                ) : (
                  <div className="px-3 py-2 text-xs text-default-400">No playbooks</div>
                )}
              </div>
            </CategoryRow>

            {/* Show Archived — inline checkbox, no sub-panel */}
            <label
              className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-default-50 cursor-pointer transition-colors"
              onMouseEnter={() => setActiveCategory(null)}
            >
              <Checkbox
                size="sm"
                isSelected={showArchived}
                onValueChange={onShowArchivedChange}
                classNames={CHECKBOX_CLS}
              >
                <span className="flex items-center gap-2 text-sm text-default-500">
                  <Archive className="w-4 h-4 flex-shrink-0" />
                  Show Archived
                </span>
              </Checkbox>
            </label>
          </div>
        </PopoverContent>
      </Popover>

      {/* Spacer */}
      <div className="flex-1" />

      {/* New Task Button */}
      <Button
        color="primary"
        size="sm"
        startContent={<Plus className="w-4 h-4" />}
        onPress={onCreateTask}
      >
        New Task
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Category row with hover-triggered sub-panel                        */
/* ------------------------------------------------------------------ */

function CategoryRow({
  icon: Icon,
  label,
  isActive,
  hasFilter,
  onHover,
  children,
}: {
  icon: typeof Folder;
  label: string;
  isActive: boolean;
  hasFilter: boolean;
  onHover: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative" onMouseEnter={onHover}>
      <div
        className={`flex items-center justify-between w-full px-2 py-1.5 text-sm text-left rounded-md transition-colors cursor-default ${
          isActive
            ? 'bg-default-100 text-foreground'
            : 'text-default-500 hover:bg-default-50 hover:text-foreground'
        }`}
      >
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 flex-shrink-0" />
          <span>{label}</span>
          {hasFilter && <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />}
        </div>
        <ChevronRight className="w-3.5 h-3.5 text-default-400" />
      </div>

      {isActive && (
        <div
          data-filter-cascade
          className="absolute right-full top-0 mr-1 z-50 rounded-lg border border-default-200 bg-content1 shadow-lg"
        >
          {children}
        </div>
      )}
    </div>
  );
}
