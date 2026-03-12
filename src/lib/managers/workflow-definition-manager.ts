'use server';

/**
 * Workflow Definition Manager
 * Manages the persisted workflow definition separately from app config.
 * Stored at data/workflow-definition.json.
 */

import { readFile, writeFile, access, mkdir, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { getDataDir } from '@/lib/config/server-actions';
import { DEFAULT_WORKFLOW_DEFINITION, WorkflowDefinitionSchema } from '@/lib/workflow/definition';
import type { Result, WorkflowDefinition } from '@/lib/types/index';

const DEFINITION_FILENAME = 'workflow-definition.json';

/**
 * Get the path to the workflow definition file
 */
async function getDefinitionPath(): Promise<string> {
  const dataDir = await getDataDir();
  return join(dataDir, DEFINITION_FILENAME);
}

/**
 * One-time migration: if workflow-definition.json doesn't exist but
 * app-config.json has workflow.definition, copy it to the new file.
 */
async function migrateFromAppConfig(definitionPath: string): Promise<WorkflowDefinition | null> {
  try {
    const dataDir = dirname(definitionPath);
    const appConfigPath = join(dataDir, 'app-config.json');

    if (!existsSync(appConfigPath)) return null;

    const raw = readFileSync(appConfigPath, 'utf-8');
    const appConfig = JSON.parse(raw) as { workflow?: { definition?: unknown } };

    if (!appConfig.workflow?.definition) return null;

    const parseResult = WorkflowDefinitionSchema.safeParse(appConfig.workflow.definition);
    if (!parseResult.success) {
      console.warn(
        '[WORKFLOW DEFINITION MANAGER] Migration: invalid definition in app-config, using default:',
        parseResult.error.message
      );
      return null;
    }

    // Write migrated definition to new file
    const dir = dirname(definitionPath);
    await mkdir(dir, { recursive: true });
    await writeFile(definitionPath, JSON.stringify(parseResult.data, null, 2), 'utf-8');
    console.log('[WORKFLOW DEFINITION MANAGER] Migrated workflow definition from app-config.json');

    return parseResult.data;
  } catch (error) {
    console.warn('[WORKFLOW DEFINITION MANAGER] Migration failed:', error);
    return null;
  }
}

/**
 * Load workflow definition from disk, falling back to defaults.
 * On first call, attempts migration from app-config.json.
 */
export async function loadWorkflowDefinition(): Promise<Result<WorkflowDefinition>> {
  try {
    const definitionPath = await getDefinitionPath();

    // Check if file exists
    try {
      await access(definitionPath);
    } catch {
      // File doesn't exist — try migration
      const migrated = await migrateFromAppConfig(definitionPath);
      if (migrated) {
        return { success: true, data: migrated };
      }
      return { success: true, data: DEFAULT_WORKFLOW_DEFINITION };
    }

    const data = await readFile(definitionPath, 'utf-8');
    const parsed = JSON.parse(data) as unknown;
    const result = WorkflowDefinitionSchema.safeParse(parsed);

    if (!result.success) {
      console.warn(
        '[WORKFLOW DEFINITION MANAGER] Invalid definition on disk, using default:',
        result.error.message
      );
      return { success: true, data: DEFAULT_WORKFLOW_DEFINITION };
    }

    return { success: true, data: result.data };
  } catch (error) {
    console.error('[WORKFLOW DEFINITION MANAGER] Failed to load:', error);
    return {
      success: false,
      error: new Error(`Failed to load workflow definition: ${error}`),
    };
  }
}

/**
 * Save workflow definition to disk.
 */
export async function saveWorkflowDefinition(
  definition: WorkflowDefinition
): Promise<Result<void>> {
  try {
    const parseResult = WorkflowDefinitionSchema.safeParse(definition);
    if (!parseResult.success) {
      return {
        success: false,
        error: new Error(`Invalid workflow definition: ${parseResult.error.message}`),
      };
    }

    const definitionPath = await getDefinitionPath();
    const dir = dirname(definitionPath);
    await mkdir(dir, { recursive: true });
    await writeFile(definitionPath, JSON.stringify(parseResult.data, null, 2), 'utf-8');

    console.log('[WORKFLOW DEFINITION MANAGER] Saved workflow definition');
    return { success: true, data: undefined };
  } catch (error) {
    console.error('[WORKFLOW DEFINITION MANAGER] Failed to save:', error);
    return {
      success: false,
      error: new Error(`Failed to save workflow definition: ${error}`),
    };
  }
}

/**
 * Delete the workflow definition file, resetting to defaults.
 */
export async function deleteWorkflowDefinition(): Promise<Result<void>> {
  try {
    const definitionPath = await getDefinitionPath();

    try {
      await access(definitionPath);
      await unlink(definitionPath);
      console.log('[WORKFLOW DEFINITION MANAGER] Deleted workflow definition (reset to defaults)');
    } catch {
      // File doesn't exist — already at defaults
    }

    return { success: true, data: undefined };
  } catch (error) {
    console.error('[WORKFLOW DEFINITION MANAGER] Failed to delete:', error);
    return {
      success: false,
      error: new Error(`Failed to delete workflow definition: ${error}`),
    };
  }
}
