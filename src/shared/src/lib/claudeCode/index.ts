/**
 * Legacy-named module — retained for git workflow + CLAUDE.md helpers that
 * happen to live here for historical reasons. The Claude Code CLI integration
 * itself was removed; the streaming AgentRunner contract is now the only
 * agent surface (see `@/lib/agent`).
 *
 * The directory is scheduled for relocation in a future cleanup; new code
 * should not add modules here.
 */

// Types
export type {
  ClaudeCodeResult,
  PostExecutionResult,
  GitWorkflowOptions,
} from '@/lib/claudeCode/types';

// Re-export GitBranchWorkflowResult for compatibility
export type { GitBranchWorkflowResult } from '@/lib/claudeCode/git-workflow';

// Git workflow init (used by executeAgentRun and the legacy queue handler).
export { initializeGitWorkflow } from '@/lib/claudeCode/git-workflow';

// Post-execution git ops (commit, push, PR creation).
export { handlePostClaudeCodeExecution } from '@/lib/claudeCode/post-execution';
export type { TaskContext } from '@/lib/claudeCode/post-execution';
