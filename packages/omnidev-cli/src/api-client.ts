/**
 * HTTP API client for the Omnidev Ralph API.
 * Thin wrapper over fetch() with auth and error handling.
 */

import { getConfig } from './config.js';

interface ApiResponse<T = unknown> {
  data: T;
  status: number;
}

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T = unknown>(
  method: string,
  path: string,
  body?: unknown
): Promise<ApiResponse<T>> {
  const config = getConfig();
  const url = `${config.baseUrl}${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Use scoped CLI token when available, fall back to API key
  if (config.cliToken) {
    headers['X-CLI-Token'] = config.cliToken;
  } else {
    headers['X-API-Key'] = config.apiKey;
  }

  const init: RequestInit = { method, headers };
  if (body) {
    init.body = JSON.stringify(body);
  }

  const res = await fetch(url, init);

  let data: T;
  try {
    data = (await res.json()) as T;
  } catch {
    throw new ApiError(`Invalid JSON response from ${method} ${path}`, res.status);
  }

  if (!res.ok) {
    const errData = data as Record<string, unknown>;
    const msg = (errData.error as string) ?? (errData.message as string) ?? `HTTP ${res.status}`;
    throw new ApiError(msg, res.status, errData.details);
  }

  return { data, status: res.status };
}

// ── Task CRUD ──

export async function listTasks(params?: Record<string, string>) {
  const query = params ? '?' + new URLSearchParams(params).toString() : '';
  return request<{
    tasks: Array<Record<string, unknown>>;
    meta: Record<string, unknown>;
  }>('GET', `/api/ralph/tasks${query}`);
}

export async function getTask(taskId: string) {
  return request<{ task: Record<string, unknown> }>('GET', `/api/ralph/tasks/${taskId}`);
}

export async function createTask(data: Record<string, unknown>) {
  return request<{ task: Record<string, unknown>; autoRunJobId?: string }>(
    'POST',
    '/api/ralph/tasks/create',
    data
  );
}

export async function updateTask(taskId: string, data: Record<string, unknown>) {
  return request<{ task: Record<string, unknown> }>('PATCH', `/api/ralph/tasks/${taskId}`, data);
}

export async function deleteTask(taskId: string) {
  return request<{ success: boolean }>('DELETE', `/api/ralph/tasks/${taskId}`);
}

// ── Lifecycle ──

export async function transitionTask(taskId: string, toStatus: string, reason?: string) {
  return request<{ task: Record<string, unknown>; transition: Record<string, unknown> }>(
    'POST',
    `/api/ralph/tasks/${taskId}/transition`,
    { toStatus, reason }
  );
}

export async function executeTask(taskId: string) {
  return request<Record<string, unknown>>('POST', `/api/ralph/tasks/${taskId}/execute`, {
    confirmBranchCreation: true,
  });
}

export async function completeTask(
  taskId: string,
  opts?: { skipPr?: boolean; draft?: boolean; title?: string; body?: string }
) {
  return request<{ task: Record<string, unknown>; prUrl?: string }>(
    'POST',
    `/api/ralph/tasks/${taskId}/complete`,
    opts ?? {}
  );
}

export async function runStage(taskId: string, stageName: string, prompt?: string) {
  return request<{ task?: Record<string, unknown>; jobId?: string }>(
    'POST',
    `/api/ralph/tasks/${taskId}/run-stage`,
    { stageName, ...(prompt ? { prompt } : {}) }
  );
}

export async function archiveTask(taskId: string) {
  return request<{ task: Record<string, unknown> }>('POST', `/api/ralph/tasks/${taskId}/archive`);
}

export async function unarchiveTask(taskId: string) {
  return request<{ task: Record<string, unknown> }>('DELETE', `/api/ralph/tasks/${taskId}/archive`);
}

export async function cancelLoop(taskId: string) {
  return request<Record<string, unknown>>('POST', `/api/ralph/tasks/${taskId}/cancel-loop`);
}

// ── Dependencies ──

export async function getDependencies(taskId: string) {
  return request<Record<string, unknown>>('GET', `/api/ralph/tasks/${taskId}/dependencies`);
}

export async function setDependencies(taskId: string, blockedBy: string[]) {
  return request<Record<string, unknown>>('PUT', `/api/ralph/tasks/${taskId}/dependencies`, {
    blockedBy,
  });
}

export async function getDependencyGraph(taskId: string) {
  return request<Record<string, unknown>>('GET', `/api/ralph/tasks/${taskId}/dependency-graph`);
}

// ── Resources ──

export async function listWorkspaces(includeBranches = false) {
  const query = includeBranches ? '' : '?includeBranches=false';
  return request<{
    workspaces: Array<Record<string, unknown>>;
    meta: Record<string, unknown>;
  }>('GET', `/api/ralph/workspaces${query}`);
}

export async function listProjects() {
  return request<{ projects: Array<Record<string, unknown>> }>('GET', '/api/ralph/projects');
}

export async function listPlaybooks() {
  return request<{ playbooks: Array<Record<string, unknown>> }>('GET', '/api/ralph/playbooks');
}

// ── Stage Q&A & jobs ──

export async function stageAnswer(
  taskId: string,
  body: {
    stageName: string;
    answers?: Record<string, string>;
    dismiss?: string[];
  }
) {
  return request<{ task: Record<string, unknown>; iterationsRemaining: number }>(
    'POST',
    `/api/ralph/tasks/${taskId}/stage-answer`,
    body
  );
}

export async function getJob(jobId: string) {
  return request<Record<string, unknown>>('GET', `/api/jobs/${jobId}`);
}

export { ApiError };
