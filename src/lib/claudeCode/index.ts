/**
 * Claude Code Integration - Main exports
 */

// Types
export type {
  ClaudeCodeOptions,
  ClaudeCodeResult,
  PostExecutionResult
} from '@/lib/claudeCode/types';

// Availability checking
export { checkClaudeCodeAvailability } from '@/lib/claudeCode/availability';

// Git workflow
export { initializeGitWorkflow } from '@/lib/claudeCode/git-workflow';

// Main execution
export { askClaudeCode } from '@/lib/claudeCode/orchestrator';

// Post-execution handling
export { handlePostClaudeCodeExecution } from '@/lib/claudeCode/post-execution';