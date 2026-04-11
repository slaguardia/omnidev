/**
 * Permission enforcement for scoped stage tokens.
 *
 * Full auth (session or API key) always passes — permission checks
 * only apply to stage tokens. This ensures zero backward compatibility risk.
 */

import { NextResponse } from 'next/server';
import type { AuthResult } from './api-auth';
import type { CliPermission } from '@/lib/types/index';

/**
 * When using a scoped stage token (`X-CLI-Token`), ensure the request targets the same task
 * as the token. Session and API-key auth are unrestricted.
 *
 * @returns null if allowed, or 403 NextResponse if the route task does not match the token.
 */
export function requireStageTokenMatchesRouteTask(
  auth: AuthResult,
  routeTaskId: string
): NextResponse | null {
  if (!auth.stageToken) {
    return null;
  }
  if (auth.stageToken.taskId === routeTaskId) {
    return null;
  }
  return NextResponse.json(
    {
      error: 'Permission denied',
      details: 'Stage token is scoped to a different task',
    },
    { status: 403 }
  );
}

/**
 * Check if the authenticated caller has a specific permission.
 *
 * - Full auth (no stageToken) → always passes (returns null)
 * - Stage token → checks permissions array
 * - `subtasks:create` → also validates that opts.taskId matches the token's taskId
 *
 * @returns null if authorized, or a 403 NextResponse if denied.
 */
export function requirePermission(
  auth: AuthResult,
  permission: CliPermission,
  opts?: { taskId?: string }
): NextResponse | null {
  // Full auth (session or API key) — no restrictions
  if (!auth.stageToken) {
    return null;
  }

  const { permissions, taskId: tokenTaskId } = auth.stageToken;

  // Special case: subtasks:create requires parent task ID to match token's task
  if (permission === 'subtasks:create') {
    if (permissions.includes('subtasks:create') && opts?.taskId === tokenTaskId) {
      return null;
    }
    // Also allow if they have full tasks:create
    if (permissions.includes('tasks:create')) {
      return null;
    }
    return NextResponse.json(
      {
        error: 'Permission denied',
        details: `Stage token does not have '${permission}' permission${opts?.taskId ? ` for task ${opts.taskId}` : ''}`,
      },
      { status: 403 }
    );
  }

  // General permission check
  if (!permissions.includes(permission)) {
    return NextResponse.json(
      {
        error: 'Permission denied',
        details: `Stage token does not have '${permission}' permission`,
      },
      { status: 403 }
    );
  }

  return null;
}
