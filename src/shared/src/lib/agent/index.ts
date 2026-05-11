export type {
  AgentRunRequest,
  AgentRunResult,
  AgentGitConfig,
  AgentGitResult,
  AgentArtifactConfig,
  AgentEvent,
  AgentEventBase,
  AgentAssistantMessageEvent,
  AgentThinkingEvent,
  AgentToolCallEvent,
  AgentToolResultEvent,
  AgentUsageUpdateEvent,
  AgentDoneEvent,
  AgentErrorEvent,
  AgentRunner,
  AgentRunnerOptions,
  AgentRunnerResult,
} from './types';
export { executeAgentRun } from './agent-runner';
export { collapseEventsToOutput } from './collapse';
export { CursorSdkAgent } from './cursor-sdk-agent';

// Pre-edit git workflow setup (was at @/lib/claudeCode/git-workflow).
export { initializeGitWorkflow } from './git-workflow';
export type { GitWorkflowOptions, GitBranchWorkflowResult, GitInitResult } from './git-workflow';

// Post-edit git operations: stage, commit, push, open MR/PR.
// Renamed from handlePostClaudeCodeExecution during the CLI decommission.
export { handlePostExecution } from './post-execution';
export type { TaskContext, PostExecutionResult } from './post-execution';
