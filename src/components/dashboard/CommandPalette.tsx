'use client';

import React, { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import { Kbd } from '@heroui/kbd';
import { Chip } from '@heroui/chip';
import {
  Zap,
  MessageSquare,
  Bot,
  Clock,
  FolderOpen,
  GitBranch,
  Settings,
  Lock,
  Plus,
  Archive,
  Search,
  FileText,
  Folder,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useRalphTasks } from '@/hooks/queries/useRalphTasks';
import { useRalphWorkspaces } from '@/hooks/queries/useRalphWorkspaces';
import { useRalphProjects } from '@/hooks/queries/useRalphProjects';
import { formatTaskNumber } from '@/components/dashboard/tabs/ralph/types';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

interface NavItem {
  key: string;
  title: string;
  icon: LucideIcon;
}

const navItems: NavItem[] = [
  { key: 'ralph-board', title: 'Ralph Board', icon: Zap },
  { key: 'chat', title: 'Chat', icon: MessageSquare },
  { key: 'operations', title: 'Operations', icon: Bot },
  { key: 'external-tasking', title: 'External Tasking', icon: Clock },
  { key: 'workspaces', title: 'Workspaces', icon: FolderOpen },
  { key: 'git-source', title: 'Git Source Config', icon: GitBranch },
  { key: 'settings', title: 'Environment Settings', icon: Settings },
  { key: 'security', title: 'Account Security', icon: Lock },
];

export default function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: tasks = [] } = useRalphTasks();
  const { data: workspaces = [] } = useRalphWorkspaces({ includeBranches: false });
  const { data: projects = [] } = useRalphProjects();

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const selectAndClose = (fn: () => void) => {
    fn();
    onClose();
  };

  const navigateTo = (tab: string) => router.push(`/dashboard/${tab}`);
  const navigateToTask = (taskId: string) => router.push(`/dashboard/ralph-board/task/${taskId}`);

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative flex justify-center px-4" style={{ paddingTop: '20vh' }}>
        <div className="w-full max-w-xl rounded-lg shadow-lg border dark:border-white/[0.06] border-gray-200 dark:bg-[#1C1C20] bg-white overflow-hidden">
          <Command label="Command Palette" shouldFilter={true}>
            {/* Search input */}
            <div className="flex items-center gap-3 px-4 border-b dark:border-white/[0.06] border-gray-200">
              <Search className="w-4 h-4 text-default-400 shrink-0" />
              <Command.Input
                ref={inputRef}
                placeholder="Type a command or search..."
                className="flex-1 h-12 bg-transparent text-sm outline-none placeholder:text-default-400"
              />
            </div>

            {/* Results */}
            <Command.List className="max-h-80 overflow-y-auto py-2">
              <Command.Empty className="px-4 py-8 text-center text-sm text-default-400">
                No results found.
              </Command.Empty>

              {/* Actions */}
              <Command.Group
                heading="Actions"
                className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-default-500 [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
              >
                <Command.Item
                  value="action: Create Task"
                  onSelect={() =>
                    selectAndClose(() => {
                      navigateTo('ralph-board');
                      window.dispatchEvent(new CustomEvent('ralph:openCreateModal'));
                    })
                  }
                  className="flex items-center gap-3 px-3 py-2 mx-2 rounded-lg cursor-pointer text-sm transition-colors data-[selected=true]:bg-primary/10 data-[selected=true]:text-primary hover:bg-default-100"
                >
                  <Plus className="w-4 h-4 text-default-400 shrink-0" />
                  <span className="flex-1">Create Task</span>
                  <Kbd>C</Kbd>
                </Command.Item>
                <Command.Item
                  value="action: Toggle Archive View"
                  onSelect={() =>
                    selectAndClose(() => {
                      navigateTo('ralph-board');
                      window.dispatchEvent(new CustomEvent('ralph:toggleArchived'));
                    })
                  }
                  className="flex items-center gap-3 px-3 py-2 mx-2 rounded-lg cursor-pointer text-sm transition-colors data-[selected=true]:bg-primary/10 data-[selected=true]:text-primary hover:bg-default-100"
                >
                  <Archive className="w-4 h-4 text-default-400 shrink-0" />
                  <span className="flex-1">Toggle Archive View</span>
                </Command.Item>
              </Command.Group>

              {/* Navigate */}
              <Command.Group
                heading="Navigate"
                className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-default-500 [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
              >
                {navItems.map((item) => (
                  <Command.Item
                    key={item.key}
                    value={`navigate: ${item.title}`}
                    onSelect={() => selectAndClose(() => navigateTo(item.key))}
                    className="flex items-center gap-3 px-3 py-2 mx-2 rounded-lg cursor-pointer text-sm transition-colors data-[selected=true]:bg-primary/10 data-[selected=true]:text-primary hover:bg-default-100"
                  >
                    <item.icon className="w-4 h-4 text-default-400 shrink-0" />
                    <span className="flex-1">{item.title}</span>
                  </Command.Item>
                ))}
              </Command.Group>

              {/* Tasks */}
              {tasks.length > 0 && (
                <Command.Group
                  heading="Tasks"
                  className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-default-500 [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
                >
                  {tasks.map((task) => {
                    const taskNum = formatTaskNumber(task.taskNumber);
                    return (
                      <Command.Item
                        key={task.id}
                        value={`task: ${taskNum ?? ''} ${task.title} ${task.workspaceName}`}
                        onSelect={() => selectAndClose(() => navigateToTask(task.id))}
                        className="flex items-center gap-3 px-3 py-2 mx-2 rounded-lg cursor-pointer text-sm transition-colors data-[selected=true]:bg-primary/10 data-[selected=true]:text-primary hover:bg-default-100"
                      >
                        <FileText className="w-4 h-4 text-default-400 shrink-0" />
                        <div className="flex-1 min-w-0 flex items-center gap-2">
                          {taskNum && (
                            <span className="text-xs text-default-400 font-mono shrink-0">
                              {taskNum}
                            </span>
                          )}
                          <span className="truncate">{task.title}</span>
                        </div>
                        <Chip size="sm" variant="flat" className="shrink-0">
                          {task.status}
                        </Chip>
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              )}

              {/* Workspaces */}
              {workspaces.length > 0 && (
                <Command.Group
                  heading="Workspaces"
                  className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-default-500 [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
                >
                  {workspaces.map((ws) => (
                    <Command.Item
                      key={ws.id}
                      value={`workspace: ${ws.name} ${ws.repoUrl}`}
                      onSelect={() => selectAndClose(() => navigateTo('workspaces'))}
                      className="flex items-center gap-3 px-3 py-2 mx-2 rounded-lg cursor-pointer text-sm transition-colors data-[selected=true]:bg-primary/10 data-[selected=true]:text-primary hover:bg-default-100"
                    >
                      <FolderOpen className="w-4 h-4 text-default-400 shrink-0" />
                      <span className="flex-1 truncate">{ws.name}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              {/* Projects */}
              {projects.length > 0 && (
                <Command.Group
                  heading="Projects"
                  className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-default-500 [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
                >
                  {projects.map((project) => (
                    <Command.Item
                      key={project.id}
                      value={`project: ${project.name}`}
                      onSelect={() => selectAndClose(() => navigateTo('ralph-board'))}
                      className="flex items-center gap-3 px-3 py-2 mx-2 rounded-lg cursor-pointer text-sm transition-colors data-[selected=true]:bg-primary/10 data-[selected=true]:text-primary hover:bg-default-100"
                    >
                      <Folder className="w-4 h-4 shrink-0" style={{ color: project.color }} />
                      <span className="flex-1 truncate">{project.name}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
            </Command.List>

            {/* Footer */}
            <div className="flex items-center gap-4 px-4 py-2 border-t dark:border-white/[0.06] border-gray-200 text-xs text-default-400">
              <span className="flex items-center gap-1">
                <Kbd>↑↓</Kbd> navigate
              </span>
              <span className="flex items-center gap-1">
                <Kbd>↵</Kbd> select
              </span>
              <span className="flex items-center gap-1">
                <Kbd>Esc</Kbd> close
              </span>
            </div>
          </Command>
        </div>
      </div>
    </div>
  );
}
