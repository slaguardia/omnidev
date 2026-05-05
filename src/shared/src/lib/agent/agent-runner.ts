'use server';

/**
 * Agent runner — executes a single agent iteration.
 *
 * This module owns: git identity setup, git workflow initialization,
 * AI invocation via AgentRunner, post-execution git ops, artifact I/O,
 * question parsing, and completion signal detection.
 *
 * This module does NOT import from ralph-task-manager. It never reads or
 * writes task state. That responsibility belongs to the orchestrator.
 */

import { handlePostClaudeCodeExecution, initializeGitWorkflow } from '@/lib/claudeCode';
import type { GitInitResult } from '@/lib/managers/repository-manager';
import type { GitUrl, Result } from '@/lib/types/index';
import { parseQuestionsFromOutput } from '@/lib/workflow/prompt-template';

import { collapseEventsToOutput } from './collapse';
import type { AgentRunRequest, AgentRunResult, AgentRunner } from './types';

const LOG_PREFIX = '[AGENT]';

/**
 * Module-level agent instance, lazily initialized and shared across concurrent
 * executeAgentRun() calls.
 *
 * Sharing is SAFE because AgentRunner implementations are stateless — all
 * per-run state lives on the async iterable returned by run(). This is part
 * of the AgentRunner reentrancy contract documented on the interface in
 * ./types.ts. If a future implementation violates that contract, this
 * singleton must be replaced with a per-call factory.
 */
let defaultAgent: AgentRunner | null = null;

async function getDefaultAgent(): Promise<AgentRunner> {
  if (!defaultAgent) {
    // Lazy import to avoid circular deps at module load time
    const { ClaudeCodeAgent } = await import('@/lib/agent/claude-code-agent');
    defaultAgent = new ClaudeCodeAgent();
  }
  return defaultAgent;
}

/**
 * Execute a single agent run: git setup → AI execution → post-exec git → artifacts → signals.
 *
 * Returns a Result so callers can distinguish between a clean failure (success: false)
 * and a successful run that may carry a non-fatal error in `result.error`.
 *
 * @param agent — optional AgentRunner override. Defaults to ClaudeCodeAgent.
 */
export async function executeAgentRun(
  request: AgentRunRequest,
  agent?: AgentRunner
): Promise<Result<AgentRunResult, Error>> {
  const startTime = Date.now();
  const tag = `${request.stageName}[${request.iteration}]`;
  console.log(`${LOG_PREFIX} Starting ${tag} for task ${request.taskId}`);

  try {
    // ----- 1. Git identity setup (edit mode only) -----
    if (request.editMode && request.git) {
      const { name, email } = request.git.commitIdentity;
      if (!name || !email) {
        return {
          success: false,
          error: new Error(
            `Pre-flight failed: git commit identity not configured. ` +
              `Set Commit Name and Commit Email in Settings > Git Source Config. ` +
              `(commitName=${name || 'unset'}, commitEmail=${email || 'unset'})`
          ),
        };
      }

      const { setWorkspaceGitConfig } = await import('@/lib/git/config');
      await setWorkspaceGitConfig(request.workspacePath, {
        userName: name,
        userEmail: email,
      });
      console.log(`${LOG_PREFIX} Git identity: ${name} <${email}>`);
    }

    // ----- 2. Git workflow initialization (edit mode only) -----
    let gitInitResult: GitInitResult | undefined;
    let _effectiveSourceBranch: string | undefined;

    if (request.editMode && request.git) {
      const sourceBranch = request.git.featureBranch;
      const isDirectCommit = request.git.deliveryMethod === 'direct-commit';

      console.log(`${LOG_PREFIX} Initializing git workflow for ${tag}`, {
        featureBranch: sourceBranch,
        deliveryMethod: request.git.deliveryMethod,
        isDirectCommit,
      });

      const gitWorkflowOpts: Parameters<typeof initializeGitWorkflow>[0] = {
        workspaceId: request.workspaceId,
      };
      if (sourceBranch) {
        gitWorkflowOpts.sourceBranch = sourceBranch;
        gitWorkflowOpts.createMR = !isDirectCommit;
      }

      const initResult = await initializeGitWorkflow(gitWorkflowOpts);
      if (!initResult.success) {
        return {
          success: false,
          error: new Error(
            `Git workflow initialization failed: ${initResult.error?.message || 'Unknown error'}`
          ),
        };
      }

      gitInitResult = {
        ...initResult.data,
        mergeRequestRequired: !isDirectCommit && initResult.data.mergeRequestRequired,
      };
      _effectiveSourceBranch = initResult.data.sourceBranch;
    }

    // ----- 3. AI execution via AgentRunner -----
    // The AgentRunner is a streaming interface (AsyncIterable<AgentEvent>);
    // collapseEventsToOutput drains the stream and returns the legacy
    // { output: string } shape this orchestrator currently expects. A future
    // sub-task migrates this site to consume events directly so each event
    // can be persisted to agent_events.
    const runner = agent ?? (await getDefaultAgent());
    let output: string;
    try {
      const runResult = await collapseEventsToOutput(
        runner.run({
          question: request.prompt,
          workingDirectory: request.workspacePath,
          editRequest: request.editMode,
          extraEnv: request.extraEnv,
        })
      );
      output = runResult.output;
    } catch (runError) {
      return {
        success: false,
        error: runError instanceof Error ? runError : new Error(String(runError)),
      };
    }
    const executionTimeMs = Date.now() - startTime;
    console.log(`${LOG_PREFIX} ${tag} output (${output.length} chars) in ${executionTimeMs}ms`);

    // ----- 4. Post-execution git ops (edit mode only) -----
    let gitResult: AgentRunResult['git'];

    if (gitInitResult && request.git?.repoUrl) {
      console.log(`${LOG_PREFIX} Post-execution git ops for ${tag}`);
      try {
        const postResult = await handlePostClaudeCodeExecution(
          request.workspacePath,
          gitInitResult,
          request.git.repoUrl as GitUrl,
          undefined, // provider auto-detected
          request.git.taskContext
        );

        if (postResult.success && postResult.data) {
          gitResult = {
            pushed: postResult.data.hasChanges,
            pushedBranch: postResult.data.pushedBranch,
            commitHash: postResult.data.commitHash,
            prUrl: postResult.data.mergeRequestUrl,
          };
          console.log(`${LOG_PREFIX} Post-execution completed:`, {
            hasChanges: postResult.data.hasChanges,
            pushedBranch: postResult.data.pushedBranch,
            mergeRequestUrl: postResult.data.mergeRequestUrl,
          });
        } else if (!postResult.success) {
          console.warn(`${LOG_PREFIX} Post-execution failed:`, postResult.error?.message);
        }
      } catch (postError) {
        console.warn(`${LOG_PREFIX} Post-execution error (non-fatal):`, postError);
      }
    }

    // ----- 5. Artifact file I/O -----
    let fileOutput: string | undefined;

    if (request.artifact) {
      const { readFile, writeFile, mkdir } = await import('node:fs/promises');
      const { join, dirname } = await import('node:path');
      const artifactFullPath = join(request.workspacePath, request.artifact.relativePath);

      // For edit stages, check if Claude wrote the file directly
      if (request.editMode) {
        try {
          const claudeVersion = await readFile(artifactFullPath, 'utf-8');
          if (claudeVersion.trim()) {
            fileOutput = claudeVersion;
            console.log(
              `${LOG_PREFIX} Read Claude-written artifact ${request.artifact.relativePath} (${claudeVersion.length} chars)`
            );
          }
        } catch {
          // Claude didn't write it — we'll write the output below
        }
      }

      // Write the artifact from Claude's response output (always, for both modes)
      if (!fileOutput && output) {
        try {
          await mkdir(dirname(artifactFullPath), { recursive: true });
          await writeFile(artifactFullPath, output, 'utf-8');
          fileOutput = output;
          console.log(
            `${LOG_PREFIX} Wrote stage artifact ${request.artifact.relativePath} (${output.length} chars)`
          );
        } catch (writeErr) {
          console.warn(
            `${LOG_PREFIX} Failed to write stage artifact ${request.artifact.relativePath}:`,
            writeErr
          );
          fileOutput = output; // Still use output even if file write failed
        }
      }
    }

    // ----- 6. Question parsing -----
    let questions: string[] | undefined;
    if (request.parseQuestions) {
      const parsed = parseQuestionsFromOutput(output);
      if (parsed.length > 0) {
        questions = parsed;
      }
    }

    // ----- 7. Completion signal detection -----
    const completionSignal = output.includes('<promise>COMPLETE</promise>');

    // ----- Build result -----
    const result: AgentRunResult = {
      output,
      executionTimeMs,
      fileOutput,
      questions,
      git: gitResult,
      signals: { completionSignal },
    };

    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}
