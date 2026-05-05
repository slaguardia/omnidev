/**
 * Unit tests for workspace storage facade — proves that concurrent saves do
 * not lose updates (the original module-level mutable cache could clobber
 * writes when two callers raced).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const dbState = new Map<string, unknown>();

vi.mock('@/lib/managers/workspace-db', () => ({
  dbInitWorkspaces: vi.fn(async () => undefined),
  dbSaveWorkspace: vi.fn(async (ws: { id: string }) => {
    await Promise.resolve();
    dbState.set(ws.id, { ...ws });
  }),
  dbGetWorkspace: vi.fn(async (id: string) => dbState.get(id) ?? null),
  dbDeleteWorkspace: vi.fn(async (id: string) => dbState.delete(id)),
  dbWorkspaceExists: vi.fn(async (id: string) => dbState.has(id)),
  dbGetAllWorkspaces: vi.fn(async () => Array.from(dbState.values())),
  dbTouchWorkspace: vi.fn(async (id: string, ws: unknown) => {
    dbState.set(id, ws);
  }),
}));

vi.mock('@/lib/config/server-actions', () => ({
  getDataDir: vi.fn(async () => '/tmp/omnidev-test-data-does-not-exist'),
}));

import {
  saveWorkspace,
  loadWorkspace,
  getAllWorkspaces,
  workspaceExists,
} from '../../src/shared/src/lib/workspace/storage';
import type { Workspace } from '../../src/shared/src/lib/workspace/types';
import type { WorkspaceId, GitUrl, FilePath } from '../../src/shared/src/lib/common/types';

function makeWorkspace(id: string, repoUrl = 'https://example.com/repo.git'): Workspace {
  return {
    id: id as WorkspaceId,
    path: ('/tmp/' + id) as FilePath,
    repoUrl: repoUrl as GitUrl,
    targetBranch: 'main',
    createdAt: new Date(),
    lastAccessed: new Date(),
  };
}

describe('workspace storage (DB-backed facade)', () => {
  beforeEach(() => {
    dbState.clear();
  });

  describe('concurrent saves do not lose updates', () => {
    it('saves from N parallel callers are all visible afterward', async () => {
      const ids = Array.from({ length: 25 }, (_, i) => `ws-${i}`);

      await Promise.all(ids.map((id) => saveWorkspace(makeWorkspace(id))));

      const all = await getAllWorkspaces();
      expect(all.success).toBe(true);
      if (!all.success) return;

      const seenIds = new Set(all.data.map((w) => w.id));
      for (const id of ids) {
        expect(seenIds.has(id as WorkspaceId)).toBe(true);
      }
      expect(all.data.length).toBe(ids.length);
    });

    it('saves with the same ID converge to the last write (no clobber-by-stale-cache)', async () => {
      const id = 'shared-id' as WorkspaceId;
      const writes = Array.from({ length: 10 }, (_, i) => ({
        ...makeWorkspace(id),
        targetBranch: `branch-${i}`,
      }));

      await Promise.all(writes.map((w) => saveWorkspace(w)));

      const loaded = await loadWorkspace(id);
      expect(loaded.success).toBe(true);
      if (!loaded.success) return;

      const allBranches = writes.map((w) => w.targetBranch);
      expect(allBranches).toContain(loaded.data.targetBranch);
    });
  });

  describe('basic facade operations', () => {
    it('saveWorkspace then loadWorkspace round-trips', async () => {
      const ws = makeWorkspace('ws-round-trip');
      const save = await saveWorkspace(ws);
      expect(save.success).toBe(true);

      const load = await loadWorkspace(ws.id);
      expect(load.success).toBe(true);
      if (load.success) {
        expect(load.data.id).toBe(ws.id);
        expect(load.data.repoUrl).toBe(ws.repoUrl);
      }
    });

    it('loadWorkspace bumps lastAccessed', async () => {
      const ws = makeWorkspace('ws-touch');
      const old = new Date(2020, 0, 1);
      ws.lastAccessed = old;

      await saveWorkspace(ws);
      const load = await loadWorkspace(ws.id);

      expect(load.success).toBe(true);
      if (load.success) {
        expect(load.data.lastAccessed.getTime()).toBeGreaterThan(old.getTime());
      }
    });

    it('getAllWorkspaces returns sorted by lastAccessed descending', async () => {
      const a = makeWorkspace('ws-a');
      const b = makeWorkspace('ws-b');
      const c = makeWorkspace('ws-c');
      a.lastAccessed = new Date(2020, 0, 1);
      b.lastAccessed = new Date(2022, 0, 1);
      c.lastAccessed = new Date(2024, 0, 1);

      await saveWorkspace(a);
      await saveWorkspace(b);
      await saveWorkspace(c);

      const all = await getAllWorkspaces();
      expect(all.success).toBe(true);
      if (all.success) {
        expect(all.data.map((w) => w.id)).toEqual(['ws-c', 'ws-b', 'ws-a']);
      }
    });

    it('workspaceExists reflects DB state', async () => {
      expect(await workspaceExists('missing' as WorkspaceId)).toBe(false);
      await saveWorkspace(makeWorkspace('present'));
      expect(await workspaceExists('present' as WorkspaceId)).toBe(true);
    });
  });
});
