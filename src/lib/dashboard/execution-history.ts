'use server';

import { resolve } from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { ExecutionHistoryEntry } from './types';

const HISTORY_FILE = 'execution-history.json';
const MAX_HISTORY_ENTRIES = 100;

function getHistoryFilePath(): string {
  return resolve(process.cwd(), 'workspaces', HISTORY_FILE);
}

/**
 * Load execution history from file
 */
export async function loadExecutionHistory(): Promise<ExecutionHistoryEntry[]> {
  try {
    const filePath = getHistoryFilePath();
    if (!existsSync(filePath)) {
      return [];
    }
    const data = await readFile(filePath, 'utf-8');
    return JSON.parse(data) as ExecutionHistoryEntry[];
  } catch (error) {
    console.error('Failed to load execution history:', error);
    return [];
  }
}

/**
 * Save a new execution to history
 */
export async function saveExecutionToHistory(
  entry: Omit<ExecutionHistoryEntry, 'id' | 'executedAt'>
): Promise<{ success: boolean; message: string }> {
  try {
    const filePath = getHistoryFilePath();
    const dirPath = resolve(process.cwd(), 'workspaces');

    // Ensure workspaces directory exists
    if (!existsSync(dirPath)) {
      await mkdir(dirPath, { recursive: true });
    }

    // Load existing history
    const history = await loadExecutionHistory();

    // Create new entry with ID and timestamp
    const newEntry: ExecutionHistoryEntry = {
      ...entry,
      id: `exec-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      executedAt: new Date().toISOString(),
    };

    // Add to beginning of array (most recent first)
    history.unshift(newEntry);

    // Trim to max entries
    const trimmedHistory = history.slice(0, MAX_HISTORY_ENTRIES);

    // Save to file
    await writeFile(filePath, JSON.stringify(trimmedHistory, null, 2), 'utf-8');

    return { success: true, message: 'Execution saved to history' };
  } catch (error) {
    console.error('Failed to save execution to history:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to save execution',
    };
  }
}

/**
 * Clear all execution history
 */
export async function clearExecutionHistory(): Promise<{ success: boolean; message: string }> {
  try {
    const filePath = getHistoryFilePath();
    await writeFile(filePath, '[]', 'utf-8');
    return { success: true, message: 'Execution history cleared' };
  } catch (error) {
    console.error('Failed to clear execution history:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to clear history',
    };
  }
}

/**
 * Delete a specific execution from history
 */
export async function deleteExecutionFromHistory(
  executionId: string
): Promise<{ success: boolean; message: string }> {
  try {
    const filePath = getHistoryFilePath();
    const history = await loadExecutionHistory();
    const filtered = history.filter((entry) => entry.id !== executionId);

    if (filtered.length === history.length) {
      return { success: false, message: 'Execution not found' };
    }

    await writeFile(filePath, JSON.stringify(filtered, null, 2), 'utf-8');
    return { success: true, message: 'Execution deleted' };
  } catch (error) {
    console.error('Failed to delete execution from history:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to delete execution',
    };
  }
}
