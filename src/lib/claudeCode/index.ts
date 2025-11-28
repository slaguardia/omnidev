/**
 * Claude Code Integration - Main exports
 */

// Types
export type {
  ClaudeCodeOptions,
  ClaudeCodeResult,
  PostExecutionResult,
  GitWorkflowOptions,
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

// Version utilities
export { getClaudeCodeVersion } from '@/lib/claudeCode/version';
