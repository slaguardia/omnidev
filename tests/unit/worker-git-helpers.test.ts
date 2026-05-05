/**
 * Unit tests for worker git helpers — covers branch naming, per-job workspace
 * directory isolation, and the checkout-or-create branch pattern.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  buildBranchName,
  buildWorkspaceDir,
  checkoutOrCreateBranch,
} from '../../src/worker/src/git-helpers';

describe('worker git helpers', () => {
  describe('buildBranchName', () => {
    it('returns omnidev/task-{id} (regression guard for branch naming convention)', () => {
      expect(buildBranchName('abc123')).toBe('omnidev/task-abc123');
    });
  });

  describe('buildWorkspaceDir', () => {
    it('produces distinct directories for two jobs of the same task', () => {
      const a = buildWorkspaceDir('task-1', 'job-a');
      const b = buildWorkspaceDir('task-1', 'job-b');
      expect(a).not.toBe(b);
    });

    it('keys the leaf directory by job ID', () => {
      const dir = buildWorkspaceDir('task-1', 'job-xyz');
      expect(dir.endsWith('job-job-xyz')).toBe(true);
    });

    it('groups per-task subdirectories so cleanup of a single job does not affect siblings', () => {
      const dirA = buildWorkspaceDir('task-1', 'job-a');
      const dirB = buildWorkspaceDir('task-1', 'job-b');
      const dirC = buildWorkspaceDir('task-2', 'job-a');

      const taskOnePrefix = dirA.slice(0, dirA.lastIndexOf('/'));
      expect(dirB.startsWith(taskOnePrefix)).toBe(true);
      expect(dirC.startsWith(taskOnePrefix)).toBe(false);
    });
  });

  describe('checkoutOrCreateBranch', () => {
    it('checks out the existing branch when one with the same name already exists locally', async () => {
      const checkout = vi.fn().mockResolvedValue(undefined);
      const checkoutLocalBranch = vi.fn().mockResolvedValue(undefined);
      const branchLocal = vi.fn().mockResolvedValue({ all: ['main', 'omnidev/task-1'] });

      const git = { branchLocal, checkout, checkoutLocalBranch } as never;

      await checkoutOrCreateBranch(git, 'omnidev/task-1');

      expect(checkout).toHaveBeenCalledWith('omnidev/task-1');
      expect(checkoutLocalBranch).not.toHaveBeenCalled();
    });

    it('creates a new local branch when none with that name exists', async () => {
      const checkout = vi.fn().mockResolvedValue(undefined);
      const checkoutLocalBranch = vi.fn().mockResolvedValue(undefined);
      const branchLocal = vi.fn().mockResolvedValue({ all: ['main'] });

      const git = { branchLocal, checkout, checkoutLocalBranch } as never;

      await checkoutOrCreateBranch(git, 'omnidev/task-2');

      expect(checkoutLocalBranch).toHaveBeenCalledWith('omnidev/task-2');
      expect(checkout).not.toHaveBeenCalled();
    });
  });

  describe('concurrent same-task safety', () => {
    it('two jobs for the same task ID get isolated workspace dirs AND share the same remote branch name', () => {
      const taskId = 'task-shared';
      const dirA = buildWorkspaceDir(taskId, 'job-A');
      const dirB = buildWorkspaceDir(taskId, 'job-B');
      const branchA = buildBranchName(taskId);
      const branchB = buildBranchName(taskId);

      expect(dirA).not.toBe(dirB);
      expect(branchA).toBe(branchB);
    });
  });
});
