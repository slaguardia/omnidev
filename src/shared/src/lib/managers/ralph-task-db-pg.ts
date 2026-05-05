/**
 * Ralph Task Database — PostgreSQL via Prisma.
 * Mirrors ralph-task-db-sqlite public API (async).
 */

import { prisma } from '@/lib/db/prisma';
import type { RalphTask, RalphTaskIndexEntry } from './ralph-task-manager';
import type {
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
} from './ralph-task-db-sqlite';
import type { Prisma } from '@prisma/client';

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function jobToRalphJob(j: {
  id: string;
  taskId: string;
  agentType: string;
  status: string;
  payload: string;
  result: string | null;
  error: string | null;
  startedAt: string | null;
  heartbeatAt: string | null;
  createdAt: string;
  updatedAt: string;
}): RalphJob {
  return {
    id: j.id,
    task_id: j.taskId,
    agent_type: j.agentType,
    status: j.status as RalphJobStatus,
    payload: j.payload,
    result: j.result,
    error: j.error,
    started_at: j.startedAt,
    heartbeat_at: j.heartbeatAt,
    created_at: j.createdAt,
    updated_at: j.updatedAt,
  };
}

function agentRunToRalph(r: {
  id: string;
  jobId: string;
  status: string;
  logs: string;
  startedAt: string;
  completedAt: string | null;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  costCents?: number | null;
  cancellationRequestedAt?: string | null;
}): RalphAgentRun {
  return {
    id: r.id,
    job_id: r.jobId,
    status: r.status,
    logs: r.logs,
    started_at: r.startedAt,
    completed_at: r.completedAt,
    model: r.model ?? null,
    input_tokens: r.inputTokens ?? null,
    output_tokens: r.outputTokens ?? null,
    total_tokens: r.totalTokens ?? null,
    cost_cents: r.costCents ?? null,
    cancellation_requested_at: r.cancellationRequestedAt ?? null,
  };
}

function agentEventToRalph(e: {
  id: string;
  runId: string;
  seq: number;
  type: string;
  payload: string;
  createdAt: string;
}): RalphAgentEvent {
  return {
    id: e.id,
    run_id: e.runId,
    seq: e.seq,
    type: e.type,
    payload: e.payload,
    created_at: e.createdAt,
  };
}

function stageTokenToDb(t: {
  id: string;
  tokenHash: string;
  jobId: string;
  taskId: string;
  permissions: string;
  expiresAt: string;
  revoked: number;
  createdAt: string;
  revokedAt: string | null;
}): DbStageToken {
  return {
    id: t.id,
    token_hash: t.tokenHash,
    job_id: t.jobId,
    task_id: t.taskId,
    permissions: t.permissions,
    expires_at: t.expiresAt,
    revoked: t.revoked,
    created_at: t.createdAt,
    revoked_at: t.revokedAt,
  };
}

function parseTaskFromRow(row: { data: string }): RalphTask {
  return JSON.parse(row.data) as RalphTask;
}

function taskToPrismaData(task: RalphTask): Prisma.RalphTaskCreateInput {
  return {
    id: task.id,
    title: task.title,
    workspaceId: task.workspaceId,
    status: task.status,
    isArchived: task.isArchived ? 1 : 0,
    parentId: task.parentId ?? null,
    subtaskOrder: task.subtaskOrder ?? task.storyOrder ?? null,
    deliveryMethod: task.deliveryMethod ?? 'merge-request',
    executionJobId: task.executionJobId ?? null,
    taskNumber: task.taskNumber ?? null,
    projectId: task.projectId ?? null,
    playbookId: task.playbookId ?? null,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    completedAt: task.completedAt ?? null,
    data: JSON.stringify(task),
  };
}

async function ensureDefaultPlaybooks(): Promise<void> {
  const n = await prisma.ralphPlaybook.count();
  if (n > 0) return;
  const now = new Date().toISOString();
  const id1 = `pb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-s1`;
  const id2 = `pb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-s2`;
  await prisma.ralphPlaybook.createMany({
    data: [
      {
        id: id1,
        name: 'Full Pipeline',
        description: 'All stages in order',
        stageIds: JSON.stringify(['triage', 'planning', 'research', 'ready', 'executing']),
        isDefault: 1,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: id2,
        name: 'Shotgun',
        description: 'Skip planning and research — triage then execute',
        stageIds: JSON.stringify(['triage', 'executing']),
        isDefault: 0,
        createdAt: now,
        updatedAt: now,
      },
    ],
  });
  console.log('[RALPH TASK DB PG] Seeded default playbooks');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function dbNextTaskNumber(): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.ralphMeta.findUnique({ where: { key: 'next_task_number' } });
    const result = row ? parseInt(row.value, 10) : 1;
    await tx.ralphMeta.upsert({
      where: { key: 'next_task_number' },
      create: { key: 'next_task_number', value: String(result + 1) },
      update: { value: String(result + 1) },
    });
    return result;
  });
}

export async function dbInsertTask(task: RalphTask): Promise<void> {
  await prisma.ralphTask.create({ data: taskToPrismaData(task) });
}

export async function dbGetTask(id: string): Promise<RalphTask | null> {
  const row = await prisma.ralphTask.findUnique({ where: { id }, select: { data: true } });
  return row ? parseTaskFromRow(row) : null;
}

export async function dbUpdateTask(task: RalphTask): Promise<void> {
  const d = taskToPrismaData(task);
  await prisma.ralphTask.update({
    where: { id: task.id },
    data: {
      title: d.title!,
      workspaceId: d.workspaceId!,
      status: d.status!,
      isArchived: d.isArchived!,
      parentId: d.parentId ?? null,
      subtaskOrder: d.subtaskOrder ?? null,
      deliveryMethod: d.deliveryMethod ?? 'merge-request',
      executionJobId: d.executionJobId ?? null,
      taskNumber: d.taskNumber ?? null,
      projectId: d.projectId ?? null,
      playbookId: d.playbookId ?? null,
      createdAt: d.createdAt!,
      updatedAt: d.updatedAt!,
      completedAt: d.completedAt ?? null,
      data: d.data!,
    },
  });
}

export async function dbDeleteTask(id: string): Promise<boolean> {
  try {
    await prisma.ralphTask.delete({ where: { id } });
    return true;
  } catch {
    return false;
  }
}

export async function dbTaskExists(id: string): Promise<boolean> {
  const n = await prisma.ralphTask.count({ where: { id } });
  return n > 0;
}

export async function dbGetTaskStatus(id: string): Promise<string | null> {
  const row = await prisma.ralphTask.findUnique({ where: { id }, select: { status: true } });
  return row?.status ?? null;
}

export async function dbGetBoardTasks(options: {
  includeArchived?: boolean;
  archivedOnly?: boolean;
}): Promise<RalphTask[]> {
  let where: Prisma.RalphTaskWhereInput = {};
  if (options.archivedOnly) {
    where = { isArchived: 1 };
  } else if (!options.includeArchived) {
    where = { isArchived: 0 };
  }

  const rows = await prisma.ralphTask.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    select: { data: true },
  });
  return rows.map(parseTaskFromRow);
}

export async function dbGetAllIndexEntries(): Promise<RalphTaskIndexEntry[]> {
  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      title: string;
      workspace_id: string;
      status: string;
      is_archived: number;
      parent_id: string | null;
      subtask_order: number | null;
      task_number: number | null;
      project_id: string | null;
      playbook_id: string | null;
      updated_at: string;
      child_count: bigint;
      data: string;
    }>
  >`
    SELECT t.id, t.title, t.workspace_id, t.status, t.is_archived, t.parent_id, t.subtask_order,
           t.task_number, t.project_id, t.playbook_id, t.updated_at, t.data,
           (SELECT COUNT(*)::bigint FROM ralph_tasks c WHERE c.parent_id = t.id) AS child_count
    FROM ralph_tasks t
    ORDER BY t.updated_at DESC
  `;

  return rows.map((row) => {
    let blockedByCount = 0;
    try {
      const parsed = JSON.parse(row.data) as { blockedBy?: string[] };
      blockedByCount = Array.isArray(parsed.blockedBy) ? parsed.blockedBy.length : 0;
    } catch {
      blockedByCount = 0;
    }
    return {
      id: row.id,
      title: row.title,
      workspaceId: row.workspace_id,
      status: row.status,
      isSubtask: row.parent_id != null,
      parentId: row.parent_id,
      childCount: Number(row.child_count),
      subtaskOrder: row.subtask_order,
      taskNumber: row.task_number,
      projectId: row.project_id,
      playbookId: row.playbook_id,
      isArchived: row.is_archived === 1,
      blockedByCount,
      updatedAt: row.updated_at,
    };
  });
}

export async function dbGetChildStats(parentId: string): Promise<{
  total: number;
  executing_count: number;
  completed_count: number;
  ready_count: number;
  pending_count: number;
}> {
  const rows = await prisma.$queryRaw<
    Array<{
      total: bigint;
      executing_count: bigint;
      completed_count: bigint;
      ready_count: bigint;
      pending_count: bigint;
    }>
  >`
    SELECT
      COUNT(*)::bigint AS total,
      SUM(CASE WHEN status = 'executing' THEN 1 ELSE 0 END)::bigint AS executing_count,
      SUM(CASE WHEN status = 'complete' THEN 1 ELSE 0 END)::bigint AS completed_count,
      SUM(CASE WHEN status = 'ready' THEN 1 ELSE 0 END)::bigint AS ready_count,
      SUM(CASE WHEN status NOT IN ('executing', 'complete', 'ready') THEN 1 ELSE 0 END)::bigint AS pending_count
    FROM ralph_tasks
    WHERE parent_id = ${parentId}
  `;
  const r = rows[0];
  if (!r) {
    return { total: 0, executing_count: 0, completed_count: 0, ready_count: 0, pending_count: 0 };
  }
  return {
    total: Number(r.total),
    executing_count: Number(r.executing_count),
    completed_count: Number(r.completed_count),
    ready_count: Number(r.ready_count),
    pending_count: Number(r.pending_count),
  };
}

export async function dbGetChildCount(parentId: string): Promise<number> {
  return prisma.ralphTask.count({ where: { parentId } });
}

export async function dbGetChildTasks(parentId: string): Promise<RalphTask[]> {
  const rows = await prisma.ralphTask.findMany({
    where: { parentId },
    orderBy: [{ subtaskOrder: 'asc' }, { createdAt: 'asc' }],
    select: { data: true },
  });
  return rows.map(parseTaskFromRow);
}

export async function dbDeleteByWorkspace(workspaceId: string): Promise<number> {
  const res = await prisma.ralphTask.deleteMany({ where: { workspaceId } });
  return res.count;
}

export async function dbTransaction<T>(fn: () => Promise<T>): Promise<T> {
  return prisma.$transaction(async () => {
    return await fn();
  });
}

export async function dbCreateProject(project: DbProject): Promise<void> {
  await prisma.ralphProject.create({
    data: {
      id: project.id,
      name: project.name,
      color: project.color,
      createdAt: project.created_at,
      updatedAt: project.updated_at,
    },
  });
}

export async function dbListProjects(): Promise<DbProject[]> {
  const rows = await prisma.ralphProject.findMany({ orderBy: { name: 'asc' } });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color ?? '#6366f1',
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  }));
}

export async function dbGetProject(id: string): Promise<DbProject | null> {
  const r = await prisma.ralphProject.findUnique({ where: { id } });
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    color: r.color ?? '#6366f1',
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  };
}

export async function dbUpdateProject(
  id: string,
  updates: { name?: string; color?: string }
): Promise<boolean> {
  const now = new Date().toISOString();
  try {
    await prisma.ralphProject.update({
      where: { id },
      data: {
        ...(updates.name !== undefined ? { name: updates.name } : {}),
        ...(updates.color !== undefined ? { color: updates.color } : {}),
        updatedAt: now,
      },
    });
    return true;
  } catch {
    return false;
  }
}

export async function dbDeleteProject(id: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await tx.ralphTask.updateMany({ where: { projectId: id }, data: { projectId: null } });

    const jsonMatches = await tx.$queryRaw<Array<{ id: string; data: string }>>`
      SELECT id, data FROM ralph_tasks
      WHERE data::jsonb->>'projectId' = ${id}
    `;
    for (const row of jsonMatches) {
      try {
        const parsed = JSON.parse(row.data) as Record<string, unknown>;
        parsed.projectId = null;
        await tx.ralphTask.update({
          where: { id: row.id },
          data: { data: JSON.stringify(parsed) },
        });
      } catch {
        /* skip */
      }
    }

    try {
      await tx.ralphProject.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  });
}

export async function dbCreatePlaybook(playbook: DbPlaybook): Promise<void> {
  await prisma.ralphPlaybook.create({
    data: {
      id: playbook.id,
      name: playbook.name,
      description: playbook.description,
      stageIds: playbook.stage_ids,
      promptOverrides: playbook.prompt_overrides,
      isDefault: playbook.is_default,
      createdAt: playbook.created_at,
      updatedAt: playbook.updated_at,
    },
  });
}

export async function dbListPlaybooks(): Promise<DbPlaybook[]> {
  await ensureDefaultPlaybooks();
  const rows = await prisma.ralphPlaybook.findMany({ orderBy: { name: 'asc' } });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    stage_ids: r.stageIds,
    prompt_overrides: r.promptOverrides,
    is_default: r.isDefault,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  }));
}

export async function dbGetPlaybook(id: string): Promise<DbPlaybook | null> {
  const r = await prisma.ralphPlaybook.findUnique({ where: { id } });
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    stage_ids: r.stageIds,
    prompt_overrides: r.promptOverrides,
    is_default: r.isDefault,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  };
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
  return prisma.$transaction(async (tx) => {
    if (updates.is_default === 1) {
      await tx.ralphPlaybook.updateMany({ where: { isDefault: 1 }, data: { isDefault: 0 } });
    }
    const now = new Date().toISOString();
    try {
      await tx.ralphPlaybook.update({
        where: { id },
        data: {
          ...(updates.name !== undefined ? { name: updates.name } : {}),
          ...(updates.description !== undefined ? { description: updates.description } : {}),
          ...(updates.stage_ids !== undefined ? { stageIds: updates.stage_ids } : {}),
          ...(updates.prompt_overrides !== undefined
            ? { promptOverrides: updates.prompt_overrides }
            : {}),
          ...(updates.is_default !== undefined ? { isDefault: updates.is_default } : {}),
          updatedAt: now,
        },
      });
      return true;
    } catch {
      return false;
    }
  });
}

export async function dbDeletePlaybook(id: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await tx.ralphTask.updateMany({ where: { playbookId: id }, data: { playbookId: null } });

    const jsonMatches = await tx.$queryRaw<Array<{ id: string; data: string }>>`
      SELECT id, data FROM ralph_tasks
      WHERE data::jsonb->>'playbookId' = ${id}
    `;
    for (const row of jsonMatches) {
      try {
        const parsed = JSON.parse(row.data) as Record<string, unknown>;
        parsed.playbookId = null;
        await tx.ralphTask.update({
          where: { id: row.id },
          data: { data: JSON.stringify(parsed) },
        });
      } catch {
        /* skip */
      }
    }

    try {
      await tx.ralphPlaybook.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  });
}

export async function dbCreateJob(job: RalphJob): Promise<void> {
  await prisma.job.create({
    data: {
      id: job.id,
      taskId: job.task_id,
      agentType: job.agent_type,
      status: job.status,
      payload: job.payload,
      result: job.result,
      error: job.error,
      createdAt: job.created_at,
      updatedAt: job.updated_at,
      ...(job.started_at != null ? { startedAt: job.started_at } : {}),
      ...(job.heartbeat_at != null ? { heartbeatAt: job.heartbeat_at } : {}),
    },
  });
}

export async function dbGetJob(id: string): Promise<RalphJob | null> {
  const j = await prisma.job.findUnique({ where: { id } });
  return j ? jobToRalphJob(j) : null;
}

export async function dbClaimNextPendingJob(): Promise<RalphJob | null> {
  return prisma.$transaction(async (tx) => {
    const next = await tx.job.findFirst({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
    });
    if (!next) return null;
    const now = new Date().toISOString();
    const res = await tx.job.updateMany({
      where: { id: next.id, status: 'pending' },
      data: {
        status: 'running',
        startedAt: now,
        heartbeatAt: now,
        updatedAt: now,
      },
    });
    if (res.count !== 1) return null;
    return jobToRalphJob({
      ...next,
      status: 'running',
      startedAt: now,
      heartbeatAt: now,
      updatedAt: now,
    });
  });
}

export async function dbUpdateJob(
  id: string,
  updates: Partial<Pick<RalphJob, 'status' | 'result' | 'error'>>
): Promise<boolean> {
  const now = new Date().toISOString();
  try {
    await prisma.job.update({
      where: { id },
      data: {
        updatedAt: now,
        ...(updates.status !== undefined ? { status: updates.status } : {}),
        ...(updates.result !== undefined ? { result: updates.result } : {}),
        ...(updates.error !== undefined ? { error: updates.error } : {}),
      },
    });
    return true;
  } catch {
    return false;
  }
}

export async function dbListJobs(filters?: { task_id?: string }): Promise<RalphJob[]> {
  const rows = await prisma.job.findMany({
    ...(filters?.task_id ? { where: { taskId: filters.task_id } } : {}),
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(jobToRalphJob);
}

export async function dbHeartbeatJob(jobId: string): Promise<boolean> {
  const now = new Date().toISOString();
  const res = await prisma.job.updateMany({
    where: { id: jobId, status: 'running' },
    data: { heartbeatAt: now },
  });
  return res.count > 0;
}

export async function dbGetWorkerHealth(): Promise<import('./ralph-task-db-sqlite').WorkerHealth> {
  const [pendingJobs, runningJobs, latest] = await Promise.all([
    prisma.job.count({ where: { status: 'pending' } }),
    prisma.job.count({ where: { status: 'running' } }),
    prisma.job.findFirst({
      where: { status: 'running' },
      orderBy: { heartbeatAt: 'desc' },
      select: { heartbeatAt: true },
    }),
  ]);
  return {
    pendingJobs,
    runningJobs,
    lastHeartbeat: latest?.heartbeatAt ?? null,
  };
}

export async function dbRecoverStaleJobs(cutoffIso: string): Promise<number> {
  const now = new Date().toISOString();
  const res = await prisma.job.updateMany({
    where: {
      status: 'running',
      OR: [{ heartbeatAt: null }, { heartbeatAt: { lt: cutoffIso } }],
    },
    data: {
      status: 'failed',
      error: 'Job timed out (no heartbeat for 10+ minutes)',
      updatedAt: now,
    },
  });
  return res.count;
}

export async function dbCreateAgentRun(run: RalphAgentRun): Promise<void> {
  await prisma.agentRun.create({
    data: {
      id: run.id,
      jobId: run.job_id,
      status: run.status,
      logs: run.logs,
      startedAt: run.started_at,
      completedAt: run.completed_at,
    },
  });
}

export async function dbUpdateAgentRun(
  id: string,
  updates: Partial<Pick<RalphAgentRun, 'status' | 'logs' | 'completed_at'>>
): Promise<boolean> {
  const data: Prisma.AgentRunUpdateInput = {};
  if (updates.status !== undefined) data.status = updates.status;
  if (updates.logs !== undefined) data.logs = updates.logs;
  if (updates.completed_at !== undefined) data.completedAt = updates.completed_at;
  if (Object.keys(data).length === 0) return false;
  try {
    await prisma.agentRun.update({ where: { id }, data });
    return true;
  } catch {
    return false;
  }
}

export async function dbGetAgentRunsByJob(jobId: string): Promise<RalphAgentRun[]> {
  const rows = await prisma.agentRun.findMany({
    where: { jobId },
    orderBy: { startedAt: 'desc' },
  });
  return rows.map(agentRunToRalph);
}

/**
 * Update the per-run summary fields populated by the streaming AgentRunner
 * (model, token counts, cost, cancellation marker). Unspecified fields are
 * left unchanged. Returns true if a row was updated.
 */
export async function dbUpdateAgentRunSummary(
  id: string,
  updates: RalphAgentRunSummaryUpdate
): Promise<boolean> {
  const data: Prisma.AgentRunUpdateInput = {};
  if (updates.model !== undefined) data.model = updates.model;
  if (updates.input_tokens !== undefined) data.inputTokens = updates.input_tokens;
  if (updates.output_tokens !== undefined) data.outputTokens = updates.output_tokens;
  if (updates.total_tokens !== undefined) data.totalTokens = updates.total_tokens;
  if (updates.cost_cents !== undefined) data.costCents = updates.cost_cents;
  if (updates.cancellation_requested_at !== undefined) {
    data.cancellationRequestedAt = updates.cancellation_requested_at;
  }
  if (Object.keys(data).length === 0) return false;
  try {
    await prisma.agentRun.update({ where: { id }, data });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Agent Event CRUD
// ---------------------------------------------------------------------------

/**
 * Append a single event to a run's timeline. Caller-provided seq is trusted;
 * the unique index on (run_id, seq) catches application-side bugs that
 * produce duplicates within one run. Concurrent inserts across DIFFERENT
 * runs do not contend because each has a different run_id.
 */
export async function dbAppendAgentEvent(event: RalphAgentEvent): Promise<void> {
  await prisma.agentEvent.create({
    data: {
      id: event.id,
      runId: event.run_id,
      seq: event.seq,
      type: event.type,
      payload: event.payload,
      createdAt: event.created_at,
    },
  });
}

export async function dbListAgentEvents(
  runId: string,
  options: ListAgentEventsOptions = {}
): Promise<RalphAgentEvent[]> {
  const where: Prisma.AgentEventWhereInput = { runId };
  if (options.type !== undefined) {
    where.type = options.type;
  } else if (options.fromSeq !== undefined) {
    where.seq = { gt: options.fromSeq };
  }
  const rows = await prisma.agentEvent.findMany({
    where,
    orderBy: { seq: 'asc' },
  });
  return rows.map(agentEventToRalph);
}

/**
 * Stream events for a run as an async iterable. Yields all existing events
 * in seq order (backfill), then polls for new events appended after the
 * starting cursor until the run reaches a terminal status (completed,
 * failed, or cancelled). Used by the SSE timeline endpoint in sub-task 8.
 *
 * Polling is the default cross-process strategy. Postgres LISTEN/NOTIFY is a
 * future optimization layered on top of this same iterator shape.
 */
export async function* dbStreamAgentEvents(
  runId: string,
  options: StreamAgentEventsOptions = {}
): AsyncGenerator<RalphAgentEvent, void, undefined> {
  const pollIntervalMs = options.pollIntervalMs ?? 250;
  let cursor = options.fromSeq ?? -1;

  while (!options.signal?.aborted) {
    const batch = await dbListAgentEvents(runId, { fromSeq: cursor });
    for (const event of batch) {
      yield event;
      cursor = event.seq;
    }

    if (options.signal?.aborted) return;

    const run = await prisma.agentRun.findUnique({
      where: { id: runId },
      select: { status: true },
    });
    const terminal =
      run !== null &&
      (run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled');

    if (terminal) {
      const tail = await dbListAgentEvents(runId, { fromSeq: cursor });
      for (const event of tail) {
        yield event;
        cursor = event.seq;
      }
      return;
    }

    await new Promise<void>((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

export async function dbInsertStageToken(
  token: Omit<DbStageToken, 'revoked' | 'revoked_at'>
): Promise<void> {
  await prisma.stageToken.create({
    data: {
      id: token.id,
      tokenHash: token.token_hash,
      jobId: token.job_id,
      taskId: token.task_id,
      permissions: token.permissions,
      expiresAt: token.expires_at,
      createdAt: token.created_at,
    },
  });
}

export async function dbGetStageTokenByHash(tokenHash: string): Promise<DbStageToken | null> {
  const t = await prisma.stageToken.findFirst({
    where: { tokenHash, revoked: 0 },
  });
  return t ? stageTokenToDb(t) : null;
}

export async function dbRevokeTokensByJob(jobId: string): Promise<number> {
  const now = new Date().toISOString();
  const res = await prisma.stageToken.updateMany({
    where: { jobId, revoked: 0 },
    data: { revoked: 1, revokedAt: now },
  });
  return res.count;
}

export async function dbRevokeExpiredTokens(): Promise<number> {
  const now = new Date().toISOString();
  const res = await prisma.stageToken.updateMany({
    where: { revoked: 0, expiresAt: { lt: now } },
    data: { revoked: 1, revokedAt: now },
  });
  return res.count;
}

export async function dbClose(): Promise<void> {
  await prisma.$disconnect();
}
