export interface Workspace {
  id: string;
  repoUrl: string;
  branch: string;
  path: string;
  lastAccessed: Date;
  metadata?: {
    isActive: boolean;
    commitHash?: string;
    size?: number;
    gitConfig?: {
      userEmail?: string;
      userName?: string;
      signingKey?: string;
    };
  };
}

export interface CloneForm {
  repoUrl: string;
  branch: string;
  depth: string;
  singleBranch: boolean;
}

export interface ClaudeForm {
  workspaceId: string;
  question: string;
  context: string;
  sourceBranch: string;
}

export interface AskForm {
  workspaceId: string;
  question: string;
  context?: string;
  sourceBranch: string;
}

export interface EditForm extends AskForm {
  createMR: boolean;
  taskId?: string;
  taskName?: string;
  newBranchName?: string;
}

export interface ChangePasswordForm {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

/**
 * Individual JSON log entry from Claude Code stream
 */
export interface ClaudeCodeJsonLogEntry {
  type: string;
  subtype?: string;
  timestamp?: string;
  message?: unknown;
  result?: string;
  duration_ms?: number;
  [key: string]: unknown;
}

export interface ExecutionHistoryEntry {
  id: string;
  workspaceId: string;
  workspaceName: string;
  question: string;
  response: string;
  status: 'success' | 'error';
  errorMessage?: string;
  executedAt: string;
  executionTimeMs?: number;
  /** Raw JSON stream logs from Claude Code execution */
  jsonLogs?: ClaudeCodeJsonLogEntry[];
  /** Raw stdout output (includes all output before parsing) */
  rawOutput?: string;
}
