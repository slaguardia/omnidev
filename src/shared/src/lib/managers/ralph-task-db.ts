/**
 * Ralph Task Database — routes to PostgreSQL (Prisma) when DATABASE_URL is set,
 * otherwise SQLite (better-sqlite3). Public API is async.
 */

import type Database from 'better-sqlite3';
import { isPrismaConfigured } from '@/lib/db/prisma';
import type { RalphTask, RalphTaskIndexEntry } from './ralph-task-manager';
import * as pg from './ralph-task-db-pg';
import * as sqlite from './ralph-task-db-sqlite';

export type {
  DbPlaybook,
  DbProject,
  DbStageToken,
  ListAgentEventsOptions,
  RalphAgentEvent,
  RalphAgentRun,
  RalphAgentRunSummaryUpdate,
  RalphJob,
  RalphJobStatus,
  StreamAgentEventsOptions,
  WorkerHealth,
} from './ralph-task-db-sqlite';

export function getDb(): Database.Database {
  if (isPrismaConfigured()) {
    throw new Error(
      '[ralph-task-db] getDb() is SQLite-only; DATABASE_URL is set — use Prisma data access instead.'
    );
  }
  return sqlite.getDb();
}

export async function dbNextTaskNumber(): Promise<number> {
  return isPrismaConfigured() ? pg.dbNextTaskNumber() : Promise.resolve(sqlite.dbNextTaskNumber());
}

export async function dbInsertTask(task: RalphTask): Promise<void> {
  return isPrismaConfigured() ? pg.dbInsertTask(task) : Promise.resolve(sqlite.dbInsertTask(task));
}

export async function dbGetTask(id: string): Promise<RalphTask | null> {
  return isPrismaConfigured() ? pg.dbGetTask(id) : Promise.resolve(sqlite.dbGetTask(id));
}

export async function dbUpdateTask(task: RalphTask): Promise<void> {
  return isPrismaConfigured() ? pg.dbUpdateTask(task) : Promise.resolve(sqlite.dbUpdateTask(task));
}

export async function dbDeleteTask(id: string): Promise<boolean> {
  return isPrismaConfigured() ? pg.dbDeleteTask(id) : Promise.resolve(sqlite.dbDeleteTask(id));
}

export async function dbTaskExists(id: string): Promise<boolean> {
  return isPrismaConfigured() ? pg.dbTaskExists(id) : Promise.resolve(sqlite.dbTaskExists(id));
}

export async function dbGetTaskStatus(id: string): Promise<string | null> {
  return isPrismaConfigured()
    ? pg.dbGetTaskStatus(id)
    : Promise.resolve(sqlite.dbGetTaskStatus(id));
}

export async function dbGetBoardTasks(options: {
  includeArchived?: boolean;
  archivedOnly?: boolean;
}): Promise<RalphTask[]> {
  return isPrismaConfigured()
    ? pg.dbGetBoardTasks(options)
    : Promise.resolve(sqlite.dbGetBoardTasks(options));
}

export async function dbGetAllIndexEntries(): Promise<RalphTaskIndexEntry[]> {
  return isPrismaConfigured()
    ? pg.dbGetAllIndexEntries()
    : Promise.resolve(sqlite.dbGetAllIndexEntries());
}

export async function dbGetChildStats(parentId: string): Promise<{
  total: number;
  executing_count: number;
  completed_count: number;
  ready_count: number;
  pending_count: number;
}> {
  return isPrismaConfigured()
    ? pg.dbGetChildStats(parentId)
    : Promise.resolve(sqlite.dbGetChildStats(parentId));
}

export async function dbGetChildCount(parentId: string): Promise<number> {
  return isPrismaConfigured()
    ? pg.dbGetChildCount(parentId)
    : Promise.resolve(sqlite.dbGetChildCount(parentId));
}

export async function dbGetChildTasks(parentId: string): Promise<RalphTask[]> {
  return isPrismaConfigured()
    ? pg.dbGetChildTasks(parentId)
    : Promise.resolve(sqlite.dbGetChildTasks(parentId));
}

export async function dbDeleteByWorkspace(workspaceId: string): Promise<number> {
  return isPrismaConfigured()
    ? pg.dbDeleteByWorkspace(workspaceId)
    : Promise.resolve(sqlite.dbDeleteByWorkspace(workspaceId));
}

export async function dbTransaction<T>(fn: () => Promise<T>): Promise<T> {
  if (isPrismaConfigured()) {
    return pg.dbTransaction(fn);
  }
  return fn();
}

export async function dbCreateProject(
  project: import('./ralph-task-db-sqlite').DbProject
): Promise<void> {
  return isPrismaConfigured()
    ? pg.dbCreateProject(project)
    : Promise.resolve(sqlite.dbCreateProject(project));
}

export async function dbListProjects(): Promise<import('./ralph-task-db-sqlite').DbProject[]> {
  return isPrismaConfigured() ? pg.dbListProjects() : Promise.resolve(sqlite.dbListProjects());
}

export async function dbGetProject(
  id: string
): Promise<import('./ralph-task-db-sqlite').DbProject | null> {
  return isPrismaConfigured() ? pg.dbGetProject(id) : Promise.resolve(sqlite.dbGetProject(id));
}

export async function dbUpdateProject(
  id: string,
  updates: { name?: string; color?: string }
): Promise<boolean> {
  return isPrismaConfigured()
    ? pg.dbUpdateProject(id, updates)
    : Promise.resolve(sqlite.dbUpdateProject(id, updates));
}

export async function dbDeleteProject(id: string): Promise<boolean> {
  return isPrismaConfigured()
    ? pg.dbDeleteProject(id)
    : Promise.resolve(sqlite.dbDeleteProject(id));
}

export async function dbCreatePlaybook(
  playbook: import('./ralph-task-db-sqlite').DbPlaybook
): Promise<void> {
  return isPrismaConfigured()
    ? pg.dbCreatePlaybook(playbook)
    : Promise.resolve(sqlite.dbCreatePlaybook(playbook));
}

export async function dbListPlaybooks(): Promise<import('./ralph-task-db-sqlite').DbPlaybook[]> {
  return isPrismaConfigured() ? pg.dbListPlaybooks() : Promise.resolve(sqlite.dbListPlaybooks());
}

export async function dbGetPlaybook(
  id: string
): Promise<import('./ralph-task-db-sqlite').DbPlaybook | null> {
  return isPrismaConfigured() ? pg.dbGetPlaybook(id) : Promise.resolve(sqlite.dbGetPlaybook(id));
}

export async function dbUpdatePlaybook(
  id: string,
  updates: {
    name?: string;
    description?: string;
    stage_ids?: string;
    prompt_overrides?: string;
    is_default?: number;
  }
): Promise<boolean> {
  return isPrismaConfigured()
    ? pg.dbUpdatePlaybook(id, updates)
    : Promise.resolve(sqlite.dbUpdatePlaybook(id, updates));
}

export async function dbDeletePlaybook(id: string): Promise<boolean> {
  return isPrismaConfigured()
    ? pg.dbDeletePlaybook(id)
    : Promise.resolve(sqlite.dbDeletePlaybook(id));
}

export async function dbCreateJob(job: import('./ralph-task-db-sqlite').RalphJob): Promise<void> {
  return isPrismaConfigured() ? pg.dbCreateJob(job) : Promise.resolve(sqlite.dbCreateJob(job));
}

export async function dbGetJob(
  id: string
): Promise<import('./ralph-task-db-sqlite').RalphJob | null> {
  return isPrismaConfigured() ? pg.dbGetJob(id) : Promise.resolve(sqlite.dbGetJob(id));
}

export async function dbClaimNextPendingJob(): Promise<
  import('./ralph-task-db-sqlite').RalphJob | null
> {
  return isPrismaConfigured()
    ? pg.dbClaimNextPendingJob()
    : Promise.resolve(sqlite.dbClaimNextPendingJob());
}

export async function dbUpdateJob(
  id: string,
  updates: Partial<Pick<import('./ralph-task-db-sqlite').RalphJob, 'status' | 'result' | 'error'>>
): Promise<boolean> {
  return isPrismaConfigured()
    ? pg.dbUpdateJob(id, updates)
    : Promise.resolve(sqlite.dbUpdateJob(id, updates));
}

export async function dbListJobs(filters?: {
  task_id?: string;
}): Promise<import('./ralph-task-db-sqlite').RalphJob[]> {
  return isPrismaConfigured()
    ? pg.dbListJobs(filters)
    : Promise.resolve(sqlite.dbListJobs(filters));
}

export async function dbHeartbeatJob(jobId: string): Promise<boolean> {
  return isPrismaConfigured()
    ? pg.dbHeartbeatJob(jobId)
    : Promise.resolve(sqlite.dbHeartbeatJob(jobId));
}

export async function dbRequeueJob(jobId: string): Promise<boolean> {
  return isPrismaConfigured()
    ? pg.dbRequeueJob(jobId)
    : Promise.resolve(sqlite.dbRequeueJob(jobId));
}

export async function dbRecoverStaleJobs(cutoffIso: string): Promise<number> {
  return isPrismaConfigured()
    ? pg.dbRecoverStaleJobs(cutoffIso)
    : Promise.resolve(sqlite.dbRecoverStaleJobs(cutoffIso));
}

export async function dbGetWorkerHealth(): Promise<import('./ralph-task-db-sqlite').WorkerHealth> {
  return isPrismaConfigured()
    ? pg.dbGetWorkerHealth()
    : Promise.resolve(sqlite.dbGetWorkerHealth());
}

export async function dbCreateAgentRun(
  run: import('./ralph-task-db-sqlite').RalphAgentRun
): Promise<void> {
  return isPrismaConfigured()
    ? pg.dbCreateAgentRun(run)
    : Promise.resolve(sqlite.dbCreateAgentRun(run));
}

export async function dbUpdateAgentRun(
  id: string,
  updates: Partial<
    Pick<import('./ralph-task-db-sqlite').RalphAgentRun, 'status' | 'logs' | 'completed_at'>
  >
): Promise<boolean> {
  return isPrismaConfigured()
    ? pg.dbUpdateAgentRun(id, updates)
    : Promise.resolve(sqlite.dbUpdateAgentRun(id, updates));
}

export async function dbGetAgentRunsByJob(
  jobId: string
): Promise<import('./ralph-task-db-sqlite').RalphAgentRun[]> {
  return isPrismaConfigured()
    ? pg.dbGetAgentRunsByJob(jobId)
    : Promise.resolve(sqlite.dbGetAgentRunsByJob(jobId));
}

export async function dbUpdateAgentRunSummary(
  id: string,
  updates: import('./ralph-task-db-sqlite').RalphAgentRunSummaryUpdate
): Promise<boolean> {
  return isPrismaConfigured()
    ? pg.dbUpdateAgentRunSummary(id, updates)
    : Promise.resolve(sqlite.dbUpdateAgentRunSummary(id, updates));
}

export async function dbAppendAgentEvent(
  event: import('./ralph-task-db-sqlite').RalphAgentEvent
): Promise<void> {
  return isPrismaConfigured()
    ? pg.dbAppendAgentEvent(event)
    : Promise.resolve(sqlite.dbAppendAgentEvent(event));
}

export async function dbListAgentEvents(
  runId: string,
  options?: import('./ralph-task-db-sqlite').ListAgentEventsOptions
): Promise<import('./ralph-task-db-sqlite').RalphAgentEvent[]> {
  return isPrismaConfigured()
    ? pg.dbListAgentEvents(runId, options)
    : Promise.resolve(sqlite.dbListAgentEvents(runId, options));
}

/**
 * Stream events for a run (backfill + live tail). Routes to the configured
 * backend's polling generator. The sub-task 8 SSE endpoint consumes this.
 */
export function dbStreamAgentEvents(
  runId: string,
  options?: import('./ralph-task-db-sqlite').StreamAgentEventsOptions
): AsyncGenerator<import('./ralph-task-db-sqlite').RalphAgentEvent, void, undefined> {
  return isPrismaConfigured()
    ? pg.dbStreamAgentEvents(runId, options)
    : sqlite.dbStreamAgentEvents(runId, options);
}

export async function dbInsertStageToken(
  token: Omit<import('./ralph-task-db-sqlite').DbStageToken, 'revoked' | 'revoked_at'>
): Promise<void> {
  return isPrismaConfigured()
    ? pg.dbInsertStageToken(token)
    : Promise.resolve(sqlite.dbInsertStageToken(token));
}

export async function dbGetStageTokenByHash(
  tokenHash: string
): Promise<import('./ralph-task-db-sqlite').DbStageToken | null> {
  return isPrismaConfigured()
    ? pg.dbGetStageTokenByHash(tokenHash)
    : Promise.resolve(sqlite.dbGetStageTokenByHash(tokenHash));
}

export async function dbRevokeTokensByJob(jobId: string): Promise<number> {
  return isPrismaConfigured()
    ? pg.dbRevokeTokensByJob(jobId)
    : Promise.resolve(sqlite.dbRevokeTokensByJob(jobId));
}

export async function dbRevokeExpiredTokens(): Promise<number> {
  return isPrismaConfigured()
    ? pg.dbRevokeExpiredTokens()
    : Promise.resolve(sqlite.dbRevokeExpiredTokens());
}

export async function dbClose(): Promise<void> {
  if (isPrismaConfigured()) {
    return pg.dbClose();
  }
  sqlite.dbClose();
}
