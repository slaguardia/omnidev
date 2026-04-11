/**
 * Claude Code Integration - Main exports
 */

// Types
export type {
  ClaudeCodeOptions,
  ClaudeCodeResult,
  PostExecutionResult,
  GitWorkflowOptions,
  ClaudeCodeStreamOptions,
  ClaudeCodeStreamEvent,
} from '@/lib/claudeCode/types';

// Re-export GitBranchWorkflowResult for compatibility
export type { GitBranchWorkflowResult } from '@/lib/claudeCode/git-workflow';

// Availability checking
export { checkClaudeCodeAvailability } from '@/lib/claudeCode/availability';

// Git workflow
export { initializeGitWorkflow } from '@/lib/claudeCode/git-workflow';

// Main execution
export { askClaudeCode } from '@/lib/claudeCode/orchestrator';

// Post-execution handling
export { handlePostClaudeCodeExecution } from '@/lib/claudeCode/post-execution';
export type { TaskContext } from '@/lib/claudeCode/post-execution';

// Streaming execution
export { streamClaudeCode } from '@/lib/claudeCode/stream';

// Version utilities
export { getClaudeCodeVersion } from '@/lib/claudeCode/version';
