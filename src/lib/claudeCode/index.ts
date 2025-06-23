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
export { initializeGitWorkflow } from '@/lib/claudeCode/gitWorkflow';

// Main execution
export { askClaudeCode } from '@/lib/claudeCode/execution';

// Post-execution handling
export { handlePostClaudeCodeExecution } from '@/lib/claudeCode/postExecution';

// Version utilities
export { getClaudeCodeVersion } from '@/lib/claudeCode/version'; 