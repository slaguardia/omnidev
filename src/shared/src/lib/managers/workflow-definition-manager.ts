'use server';

/**
 * Workflow Definition Manager
 * Persists the Ralph workflow definition:
 * - PostgreSQL `ralph_meta` when DATABASE_URL is set
 * - Else `data/workflow-definition.json` (local / SQLite deployments)
 */

import { readFile, writeFile, access, mkdir, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { getDataDir } from '@/lib/config/server-actions';
import { isPrismaConfigured } from '@/lib/db/prisma';
import {
  deleteRalphMetaKey,
  getRalphMetaValue,
  RALPH_META_KEYS,
  setRalphMetaValue,
} from '@/lib/db/ralph-meta-store';
import { DEFAULT_WORKFLOW_DEFINITION, WorkflowDefinitionSchema } from '@/lib/workflow/definition';
import type { Result, WorkflowDefinition } from '@/lib/types/index';

const DEFINITION_FILENAME = 'workflow-definition.json';

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

async function loadFromPostgres(): Promise<WorkflowDefinition | null> {
  if (!isPrismaConfigured()) return null;
  const raw = await getRalphMetaValue(RALPH_META_KEYS.WORKFLOW_DEFINITION);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    const result = WorkflowDefinitionSchema.safeParse(parsed);
    if (!result.success) {
      console.warn(
        '[WORKFLOW DEFINITION MANAGER] Invalid definition in Postgres, ignoring:',
        result.error.message
      );
      return null;
    }
    return result.data;
  } catch (e) {
    console.warn('[WORKFLOW DEFINITION MANAGER] Failed to parse Postgres value:', e);
    return null;
  }
}

async function migrateFileToPostgres(): Promise<WorkflowDefinition | null> {
  if (!isPrismaConfigured()) return null;
  const definitionPath = await getDefinitionPath();
  try {
    await access(definitionPath);
  } catch {
    return null;
  }
  try {
    const data = await readFile(definitionPath, 'utf-8');
    const parsed = JSON.parse(data) as unknown;
    const result = WorkflowDefinitionSchema.safeParse(parsed);
    if (!result.success) return null;
    await setRalphMetaValue(RALPH_META_KEYS.WORKFLOW_DEFINITION, JSON.stringify(result.data));
    console.log('[WORKFLOW DEFINITION MANAGER] Migrated workflow definition from file to Postgres');
    return result.data;
  } catch (e) {
    console.warn('[WORKFLOW DEFINITION MANAGER] File→Postgres migration failed:', e);
    return null;
  }
}

export async function loadWorkflowDefinition(): Promise<Result<WorkflowDefinition>> {
  try {
    if (isPrismaConfigured()) {
      const fromPg = await loadFromPostgres();
      if (fromPg) {
        return { success: true, data: fromPg };
      }

      const fromFileMigration = await migrateFileToPostgres();
      if (fromFileMigration) {
        return { success: true, data: fromFileMigration };
      }

      const definitionPath = await getDefinitionPath();
      try {
        await access(definitionPath);
      } catch {
        const migrated = await migrateFromAppConfig(definitionPath);
        if (migrated) {
          await setRalphMetaValue(RALPH_META_KEYS.WORKFLOW_DEFINITION, JSON.stringify(migrated));
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
      await setRalphMetaValue(RALPH_META_KEYS.WORKFLOW_DEFINITION, JSON.stringify(result.data));
      console.log(
        '[WORKFLOW DEFINITION MANAGER] Migrated existing workflow-definition.json to Postgres'
      );
      return { success: true, data: result.data };
    }

    const definitionPath = await getDefinitionPath();
    try {
      await access(definitionPath);
    } catch {
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

    if (isPrismaConfigured()) {
      await setRalphMetaValue(
        RALPH_META_KEYS.WORKFLOW_DEFINITION,
        JSON.stringify(parseResult.data)
      );
      console.log('[WORKFLOW DEFINITION MANAGER] Saved workflow definition to Postgres');
      return { success: true, data: undefined };
    }

    const definitionPath = await getDefinitionPath();
    const dir = dirname(definitionPath);
    await mkdir(dir, { recursive: true });
    await writeFile(definitionPath, JSON.stringify(parseResult.data, null, 2), 'utf-8');

    console.log('[WORKFLOW DEFINITION MANAGER] Saved workflow definition to file');
    return { success: true, data: undefined };
  } catch (error) {
    console.error('[WORKFLOW DEFINITION MANAGER] Failed to save:', error);
    return {
      success: false,
      error: new Error(`Failed to save workflow definition: ${error}`),
    };
  }
}

export async function deleteWorkflowDefinition(): Promise<Result<void>> {
  try {
    if (isPrismaConfigured()) {
      await deleteRalphMetaKey(RALPH_META_KEYS.WORKFLOW_DEFINITION);
      console.log('[WORKFLOW DEFINITION MANAGER] Deleted workflow definition from Postgres');
    }

    const definitionPath = await getDefinitionPath();
    try {
      await access(definitionPath);
      await unlink(definitionPath);
      console.log('[WORKFLOW DEFINITION MANAGER] Deleted workflow definition file');
    } catch {
      // no file
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
