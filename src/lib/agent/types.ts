'use server';

/**
 * Agent worker contract — the request/result boundary between orchestration
 * (task state, loop decisions, prompt building) and execution (git setup,
 * AI invocation, commit/push/PR, artifacts).
 *
 * Key constraint: nothing in this file imports from ralph-task-manager.
 */

import type { FilePath, WorkspaceId } from '@/lib/types/index';

// ---------------------------------------------------------------------------
// Request — everything the agent needs to run one iteration
// ---------------------------------------------------------------------------

export interface AgentGitConfig {
  /** Branch to commit to (e.g. "ralph/<taskId>") */
  featureBranch?: string | undefined;
  /** Base branch to create the feature branch from */
  baseBranch?: string | undefined;
  /** Remote repo URL — needed for push/PR ops */
  repoUrl: string;
  /** Delivery method determines whether a PR/MR is created */
  deliveryMethod: 'merge-request' | 'direct-commit';
  /** Identity for commit author */
  commitIdentity: { name: string; email: string };
  /** Task context for semantic commit messages */
  taskContext?: { id: string; title: string } | undefined;
}

export interface AgentArtifactConfig {
  /** Relative path from workspace root, e.g. ".ralph/tasks/{id}/{stage}.md" */
  relativePath: string;
}

export interface AgentRunRequest {
  /** Task ID — used for logging and artifact paths only */
  taskId: string;
  /** Stage name — used for logging only */
  stageName: string;
  /** Current iteration number — used for logging only */
  iteration: number;

  /** Fully-resolved prompt (orchestrator handles continuation context) */
  prompt: string;

  /** Absolute path to the workspace */
  workspacePath: FilePath;
  /** Workspace ID for executor */
  workspaceId: WorkspaceId;

  /** Whether to run in edit mode (true) or readonly (false) */
  editMode: boolean;

  /** Git configuration for edit-mode stages. Omit for readonly. */
  git?: AgentGitConfig | undefined;

  /** Artifact file configuration. When set, the agent reads/writes this file. */
  artifact?: AgentArtifactConfig | undefined;

  /** Whether to parse QUESTION: lines from the output */
  parseQuestions: boolean;
}

// ---------------------------------------------------------------------------
// Result — what the agent returns to the orchestrator
// ---------------------------------------------------------------------------

export interface AgentGitResult {
  /** Whether changes were pushed */
  pushed: boolean;
  /** Branch that was pushed to */
  pushedBranch?: string | undefined;
  /** Commit hash of the push */
  commitHash?: string | undefined;
  /** URL of the created PR/MR, if any */
  prUrl?: string | undefined;
}

export interface AgentRunResult {
  /** Raw output from Claude Code */
  output: string;
  /** Execution time in milliseconds */
  executionTimeMs: number;

  /** Artifact file content (read from disk or from output) */
  fileOutput?: string | undefined;
  /** Parsed QUESTION: lines from output */
  questions?: string[] | undefined;

  /** Git operation results (only present if git config was provided) */
  git?: AgentGitResult | undefined;

  /** Signals detected in the output */
  signals: {
    /** Whether <promise>COMPLETE</promise> was found */
    completionSignal: boolean;
  };

  /** Non-fatal error message (execution succeeded but something went wrong) */
  error?: string | undefined;
}
