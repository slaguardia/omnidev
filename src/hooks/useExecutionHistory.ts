import { useState, useEffect, useCallback } from 'react';
import { ExecutionHistoryEntry } from '@/lib/dashboard/types';
import {
  loadExecutionHistory,
  saveExecutionToHistory,
  clearExecutionHistory,
  deleteExecutionFromHistory,
} from '@/lib/dashboard/execution-history';

export const useExecutionHistory = () => {
  const [history, setHistory] = useState<ExecutionHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const loadHistory = useCallback(async () => {
    try {
      setLoading(true);
      const data = await loadExecutionHistory();
      setHistory(data);
    } catch (error) {
      console.error('Failed to load execution history:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const addExecution = useCallback(
    async (entry: Omit<ExecutionHistoryEntry, 'id' | 'executedAt'>) => {
      const result = await saveExecutionToHistory(entry);
      if (result.success) {
        await loadHistory();
      }
      return result;
    },
    [loadHistory]
  );

  const deleteExecution = useCallback(
    async (executionId: string) => {
      const result = await deleteExecutionFromHistory(executionId);
      if (result.success) {
        await loadHistory();
      }
      return result;
    },
    [loadHistory]
  );

  const clearHistory = useCallback(async () => {
    const result = await clearExecutionHistory();
    if (result.success) {
      setHistory([]);
    }
    return result;
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  return {
    history,
    loading,
    loadHistory,
    addExecution,
    deleteExecution,
    clearHistory,
  };
};
