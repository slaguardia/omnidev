/**
 * Job Handlers - Execution logic for each job type
 *
 * These handlers wrap existing functionality from the codebase
 * to be called by the queue worker.
 */

import type { AgentRunRequest, AgentRunner } from '@/lib/agent';
import { CursorSdkAgent } from '@/lib/agent';
import { handlePostClaudeCodeExecution, initializeGitWorkflow } from '@/lib/claudeCode';
import type { GitInitResult } from '@/lib/managers/repository-manager';
import * as WorkspaceManagerFunctions from '@/lib/managers/workspace-manager';
import type { FilePath, GitUrl, CommitHash, WorkspaceId } from '@/lib/types/index';
import type {
  ClaudeCodeJobPayload,
  ClaudeCodeJobResult,
  ClaudeCodeUsage,
  GitPushJobPayload,
  GitMRJobPayload,
  WorkspaceCleanupJobPayload,
  RalphStageJobPayload,
  RalphStageJobResult,
} from './types';

/**
 * Permission label mapping for CLI prompt instructions.
 */
const PERMISSION_DESCRIPTIONS: Record<string, string> = {
  'tasks:read': '`pnpm ralph tasks list`, `pnpm ralph tasks show <ref>`',
  'tasks:create': '`pnpm ralph tasks create -w <workspaceId> -t ... -d ...`',
  'subtasks:create': '`pnpm ralph tasks create --parent $OMNIDEV_TASK_ID ...`',
  'tasks:update': '`pnpm ralph tasks update <ref> ...`',
  'tasks:transition': '`pnpm ralph transition <ref> <status>`',
  'deps:read': '`pnpm ralph deps show <ref>`',
  'deps:write':
    '`pnpm ralph deps add <ref> <blockerRef>`, `pnpm ralph deps remove <ref> <blockerRef>`',
  'stages:run': '`pnpm ralph run-stage <ref> <stage>`',
};

/**
 * Build the CLI instruction block appended to the agent prompt when CLI is enabled.
 */
function buildCliPromptSection(taskId: string, permissions: string[]): string {
  const allowed = permissions
    .map((p) => `- **${p}**: ${PERMISSION_DESCRIPTIONS[p] ?? p}`)
    .join('\n');

  return `

---

## Omnidev CLI Access

You have access to the \`ralph\` CLI via \`pnpm ralph\` from the Omnidev repo (or \`pnpm ralph\` when \`package.json\` defines the script). Authentication is pre-configured via environment variables — do not set or modify \`OMNIDEV_CLI_TOKEN\`, \`OMNIDEV_URL\`, or \`OMNIDEV_TASK_ID\`.

Your current task ID is \`${taskId}\` (also available as \`$OMNIDEV_TASK_ID\`). Use \`<ref>\` = \`.\` when \`OMNIDEV_TASK_ID\` is set to mean this task.

### Allowed operations

${allowed}

### Usage examples

\`\`\`bash
# List all tasks
pnpm ralph tasks list

# Show this task (pass ID, RLP-N, or . when OMNIDEV_TASK_ID is set)
pnpm ralph tasks show ${taskId}
pnpm ralph tasks show .

# Run a workflow stage (e.g. decomp, executing)
pnpm ralph run-stage ${taskId} <stageName>

# Poll a queued job after run-stage
pnpm ralph job <jobId>

# Answer pending stage questions (human-in-the-loop), then run-stage again to continue
pnpm ralph stage-answer ${taskId} --stage <stageName> --answers '{"<questionId>":"..."}'

# Create a subtask of this task
pnpm ralph tasks create --parent ${taskId} -w <workspaceId> -t "Subtask title" -d "Description"

# View / edit dependencies
pnpm ralph deps show ${taskId}
pnpm ralph deps add ${taskId} <blockerRef>
\`\`\`

Operations outside your granted permissions will be rejected with a 403 error. Do not attempt to work around permission errors.`;
}

/**
 * Module-level default agent for legacy /api/ask + /api/edit jobs. Stateless;
 * safe to share across concurrent invocations per the AgentRunner reentrancy
 * contract.
 */
let queueDefaultAgent: AgentRunner | null = null;
function getQueueDefaultAgent(): AgentRunner {
  if (!queueDefaultAgent) {
    queueDefaultAgent = new CursorSdkAgent();
  }
  return queueDefaultAgent;
}

/**
 * Execute a Claude Code job
 */
export async function executeClaudeCodeJob(
  payload: ClaudeCodeJobPayload
): Promise<ClaudeCodeJobResult> {
  const startTime = Date.now();
  console.log(`[JOB] Starting Claude Code job for workspace ${payload.workspaceId}`);

  const { loadWorkspace } = await import('@/lib/managers/workspace-manager');
  const { resolveWorkspaceGitRoot } = await import('@/lib/workspace/resolve-workspace-root');
  const wsLoaded = await loadWorkspace(payload.workspaceId);
  if (!wsLoaded.success) {
    throw new Error(`Failed to load workspace: ${wsLoaded.error.message}`);
  }
  const workspaceRoot = await resolveWorkspaceGitRoot(wsLoaded.data);

  // For edit jobs, initialize git workflow inside the job so behavior is consistent
  // whether the API executed immediately or queued. This also ensures we can commit/push
  // changes to the selected branch even when no merge request is requested.
  let gitInitResult: GitInitResult | undefined;
  // effectiveSourceBranch was used to feed sourceBranch into askClaudeCode;
  // the streaming AgentRunner contract has no equivalent (the workspace
  // branch is set out-of-band by the git workflow init below).
  let _effectiveSourceBranch = payload.sourceBranch;

  const isEditJob = payload.editRequest ?? false;

  // For non-edit (ask) jobs, switch to the default/target branch (unless a specific branch
  // is specified) and pull latest changes to ensure we're querying up-to-date code
  if (!isEditJob) {
    console.log(
      `[JOB] 🔄 Preparing workspace for ask job - switching to target branch and pulling latest...`
    );
    const prepStart = Date.now();

    try {
      const { switchBranch, pullChanges, loadAllWorkspacesFromStorage } = await import(
        '@/lib/managers/repository-manager'
      );
      const { getAllRemoteBranches } = await import('@/lib/git/branches');

      // Ensure workspaces are loaded into memory
      await loadAllWorkspacesFromStorage();

      // Determine the target branch: use sourceBranch if specified, otherwise use workspace's target branch
      let targetBranch = payload.sourceBranch;
      if (!targetBranch && wsLoaded.data.targetBranch) {
        targetBranch = wsLoaded.data.targetBranch;
        console.log(`[JOB] 📌 Using workspace target branch: ${targetBranch}`);
      }

      // Validate the branch exists before attempting to switch
      if (targetBranch) {
        console.log(`[JOB] 🔍 Validating branch exists: ${targetBranch}`);
        const branchesResult = await getAllRemoteBranches(workspaceRoot);

        if (branchesResult.success) {
          const availableBranches = branchesResult.data;
          const branchExists = availableBranches.some(
            (b) => b === targetBranch || b === `origin/${targetBranch}`
          );

          if (!branchExists) {
            console.error(
              `[JOB] ❌ Branch '${targetBranch}' does not exist. Available branches: ${availableBranches.slice(0, 10).join(', ')}${availableBranches.length > 10 ? '...' : ''}`
            );
            throw new Error(
              `Branch '${targetBranch}' does not exist in the repository. Available branches: ${availableBranches.slice(0, 5).join(', ')}${availableBranches.length > 5 ? ` and ${availableBranches.length - 5} more` : ''}`
            );
          }
          console.log(`[JOB] ✅ Branch '${targetBranch}' exists`);
        } else {
          console.warn(
            `[JOB] ⚠️ Could not validate branch existence:`,
            branchesResult.error?.message
          );
          // Continue anyway - switchBranch will fail if branch doesn't exist
        }

        // Switch to the target branch (without updating workspace config - this is a temporary switch)
        console.log(`[JOB] 📌 Switching to branch: ${targetBranch}`);
        const switchResult = await switchBranch(payload.workspaceId, targetBranch, false);
        if (!switchResult.success) {
          throw new Error(
            `Failed to switch to branch '${targetBranch}': ${switchResult.error?.message}`
          );
        }
      }

      // Pull latest changes using existing repository-manager function
      console.log(`[JOB] 🔄 Pulling latest changes...`);
      const pullResult = await pullChanges(payload.workspaceId);
      const prepTime = Date.now() - prepStart;

      if (!pullResult.success) {
        console.warn(
          `[JOB] ⚠️ Failed to pull latest changes in ${prepTime}ms:`,
          pullResult.error?.message
        );
        // Continue anyway - we'll work with whatever code is there
      } else {
        console.log(`[JOB] ✅ Workspace prepared in ${prepTime}ms`);
      }
    } catch (error) {
      const prepTime = Date.now() - prepStart;
      // Re-throw branch validation errors - these should fail the job
      if (
        error instanceof Error &&
        (error.message.includes('does not exist') || error.message.includes('Failed to switch'))
      ) {
        console.error(`[JOB] ❌ Branch error in ${prepTime}ms:`, error.message);
        throw error;
      }
      console.warn(`[JOB] ⚠️ Failed to prepare workspace in ${prepTime}ms:`, error);
      // Continue anyway for other errors - we'll work with whatever code is there
    }
  }

  if (isEditJob) {
    console.log(`[JOB] 🔄 Initializing git workflow for edit job...`);
    const gitInitStart = Date.now();

    const initResult = await initializeGitWorkflow({
      workspaceId: payload.workspaceId,
      ...(payload.sourceBranch ? { sourceBranch: payload.sourceBranch } : {}),
      ...(payload.createMR !== undefined ? { createMR: payload.createMR } : {}),
    });

    const gitInitTime = Date.now() - gitInitStart;

    if (!initResult.success) {
      const gitInitError = initResult.error?.message || 'Unknown git workflow error';
      console.error(
        `[JOB] ❌ Git workflow initialization failed in ${gitInitTime}ms:`,
        gitInitError
      );
      // Fail the job immediately - continuing without git automation would leave changes uncommitted
      throw new Error(
        `Git workflow initialization failed: ${gitInitError}. ` +
          `This prevents orphaned changes in the workspace.`
      );
    } else {
      // Only create merge requests when explicitly requested.
      // We still want commit+push behavior for edit jobs even when createMR=false.
      gitInitResult = {
        ...initResult.data,
        mergeRequestRequired: Boolean(payload.createMR) && initResult.data.mergeRequestRequired,
      };
      _effectiveSourceBranch = initResult.data.sourceBranch;
      console.log(`[JOB] ✅ Git workflow initialized in ${gitInitTime}ms`, {
        mergeRequestRequired: gitInitResult.mergeRequestRequired,
        sourceBranch: initResult.data.sourceBranch,
        targetBranch: initResult.data.targetBranch,
      });
    }
  }

  // Build the question, optionally prefixed with caller-provided context.
  // The legacy askClaudeCode handled this concatenation internally; the
  // streaming AgentRunner contract takes a single `question` string so
  // we inline it here.
  const question = payload.context
    ? `${payload.question}\n\nContext: ${payload.context}`
    : payload.question;

  // Drive the streaming AgentRunner directly. /api/ask + /api/edit do not
  // create an agent_runs row (file-based queue, separate from Ralph + V2),
  // so events are not persisted — the legacy file-based ClaudeCodeJobResult
  // is the only durable artifact.
  const agent = getQueueDefaultAgent();
  let output = '';
  let usage: ClaudeCodeUsage | undefined;

  try {
    for await (const event of agent.run({
      question,
      workingDirectory: workspaceRoot,
      editRequest: isEditJob,
    })) {
      if (event.type === 'assistant_message') {
        output += event.text;
      } else if (event.type === 'usage_update') {
        usage = {
          inputTokens: event.inputTokens,
          outputTokens: event.outputTokens,
        };
      } else if (event.type === 'error') {
        throw new Error(event.message);
      }
    }
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err));
  }

  const executionTimeMs = Date.now() - startTime;

  console.log(`[JOB] Claude Code job completed in ${executionTimeMs}ms`);

  let postExecution: ClaudeCodeJobResult['postExecution'] | undefined;

  // Handle post-execution git operations if needed
  if (gitInitResult && payload.repoUrl) {
    console.log(`[JOB] Processing post-execution git operations...`);

    try {
      const postResult = await handlePostClaudeCodeExecution(
        workspaceRoot,
        gitInitResult,
        payload.repoUrl as GitUrl,
        undefined, // provider - auto-detected from URL
        payload.taskContext
      );

      if (postResult.success) {
        if (postResult.data) {
          const pe: NonNullable<ClaudeCodeJobResult['postExecution']> = {
            hasChanges: postResult.data.hasChanges,
          };
          if (postResult.data.commitHash) pe.commitHash = postResult.data.commitHash;
          if (postResult.data.mergeRequestUrl) pe.mergeRequestUrl = postResult.data.mergeRequestUrl;
          if (postResult.data.pushedBranch) pe.pushedBranch = postResult.data.pushedBranch;
          postExecution = pe;

          // After edit flow completes, always switch back to target branch and update
          // the workspace commitHash to reflect the target branch's HEAD, not the working branch
          try {
            const { updateWorkspace, switchBranch, pullChanges } = await import(
              '@/lib/managers/repository-manager'
            );
            const { getCurrentCommitHash } = await import('@/lib/git/commits');

            console.log(
              `[JOB] 🔄 Resetting workspace to target branch: ${gitInitResult.targetBranch}`
            );

            // Switch back to target branch
            const switchResult = await switchBranch(
              payload.workspaceId,
              gitInitResult.targetBranch
            );
            if (!switchResult.success) {
              console.warn(
                `[JOB] ⚠️ Failed to switch to target branch: ${switchResult.error?.message}`
              );
            } else {
              // Pull latest changes to ensure we have the most recent commit
              const pullResult = await pullChanges(payload.workspaceId);
              if (!pullResult.success) {
                console.warn(
                  `[JOB] ⚠️ Failed to pull latest changes: ${pullResult.error?.message}`
                );
              }
            }

            // Get the current commit hash from the target branch
            const commitHashResult = await getCurrentCommitHash(workspaceRoot);
            if (!commitHashResult.success) {
              console.warn(
                `[JOB] ⚠️ Failed to get commit hash: ${commitHashResult.error?.message}`
              );
            } else if (commitHashResult.data) {
              const targetBranchCommitHash = commitHashResult.data;

              const updateResult = await updateWorkspace(payload.workspaceId, {
                metadata: { commitHash: targetBranchCommitHash as CommitHash },
              });

              if (updateResult.success) {
                // Persist to disk
                await WorkspaceManagerFunctions.saveWorkspace(updateResult.data);
                console.log(
                  `[JOB] ✅ Workspace reset to ${gitInitResult.targetBranch}, commitHash: ${targetBranchCommitHash.substring(0, 7)}`
                );
              }
            }
          } catch (updateError) {
            console.warn(`[JOB] ⚠️ Failed to reset workspace to target branch:`, updateError);
            // Don't fail the job, just log the warning
          }
        } else {
          postExecution = undefined;
        }
        console.log(`[JOB] Post-execution completed:`, {
          hasChanges: postResult.data?.hasChanges,
          mergeRequestUrl: postResult.data?.mergeRequestUrl,
          pushedBranch: postResult.data?.pushedBranch,
        });
      } else {
        console.warn(`[JOB] Post-execution failed:`, postResult.error?.message);
      }
    } catch (error) {
      console.error(`[JOB] Post-execution error:`, error);
      // Don't fail the job, just log the error
    }
  }

  const jobResult: ClaudeCodeJobResult = {
    output,
    executionTimeMs,
  };

  if (gitInitResult) {
    jobResult.gitInitResult = gitInitResult;
  }
  if (postExecution) {
    jobResult.postExecution = postExecution;
  }
  if (usage) {
    jobResult.usage = usage;
    console.log(`[JOB] ✅ Captured usage:`, {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    });
  }
  // jsonLogs / rawOutput are no longer populated — they were Claude Code
  // CLI-specific artifacts. The streaming AgentEvent timeline replaces
  // them; for /api/ask + /api/edit the file-queue payload is the durable
  // record. Existing UI consumers (ExternalTaskingHistoryTab) gracefully
  // hide these fields when undefined.

  return jobResult;
}

/**
 * Execute a git push job
 */
export async function executeGitPushJob(payload: GitPushJobPayload): Promise<{ success: boolean }> {
  console.log(`[JOB] Starting git push job for branch ${payload.branch}`);

  // Import git operations dynamically to avoid circular dependencies
  const { pushChanges } = await import('@/lib/git/remotes');

  const result = await pushChanges(payload.workspacePath as FilePath, payload.branch);

  if (!result.success) {
    throw new Error(result.error?.message || 'Git push failed');
  }

  console.log(`[JOB] Git push completed for branch ${payload.branch}`);
  return { success: true };
}

/**
 * Execute a merge request creation job
 */
export async function executeGitMRJob(
  payload: GitMRJobPayload
): Promise<{ mergeRequestUrl: string | undefined }> {
  console.log(`[JOB] Starting MR creation job`);

  // Use post-execution handler which already handles MR creation
  const result = await handlePostClaudeCodeExecution(
    payload.workspacePath as FilePath,
    payload.gitInitResult as GitInitResult,
    payload.repoUrl as GitUrl
  );

  if (!result.success) {
    throw new Error(result.error?.message || 'MR creation failed');
  }

  console.log(`[JOB] MR creation completed:`, result.data?.mergeRequestUrl);
  return { mergeRequestUrl: result.data?.mergeRequestUrl };
}

/**
 * Execute a workspace cleanup job
 */
export async function executeWorkspaceCleanupJob(
  payload: WorkspaceCleanupJobPayload
): Promise<{ success: boolean }> {
  console.log(`[JOB] Starting workspace cleanup for ${payload.workspaceId}`);

  // Import cleanup function dynamically
  const { cleanupWorkspace } = await import('@/lib/workspace/cleanup');

  const result = await cleanupWorkspace(payload.workspaceId);

  // cleanupWorkspace throws on error, so if we get here it succeeded
  console.log(`[JOB] Workspace cleanup completed for ${payload.workspaceId}:`, result.message);
  return { success: true };
}
// ============================================================================
// Generic Stage Execution Job Handler
// ============================================================================

/**
 * Execute a Ralph generic stage job.
 *
 * Orchestration responsibilities (stays here):
 * 1. Load task, check auto-loop cancellation
 * 2. Build effective prompt with continuation context
 * 3. Construct AgentRunRequest from payload + task
 * 4. Call executeAgentRun(request)  — the only execution step
 * 5. Interpret AgentRunResult → task state updates
 * 6. Handle auto-loop / auto-advance decisions
 */
export async function executeRalphStageJob(
  payload: RalphStageJobPayload,
  jobId?: string,
  runId?: string,
  signal?: AbortSignal
): Promise<RalphStageJobResult> {
  const startTime = Date.now();
  console.log(
    `[JOB] Starting Ralph stage job: ${payload.stageName} for task ${payload.taskId}, iteration ${payload.iteration}`
  );

  try {
    const { getRalphTask, updateRalphTask, resolveBaseBranch } = await import(
      '@/lib/managers/ralph-task-manager'
    );
    const { executeAgentRun } = await import('@/lib/agent');

    // ---- 1. Load task ----
    const taskResult = await getRalphTask(payload.taskId);
    if (!taskResult.success) {
      throw new Error(`Failed to load task: ${taskResult.error?.message}`);
    }

    const task = taskResult.data;

    // Auto-loop cancellation check: if this is a continuation iteration and the loop
    // has been cancelled (autoLoopActive === false), skip execution
    if (payload.autoLoop && payload.iteration > 1) {
      const existingOutput = task.stageOutputs?.[payload.stageName];
      if (existingOutput && existingOutput.autoLoopActive === false) {
        console.log(
          `[JOB] Auto-loop cancelled for ${payload.stageName} iteration ${payload.iteration}, skipping`
        );
        return {
          taskId: payload.taskId,
          stageName: payload.stageName,
          iteration: payload.iteration,
          output: '',
          executionTimeMs: Date.now() - startTime,
          error: 'Auto-loop cancelled',
        };
      }
    }

    // ---- 2. Build effective prompt ----
    let effectivePrompt = payload.prompt;

    if (payload.iteration > 1) {
      const existingOutput = task.stageOutputs?.[payload.stageName];
      const priorArtifact = existingOutput?.fileOutput;

      console.log(
        `[JOB] Continuation prompt debug for ${payload.stageName} iteration ${payload.iteration}:`,
        {
          hasExistingOutput: !!existingOutput,
          hasPriorArtifact: !!priorArtifact,
          priorArtifactLength: priorArtifact?.length ?? 0,
          pendingQuestionsCount: existingOutput?.pendingQuestions?.length ?? 0,
          answeredQuestionsCount:
            existingOutput?.pendingQuestions?.filter((q) => q.answer)?.length ?? 0,
          pendingQuestions: existingOutput?.pendingQuestions?.map((q) => ({
            id: q.id,
            question: q.question.substring(0, 50),
            hasAnswer: !!q.answer,
            answerPreview: q.answer?.substring(0, 50),
          })),
        }
      );

      const parts: string[] = [];

      if (payload.autoLoop) {
        parts.push(`# Auto-Loop Iteration ${payload.iteration} of ${payload.maxIterations}`);
      } else {
        parts.push(`# Continuation — Iteration ${payload.iteration}`);
      }
      parts.push('');

      // Include answered questions FIRST so the agent sees them before the analysis
      const answeredQuestions =
        !payload.autoLoop && existingOutput
          ? existingOutput.pendingQuestions.filter(
              (q): q is typeof q & { answer: string } => !!q.answer
            )
          : [];

      if (answeredQuestions.length > 0) {
        parts.push('## Answers to Your Previous Questions');
        parts.push('');
        parts.push(
          'The user has answered your questions from the previous iteration. ' +
            'Incorporate these answers into your updated analysis. ' +
            'Do NOT re-ask these questions.'
        );
        parts.push('');
        for (const q of answeredQuestions) {
          parts.push(`**Q:** ${q.question}`);
          parts.push(`**A:** ${q.answer}`);
          parts.push('');
        }
      }

      // Inject previous artifact content directly into the prompt. Questions
      // are now communicated via the request_clarification MCP tool, not via
      // QUESTION: text lines, so the artifact never contains them and no
      // stripping is needed.
      if (priorArtifact) {
        parts.push('## Your Previous Analysis');
        parts.push('');
        parts.push(
          'Below is your output from the previous iteration. ' +
            'Use it as a starting point — incorporate what is still valid, improve what needs updating, ' +
            'and produce a complete updated analysis.'
        );
        parts.push('');
        parts.push('---');
        parts.push(priorArtifact.trim());
        parts.push('---');
        parts.push('');
      }

      parts.push('## Task Prompt');
      parts.push(payload.prompt);

      effectivePrompt = parts.join('\n');
      console.log(
        `[JOB] Effective prompt for iteration ${payload.iteration}: ${effectivePrompt.length} chars, first 500:`,
        effectivePrompt.substring(0, 500)
      );
    }

    // ---- 3. Construct AgentRunRequest ----
    const isEditMode = payload.editRequest ?? false;

    let gitConfig: AgentRunRequest['git'];
    if (isEditMode && payload.repoUrl) {
      // Resolve commit identity from app config
      const { getConfig } = await import('@/lib/config/server-actions');
      const appConfig = await getConfig();
      const commitName = appConfig.gitlab?.commitName || appConfig.github?.commitName || '';
      const commitEmail = appConfig.gitlab?.commitEmail || appConfig.github?.commitEmail || '';

      // Branch for git init / agent: MR → feature branch (or ralph/{taskId}); direct-commit → target branch only
      let featureBranch = task.featureBranch ?? undefined;
      const delivery = task.deliveryMethod ?? 'merge-request';
      if (delivery === 'direct-commit') {
        const { loadWorkspace } = await import('@/lib/managers/workspace-manager');
        const wsResult = await loadWorkspace(task.workspaceId as WorkspaceId);
        const target = wsResult.success ? wsResult.data.targetBranch : undefined;
        featureBranch = resolveBaseBranch(task, target);
        console.log(
          `[JOB] Direct commit: using target branch '${featureBranch}' for git workflow (task ${payload.taskId})`
        );
      } else if (!featureBranch) {
        featureBranch = `ralph/${payload.taskId}`;
        console.warn(
          `[JOB] ⚠️ Task ${payload.taskId} has deliveryMethod=merge-request but no featureBranch — using fallback: ${featureBranch}`
        );
      }

      gitConfig = {
        featureBranch,
        repoUrl: payload.repoUrl,
        deliveryMethod: task.deliveryMethod ?? 'merge-request',
        commitIdentity: { name: commitName, email: commitEmail },
        taskContext: { id: payload.taskId, title: task.title },
      };
    }

    // ---- 3b. Generate scoped CLI token if configured ----
    let extraEnv: Record<string, string> | undefined;
    if (payload.cli?.enabled && jobId) {
      const { generateStageToken } = await import('@/lib/auth/stage-tokens');
      const rawToken = await generateStageToken({
        jobId,
        taskId: payload.taskId,
        permissions: payload.cli.permissions as import('@/lib/types/index').CliPermission[],
      });
      const baseUrl = process.env.OMNIDEV_URL ?? `http://localhost:${process.env.PORT ?? '3000'}`;
      extraEnv = {
        OMNIDEV_CLI_TOKEN: rawToken,
        OMNIDEV_URL: baseUrl,
        OMNIDEV_TASK_ID: payload.taskId,
      };
      console.log(
        `[JOB] Generated scoped CLI token for job ${jobId} (permissions: ${payload.cli.permissions.join(', ')})`
      );

      // Append CLI usage instructions to the prompt
      effectivePrompt += buildCliPromptSection(payload.taskId, payload.cli.permissions);
    }

    const { loadWorkspace: loadWsForStage } = await import('@/lib/managers/workspace-manager');
    const { resolveWorkspaceGitRoot: resolveRootForStage } = await import(
      '@/lib/workspace/resolve-workspace-root'
    );
    const wsStage = await loadWsForStage(payload.workspaceId);
    if (!wsStage.success) {
      throw new Error(`Failed to load workspace: ${wsStage.error.message}`);
    }
    const workspaceRootForStage = await resolveRootForStage(wsStage.data);

    const agentRequest: AgentRunRequest = {
      taskId: payload.taskId,
      stageName: payload.stageName,
      iteration: payload.iteration,
      prompt: effectivePrompt,
      workspacePath: workspaceRootForStage,
      workspaceId: payload.workspaceId,
      editMode: isEditMode,
      git: gitConfig,
      artifact: {
        relativePath: `.ralph/tasks/${payload.taskId}/${payload.stageName}.md`,
      },
      parseQuestions: payload.returnQuestions,
      extraEnv,
      runId,
      signal,
    };

    // ---- 4. Execute agent ----
    const agentResult = await executeAgentRun(agentRequest);

    const executionTimeMs = Date.now() - startTime;

    // ---- 5. Interpret result → task state updates ----
    if (!agentResult.success) {
      const errorMsg = agentResult.error?.message || 'Stage execution failed';
      console.error(`[JOB] Stage execution failed:`, errorMsg);

      // Store error iteration
      const existingOutput = task.stageOutputs?.[payload.stageName];
      const errorIteration = {
        iteration: payload.iteration,
        output: '',
        executionTimeMs,
        completedAt: new Date().toISOString(),
        error: errorMsg,
      };

      const updatedErrorStageOutput = {
        prompt: existingOutput?.prompt ?? payload.prompt,
        currentIteration: payload.iteration,
        maxIterations: payload.maxIterations,
        returnQuestions: payload.returnQuestions,
        iterations: [...(existingOutput?.iterations ?? []), errorIteration],
        pendingQuestions: existingOutput?.pendingQuestions ?? [],
        fileOutput: existingOutput?.fileOutput,
        activeJobId: undefined as string | undefined,
        lastUpdated: new Date().toISOString(),
        autoLoopActive: payload.autoLoop ? false : (undefined as boolean | undefined),
        completionReason: 'error' as const,
      };

      await updateRalphTask(payload.taskId, {
        executionError: errorMsg,
        stageOutputs: {
          ...task.stageOutputs,
          [payload.stageName]: updatedErrorStageOutput,
        },
      });

      return {
        taskId: payload.taskId,
        stageName: payload.stageName,
        iteration: payload.iteration,
        output: '',
        executionTimeMs,
        error: errorMsg,
      };
    }

    const {
      output,
      fileOutput,
      questions: parsedQuestions,
      git: gitResult,
      signals,
    } = agentResult.data;

    // Update task with git results (feature branch, PR URL) if applicable
    if (gitResult) {
      const taskUpdates: Record<string, unknown> = {};
      if (gitConfig?.featureBranch) {
        taskUpdates.featureBranch = gitConfig.featureBranch;
        // baseBranch comes from the git workflow init, but we don't have it directly.
        // The agent doesn't expose it in the result — task already has baseBranch set by stage-runner.
      }
      if (gitResult.prUrl) {
        taskUpdates.prUrl = gitResult.prUrl;
      }
      if (Object.keys(taskUpdates).length > 0) {
        await updateRalphTask(payload.taskId, taskUpdates);
      }
    }

    // Build stage iteration record
    const iterationRecord: {
      iteration: number;
      output: string;
      questions?: { id: string; question: string }[];
      executionTimeMs: number;
      completedAt: string;
    } = {
      iteration: payload.iteration,
      output,
      executionTimeMs,
      completedAt: new Date().toISOString(),
    };

    if (parsedQuestions) {
      iterationRecord.questions = parsedQuestions.map((q, i) => ({
        id: `sq-${Date.now()}-${i}`,
        question: q,
      }));
    }

    // Build pending questions from this iteration
    const newPendingQuestions = (iterationRecord.questions ?? []).map((q) => ({
      id: q.id,
      question: q.question,
    }));

    // Update stageOutputs on the task (clear activeJobId since job is done)
    const existingOutput = task.stageOutputs?.[payload.stageName];

    // ---- 6. Handle auto-loop / auto-advance ----
    type CompletionReason = 'complete' | 'max-iterations' | 'error' | 'questions' | 'cancelled';
    let nextActiveJobId: string | undefined;
    let autoLoopActive: boolean | undefined;
    let completionReasonValue: CompletionReason | undefined;

    if (payload.autoLoop) {
      const atMaxIterations = payload.iteration >= payload.maxIterations;
      const hasQuestions = (parsedQuestions?.length ?? 0) > 0;

      if (signals.completionSignal) {
        completionReasonValue = 'complete';
      } else if (atMaxIterations) {
        completionReasonValue = 'max-iterations';
      } else if (hasQuestions) {
        completionReasonValue = 'questions';
      }

      if (completionReasonValue) {
        // Stop the loop
        autoLoopActive = false;
        console.log(
          `[JOB] Auto-loop stopping for ${payload.stageName}: ${completionReasonValue} (iteration ${payload.iteration})`
        );
      } else {
        // Continue: enqueue next iteration into SQLite
        const { nanoid } = await import('nanoid');
        const { dbCreateJob } = await import('@/lib/managers/ralph-task-db');
        const nextPayload: RalphStageJobPayload = {
          ...payload,
          iteration: payload.iteration + 1,
        };
        const nextJobId = nanoid(10);
        const now = new Date().toISOString();
        await dbCreateJob({
          id: nextJobId,
          task_id: payload.taskId,
          agent_type: 'ralph-stage',
          status: 'pending',
          payload: JSON.stringify(nextPayload),
          result: null,
          error: null,
          started_at: null,
          heartbeat_at: null,
          created_at: now,
          updated_at: now,
        });
        nextActiveJobId = nextJobId;
        autoLoopActive = true;
        console.log(
          `[JOB] Auto-loop continuing: enqueued iteration ${payload.iteration + 1} as job ${nextJobId}`
        );
      }
    }

    // For manual (non-auto-loop) continuation iterations, the new iteration
    // is a strict superset of the previous one (it includes the prior output +
    // answered questions in its prompt context). Replace rather than append so
    // the user isn't left with a stale, uninformed first iteration.
    const isManualContinuation = !payload.autoLoop && payload.iteration > 1;
    const updatedIterations = isManualContinuation
      ? [iterationRecord]
      : [...(existingOutput?.iterations ?? []), iterationRecord];

    const updatedStageOutput = {
      prompt: existingOutput?.prompt ?? payload.prompt,
      currentIteration: payload.iteration,
      maxIterations: payload.maxIterations,
      returnQuestions: payload.returnQuestions,
      iterations: updatedIterations,
      pendingQuestions: newPendingQuestions,
      activeJobId: nextActiveJobId,
      autoLoopActive,
      completionReason: completionReasonValue,
      // Store the canonical artifact from .ralph/{stageName}.md — this is what
      // subsequent stages consume via {previousStageOutput}, not raw iteration
      // output. Questions flow through the request_clarification MCP tool now
      // (see mcp-signals-server.ts) so the artifact carries no QUESTION: lines.
      fileOutput: fileOutput ? fileOutput.trim() : existingOutput?.fileOutput,
      lastUpdated: new Date().toISOString(),
    };

    await updateRalphTask(payload.taskId, {
      executionError: null,
      stageOutputs: {
        ...task.stageOutputs,
        [payload.stageName]: updatedStageOutput,
      },
    });

    // Auto-advance: if stage completed and task has a playbook, move to next stage
    if (
      payload.autoLoop &&
      completionReasonValue &&
      (completionReasonValue === 'complete' || completionReasonValue === 'max-iterations')
    ) {
      try {
        const { getNextPlaybookStage, transitionRalphTask: transitionTask } = await import(
          '@/lib/managers/ralph-task-manager'
        );
        const { nextStage } = await getNextPlaybookStage(payload.taskId, payload.stageName);

        if (nextStage) {
          // Loop to handle no-prompt stages (fast-forward through them)
          let targetStage: string | null = nextStage;
          while (targetStage && targetStage !== 'complete') {
            await transitionTask(
              payload.taskId,
              targetStage,
              `Playbook auto-advance from ${payload.stageName}`
            );

            const { startStageRun } = await import('@/lib/ralph/stage-runner');
            const runResult = await startStageRun(payload.taskId, targetStage);

            if (runResult.skipped) {
              // No-prompt stage — advance past it
              const next = await getNextPlaybookStage(payload.taskId, targetStage);
              targetStage = next.nextStage;
            } else {
              break; // Stage is running or errored, stop here
            }
          }

          if (targetStage === 'complete') {
            await transitionTask(payload.taskId, 'complete', 'Playbook pipeline completed');
          }
        }
      } catch (advanceError) {
        // Non-fatal: stage completed successfully, auto-advance just failed
        console.error(`[JOB] Auto-advance error (non-fatal):`, advanceError);
      }
    }

    console.log(`[JOB] Ralph stage job completed in ${executionTimeMs}ms`);

    const jobResult: RalphStageJobResult = {
      taskId: payload.taskId,
      stageName: payload.stageName,
      iteration: payload.iteration,
      output,
      executionTimeMs,
    };
    if (parsedQuestions) {
      jobResult.questions = parsedQuestions;
    }
    return jobResult;
  } catch (error) {
    const executionTimeMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[JOB] Ralph stage job failed:`, errorMessage);

    // Always update task state on failure: record error in executionError,
    // stop auto-loop if active, and keep activeJobId so the UI can fetch
    // the failed job's status (shows "Job failed" instead of "Starting...")
    try {
      const { getRalphTask: getTask, updateRalphTask: updateTask } = await import(
        '@/lib/managers/ralph-task-manager'
      );
      const currentTask = await getTask(payload.taskId);
      if (currentTask.success) {
        const currentStageOutput = currentTask.data.stageOutputs?.[payload.stageName];
        const taskUpdates: Record<string, unknown> = {
          executionError: errorMessage,
        };

        if (currentStageOutput) {
          taskUpdates.stageOutputs = {
            ...currentTask.data.stageOutputs,
            [payload.stageName]: {
              ...currentStageOutput,
              autoLoopActive: payload.autoLoop ? false : currentStageOutput.autoLoopActive,
              completionReason: 'error' as const,
              lastUpdated: new Date().toISOString(),
              // Keep activeJobId — the failed job record still exists in the queue,
              // and the UI enrichment uses it to show "Job failed" with the error message
            },
          };
        }

        await updateTask(payload.taskId, taskUpdates);
      }
    } catch (updateError) {
      console.error(`[JOB] Failed to update task error state:`, updateError);
    }

    return {
      taskId: payload.taskId,
      stageName: payload.stageName,
      iteration: payload.iteration,
      output: '',
      executionTimeMs,
      error: errorMessage,
    };
  }
}
