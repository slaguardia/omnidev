/**
 * Terminal output formatting — tables, status colors, task display.
 * Uses ANSI escape codes directly (no external dependency).
 */

// ANSI color helpers
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const blue = (s: string) => `\x1b[34m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const magenta = (s: string) => `\x1b[35m${s}\x1b[0m`;

const STATUS_COLORS: Record<string, (s: string) => string> = {
  draft: dim,
  triage: yellow,
  planning: cyan,
  research: blue,
  ready: magenta,
  executing: yellow,
  complete: green,
  failed: red,
};

export function formatStatus(status: string): string {
  const colorFn = STATUS_COLORS[status] ?? dim;
  return colorFn(status);
}

export function formatTaskNumber(taskNumber: number | null): string {
  return taskNumber != null ? `RLP-${taskNumber}` : dim('—');
}

function padRight(s: string, width: number): string {
  // Strip ANSI codes for length calculation
  // eslint-disable-next-line no-control-regex
  const stripped = s.replace(/\x1b\[[0-9;]*m/g, '');
  const padding = Math.max(0, width - stripped.length);
  return s + ' '.repeat(padding);
}

function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1) + '\u2026';
}

export function formatTaskList(tasks: Array<Record<string, unknown>>): string {
  if (tasks.length === 0) return dim('No tasks found.');

  const lines: string[] = [];

  // Header
  lines.push(
    bold(
      `${padRight('REF', 10)}${padRight('STATUS', 14)}${padRight('TITLE', 45)}${padRight('WORKSPACE', 25)}UPDATED`
    )
  );
  lines.push(dim('\u2500'.repeat(110)));

  for (const task of tasks) {
    const ref = formatTaskNumber(task.taskNumber as number | null);
    const status = formatStatus(task.status as string);
    const title = truncate((task.title as string) ?? '', 43);
    const workspace = truncate((task.workspaceName as string) ?? '', 23);
    const updated = formatRelativeTime(task.updatedAt as string);

    lines.push(
      `${padRight(ref, 10)}${padRight(status, 14)}${padRight(title, 45)}${padRight(workspace, 25)}${dim(updated)}`
    );
  }

  lines.push('');
  lines.push(dim(`${tasks.length} task(s)`));

  return lines.join('\n');
}

export function formatTaskDetail(task: Record<string, unknown>): string {
  const lines: string[] = [];

  const ref = formatTaskNumber(task.taskNumber as number | null);
  lines.push(bold(`${ref}  ${task.title as string}`));
  lines.push(dim('\u2500'.repeat(60)));

  const fields: Array<[string, string]> = [
    ['ID', task.id as string],
    ['Status', formatStatus(task.status as string)],
    ['Workspace', (task.workspaceName as string) ?? (task.workspaceId as string)],
  ];

  if (task.projectId) fields.push(['Project', task.projectId as string]);
  if (task.playbookId) fields.push(['Playbook', task.playbookId as string]);
  if (task.featureBranch) fields.push(['Feature Branch', task.featureBranch as string]);
  if (task.baseBranch) fields.push(['Base Branch', task.baseBranch as string]);
  if (task.prUrl) fields.push(['PR URL', task.prUrl as string]);
  if (task.deliveryMethod) fields.push(['Delivery', task.deliveryMethod as string]);
  if (task.parentId) {
    const parentLabel = task.parentTitle
      ? `${task.parentId as string} (${task.parentTitle as string})`
      : (task.parentId as string);
    fields.push(['Parent', parentLabel]);
  }

  const blockedBy = task.blockedBy as string[] | undefined;
  if (blockedBy && blockedBy.length > 0) {
    fields.push(['Blocked By', blockedBy.join(', ')]);
  }

  fields.push(['Created', task.createdAt as string]);
  fields.push(['Updated', task.updatedAt as string]);

  const labelWidth = Math.max(...fields.map(([k]) => k.length)) + 2;
  for (const [label, value] of fields) {
    lines.push(`  ${dim(padRight(label + ':', labelWidth))} ${value}`);
  }

  // Description
  if (task.description) {
    lines.push('');
    lines.push(bold('Description'));
    lines.push((task.description as string).trim());
  }

  if (task.userStory) {
    lines.push('');
    lines.push(bold('User story'));
    lines.push((task.userStory as string).trim());
  }

  const criteria = task.acceptanceCriteria as string[] | undefined;
  if (criteria && criteria.length > 0) {
    lines.push('');
    lines.push(bold('Acceptance criteria'));
    for (const c of criteria) {
      lines.push(`  \u2022 ${c}`);
    }
  }

  // Child tasks
  const childTasks = task.childTasks as Array<Record<string, unknown>> | undefined;
  if (childTasks && childTasks.length > 0) {
    lines.push('');
    lines.push(bold(`Subtasks (${childTasks.length})`));
    for (const child of childTasks) {
      lines.push(
        `  ${formatStatus(child.status as string)}  ${child.title as string}  ${dim(child.id as string)}`
      );
    }
  }

  // Execution error
  if (task.executionError) {
    lines.push('');
    lines.push(red(`Error: ${task.executionError as string}`));
  }

  return lines.join('\n');
}

export function formatWorkspaceList(workspaces: Array<Record<string, unknown>>): string {
  if (workspaces.length === 0) return dim('No workspaces found.');

  const lines: string[] = [];
  lines.push(
    bold(`${padRight('ID', 30)}${padRight('NAME', 30)}${padRight('TARGET BRANCH', 20)}REPO URL`)
  );
  lines.push(dim('\u2500'.repeat(100)));

  for (const ws of workspaces) {
    lines.push(
      `${padRight(ws.id as string, 30)}${padRight(truncate(ws.name as string, 28), 30)}${padRight(ws.targetBranch as string, 20)}${dim(ws.repoUrl as string)}`
    );
  }

  lines.push('');
  lines.push(dim(`${workspaces.length} workspace(s)`));
  return lines.join('\n');
}

export function formatProjectList(projects: Array<Record<string, unknown>>): string {
  if (projects.length === 0) return dim('No projects found.');

  const lines: string[] = [];
  lines.push(bold(`${padRight('ID', 30)}${padRight('NAME', 30)}COLOR`));
  lines.push(dim('\u2500'.repeat(70)));

  for (const p of projects) {
    lines.push(
      `${padRight(p.id as string, 30)}${padRight(p.name as string, 30)}${(p.color as string) ?? dim('—')}`
    );
  }

  lines.push('');
  lines.push(dim(`${projects.length} project(s)`));
  return lines.join('\n');
}

export function formatPlaybookList(playbooks: Array<Record<string, unknown>>): string {
  if (playbooks.length === 0) return dim('No playbooks found.');

  const lines: string[] = [];
  lines.push(bold(`${padRight('ID', 30)}${padRight('NAME', 30)}STAGES`));
  lines.push(dim('\u2500'.repeat(80)));

  for (const pb of playbooks) {
    const stages = (pb.stageIds as string[])?.join(' \u2192 ') ?? dim('—');
    lines.push(`${padRight(pb.id as string, 30)}${padRight(pb.name as string, 30)}${stages}`);
  }

  lines.push('');
  lines.push(dim(`${playbooks.length} playbook(s)`));
  return lines.join('\n');
}

export function formatSuccess(msg: string): string {
  return green(msg);
}

export function formatError(msg: string): string {
  return red(`Error: ${msg}`);
}

function formatRelativeTime(isoStr: string): string {
  const now = Date.now();
  const then = new Date(isoStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(isoStr).toLocaleDateString();
}
