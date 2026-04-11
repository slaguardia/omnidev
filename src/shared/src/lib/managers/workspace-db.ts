/**
 * Workspace Database — routes to PostgreSQL when DATABASE_URL is set, else SQLite (ralph.db).
 */

import { isPrismaConfigured } from '@/lib/db/prisma';
import type { Workspace, WorkspaceId } from '@/lib/types/index';
import * as pg from './workspace-db-pg';
import * as sqlite from './workspace-db-sqlite';

export async function dbInitWorkspaces(): Promise<void> {
  return isPrismaConfigured() ? pg.dbInitWorkspaces() : Promise.resolve(sqlite.dbInitWorkspaces());
}

export async function dbSaveWorkspace(ws: Workspace): Promise<void> {
  return isPrismaConfigured()
    ? pg.dbSaveWorkspace(ws)
    : Promise.resolve(sqlite.dbSaveWorkspace(ws));
}

export async function dbGetWorkspace(id: WorkspaceId): Promise<Workspace | null> {
  return isPrismaConfigured() ? pg.dbGetWorkspace(id) : Promise.resolve(sqlite.dbGetWorkspace(id));
}

export async function dbTouchWorkspace(id: WorkspaceId, ws: Workspace): Promise<void> {
  return isPrismaConfigured()
    ? pg.dbTouchWorkspace(id, ws)
    : Promise.resolve(sqlite.dbTouchWorkspace(id, ws));
}

export async function dbDeleteWorkspace(id: WorkspaceId): Promise<boolean> {
  return isPrismaConfigured()
    ? pg.dbDeleteWorkspace(id)
    : Promise.resolve(sqlite.dbDeleteWorkspace(id));
}

export async function dbWorkspaceExists(id: WorkspaceId): Promise<boolean> {
  return isPrismaConfigured()
    ? pg.dbWorkspaceExists(id)
    : Promise.resolve(sqlite.dbWorkspaceExists(id));
}

export async function dbGetAllWorkspaces(): Promise<Workspace[]> {
  return isPrismaConfigured()
    ? pg.dbGetAllWorkspaces()
    : Promise.resolve(sqlite.dbGetAllWorkspaces());
}
