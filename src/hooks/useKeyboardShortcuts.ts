'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { WorkflowDefinition } from '@/lib/types/index';
import { getNextStatus } from '@/components/dashboard/tabs/ralph/types';

interface UseKeyboardShortcutsOptions {
  visibleTaskIds: string[];
  taskStatusMap: Map<string, string>;
  definition: WorkflowDefinition;
  actions: {
    onExpandTask: (taskId: string) => void;
    onCreateTask: () => void;
    onArchiveTask: (taskId: string) => void;
    onTransitionTask: (taskId: string, toStatus: string) => void;
    onShowHelp: () => void;
    onFocusSearch: () => void;
  };
  state: {
    isAnyModalOpen: boolean;
    currentScreenType: 'board' | 'task-detail';
    currentSubTab: string;
  };
}

export function useKeyboardShortcuts({
  visibleTaskIds,
  taskStatusMap,
  definition,
  actions,
  state,
}: UseKeyboardShortcutsOptions) {
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);

  // Refs to avoid re-registering the listener on every render
  const focusedTaskIdRef = useRef<string | null>(null);
  const visibleTaskIdsRef = useRef<string[]>(visibleTaskIds);
  const taskStatusMapRef = useRef<Map<string, string>>(taskStatusMap);
  const definitionRef = useRef<WorkflowDefinition>(definition);
  const actionsRef = useRef(actions);
  const stateRef = useRef(state);

  // Keep refs in sync
  visibleTaskIdsRef.current = visibleTaskIds;
  taskStatusMapRef.current = taskStatusMap;
  definitionRef.current = definition;
  actionsRef.current = actions;
  stateRef.current = state;

  // Keep focusedTaskIdRef in sync with state
  const setFocusedTaskIdBoth = useCallback((id: string | null) => {
    focusedTaskIdRef.current = id;
    setFocusedTaskId(id);
  }, []);

  // Stale focus cleanup: if focusedTaskId not in visibleTaskIds, clear
  useEffect(() => {
    if (focusedTaskId && !visibleTaskIds.includes(focusedTaskId)) {
      setFocusedTaskIdBoth(null);
    }
  }, [focusedTaskId, visibleTaskIds, setFocusedTaskIdBoth]);

  // Scroll focused task into view
  useEffect(() => {
    if (!focusedTaskId) return;
    const el = document.querySelector(`[data-task-id="${focusedTaskId}"]`);
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [focusedTaskId]);

  // Register keydown handler once
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const { isAnyModalOpen, currentScreenType, currentSubTab } = stateRef.current;

      // Guard: don't fire when modal is open
      if (isAnyModalOpen) return;

      // Guard: only on board screen with board sub-tab
      if (currentScreenType !== 'board' || currentSubTab !== 'board') return;

      // Guard: don't fire when typing in an input
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }

      const ids = visibleTaskIdsRef.current;
      const currentId = focusedTaskIdRef.current;

      switch (e.key) {
        case 'j':
        case 'ArrowDown': {
          e.preventDefault();
          if (ids.length === 0) return;
          if (!currentId) {
            setFocusedTaskIdBoth(ids[0] ?? null);
          } else {
            const idx = ids.indexOf(currentId);
            if (idx < ids.length - 1) {
              setFocusedTaskIdBoth(ids[idx + 1] ?? null);
            }
          }
          break;
        }

        case 'k':
        case 'ArrowUp': {
          e.preventDefault();
          if (ids.length === 0) return;
          if (!currentId) {
            setFocusedTaskIdBoth(ids[ids.length - 1] ?? null);
          } else {
            const idx = ids.indexOf(currentId);
            if (idx > 0) {
              setFocusedTaskIdBoth(ids[idx - 1] ?? null);
            }
          }
          break;
        }

        case 'Enter':
        case 'o': {
          if (!currentId) return;
          actionsRef.current.onExpandTask(currentId);
          setFocusedTaskIdBoth(null);
          break;
        }

        case 'c': {
          actionsRef.current.onCreateTask();
          break;
        }

        case 's': {
          if (!currentId) return;
          const currentStatus = taskStatusMapRef.current.get(currentId);
          if (!currentStatus) return;
          const next = getNextStatus(currentStatus, definitionRef.current);
          if (next) {
            actionsRef.current.onTransitionTask(currentId, next);
          }
          break;
        }

        case 'Escape': {
          if (currentId) {
            setFocusedTaskIdBoth(null);
          }
          break;
        }

        case '#':
        case 'Delete': {
          if (!currentId) return;
          actionsRef.current.onArchiveTask(currentId);
          break;
        }

        case '?': {
          actionsRef.current.onShowHelp();
          break;
        }

        case '/': {
          e.preventDefault();
          actionsRef.current.onFocusSearch();
          break;
        }

        default:
          return;
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [setFocusedTaskIdBoth]);

  return { focusedTaskId, setFocusedTaskId: setFocusedTaskIdBoth };
}
