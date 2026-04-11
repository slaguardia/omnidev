/**
 * Workspace index — PostgreSQL via Prisma.
 */

import { prisma } from '@/lib/db/prisma';
import type { Workspace, WorkspaceId, FilePath } from '@/lib/types/index';

interface DataRow {
  data: string;
}

function workspaceParams(ws: Workspace) {
  return {
    id: ws.id,
    path: ws.path ?? null,
    repoUrl: ws.repoUrl,
    targetBranch: ws.targetBranch,
    provider: ws.provider ?? null,
    createdAt: ws.createdAt instanceof Date ? ws.createdAt.toISOString() : String(ws.createdAt),
    lastAccessed:
      ws.lastAccessed instanceof Date ? ws.lastAccessed.toISOString() : String(ws.lastAccessed),
    data: JSON.stringify(ws, (_key, value) => {
      if (value instanceof Date) return value.toISOString();
      return value;
    }),
  };
}

function parseWorkspace(row: DataRow): Workspace {
  const raw = JSON.parse(row.data) as Record<string, unknown>;
  const pathRaw = raw.path;
  const path =
    pathRaw && typeof pathRaw === 'string' && pathRaw.length > 0
      ? (pathRaw as FilePath)
      : undefined;
  return {
    ...raw,
    path,
    createdAt: new Date(raw.createdAt as string),
    lastAccessed: new Date(raw.lastAccessed as string),
  } as Workspace;
}

export async function dbInitWorkspaces(): Promise<void> {
  await prisma.$connect();
}

export async function dbSaveWorkspace(ws: Workspace): Promise<void> {
  const p = workspaceParams(ws);
  await prisma.workspace.upsert({
    where: { id: p.id },
    create: {
      id: p.id,
      path: p.path,
      repoUrl: p.repoUrl,
      targetBranch: p.targetBranch,
      provider: p.provider,
      createdAt: p.createdAt,
      lastAccessed: p.lastAccessed,
      data: p.data,
    },
    update: {
      path: p.path,
      repoUrl: p.repoUrl,
      targetBranch: p.targetBranch,
      provider: p.provider,
      lastAccessed: p.lastAccessed,
      data: p.data,
    },
  });
}

export async function dbGetWorkspace(id: WorkspaceId): Promise<Workspace | null> {
  const row = await prisma.workspace.findUnique({
    where: { id },
    select: { data: true },
  });
  return row ? parseWorkspace(row) : null;
}

export async function dbTouchWorkspace(id: WorkspaceId, ws: Workspace): Promise<void> {
  const now = new Date();
  ws.lastAccessed = now;
  const data = JSON.stringify(ws, (_key, value) => {
    if (value instanceof Date) return value.toISOString();
    return value;
  });
  await prisma.workspace.update({
    where: { id },
    data: {
      lastAccessed: now.toISOString(),
      data,
    },
  });
}

export async function dbDeleteWorkspace(id: WorkspaceId): Promise<boolean> {
  try {
    await prisma.workspace.delete({ where: { id } });
    return true;
  } catch {
    return false;
  }
}

export async function dbWorkspaceExists(id: WorkspaceId): Promise<boolean> {
  const n = await prisma.workspace.count({ where: { id } });
  return n > 0;
}

export async function dbGetAllWorkspaces(): Promise<Workspace[]> {
  const rows = await prisma.workspace.findMany({
    orderBy: { lastAccessed: 'desc' },
    select: { data: true },
  });
  return rows.map(parseWorkspace);
}
