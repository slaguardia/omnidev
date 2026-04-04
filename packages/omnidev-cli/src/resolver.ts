/**
 * Task identifier resolver — accepts raw task IDs or RLP-N task numbers.
 * Resolves RLP-N to task ID via the API's taskNumber filter.
 */

import * as api from './api-client.js';
import { getConfig } from './config.js';

/**
 * Resolve a user-supplied task reference to a task ID.
 *
 * Accepts:
 * - ".", "@", or "@current" → uses `OMNIDEV_TASK_ID` (set by the worker for stage-token runs)
 * - "RLP-42" or "rlp-42" → looks up by task number 42
 * - "42" (pure number) → looks up by task number 42
 * - anything else → treated as a raw task ID
 */
export async function resolveTaskRef(ref: string): Promise<string> {
  const trimmed = ref.trim();
  if (trimmed === '.' || trimmed === '@' || trimmed === '@current') {
    const { taskId } = getConfig();
    if (!taskId) {
      throw new Error(
        'Reference "." requires OMNIDEV_TASK_ID (set when running under a stage token). Otherwise pass RLP-N or a task id.'
      );
    }
    return taskId;
  }

  // Check if it's a RLP-N reference
  const rlpMatch = trimmed.match(/^(?:rlp-)?(\d+)$/i);

  if (rlpMatch) {
    const taskNumber = parseInt(rlpMatch[1]!, 10);
    const result = await api.listTasks({ taskNumber: String(taskNumber) });
    const tasks = result.data.tasks;

    if (tasks.length === 0) {
      throw new Error(`No task found with number RLP-${taskNumber}`);
    }

    return tasks[0]!.id as string;
  }

  // Raw task ID
  return trimmed;
}
