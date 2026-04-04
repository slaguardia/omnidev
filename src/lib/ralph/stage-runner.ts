/**
 * Stage Runner — reusable logic for starting a stage execution.
 *
 * Extracted from run-stage/route.ts so both the API route and
 * job-handlers (auto-advance) can trigger stage runs.
 */

import {
  getRalphTask,
  getRalphPlaybook,
  updateRalphTask,
  transitionRalphTask,
  resolveBaseBranch,
  resolvePrTargetBranch,
} from '@/lib/managers/ralph-task-manager';
import { loadWorkspace } from '@/lib/managers/workspace-manager';
import { dbCreateJob, type RalphJob } from '@/lib/managers/ralph-task-db';
import { nanoid } from 'nanoid';
import { loadWorkflowDefinition } from '@/lib/managers/workflow-definition-manager';
import { DEFAULT_WORKFLOW_DEFINITION, findStageDefinition, isEditStage } from '@/lib/workflow';
import { resolvePromptTemplate } from '@/lib/workflow';
import { switchBranch, getLocalBranches } from '@/lib/git/branches';
import { pullChanges } from '@/lib/managers/repository-manager';
import type { WorkspaceId, FilePath } from '@/lib/types/index';
import type { RalphStageJobPayload } from '@/lib/queue/types';

export interface StartStageRunResult {
  jobId?: string;
  skipped?: boolean;
  error?: string;
  statusCode?: number;
}

/**
 * Start a stage run for a task. Handles:
 * - Loading workflow definition + finding stage
 * - Loading task + workspace
 * - Edit-mode branch creation
 * - Transitioning task to stage
 * - Resolving prompt (returns skipped if no prompt)
 * - Duplicate auto-loop guard
 * - Enqueueing job + writing activeJobId
 */
export async function startStageRun(
  taskId: string,
  stageName: string,
  options?: { promptOverride?: string }
): Promise<StartStageRunResult> {
  // Load workflow definition
  const defResult = await loadWorkflowDefinition();
  const definition = defResult.success ? defResult.data : DEFAULT_WORKFLOW_DEFINITION;
  const stageDef = findStageDefinition(definition, stageName);

  if (!stageDef) {
    return {
      error: `Unknown stage: '${stageName}'. Valid stages: ${definition.stages.map((s) => s.id).join(', ')}`,
      statusCode: 400,
    };
  }

  // Get the task
  const taskResult = await getRalphTask(taskId);
  if (!taskResult.success) {
    const notFound = taskResult.error.message.includes('not found');
    return { error: taskResult.error.message, statusCode: notFound ? 404 : 500 };
  }

  const task = taskResult.data;

  // Load workspace
  const workspaceResult = await loadWorkspace(task.workspaceId as WorkspaceId);
  if (!workspaceResult.success) {
    return {
      error: `Failed to load workspace: ${workspaceResult.error.message}`,
      statusCode: 500,
    };
  }

  const workspace = workspaceResult.data;
  const workspacePath = workspace.path as FilePath;

  // Pull latest from remote before any branch operations
  const baseBranchForPull = resolveBaseBranch(task, workspace.targetBranch);
  console.log(
    `[STAGE-RUNNER] Pulling latest for workspace ${task.workspaceId}, base branch '${baseBranchForPull}'`
  );
  try {
    const switchToBaseResult = await switchBranch(workspacePath, baseBranchForPull);
    if (switchToBaseResult.success) {
      const pullResult = await pullChanges(task.workspaceId as WorkspaceId);
      if (!pullResult.success) {
        console.warn(
          `[STAGE-RUNNER] Failed to pull latest changes: ${pullResult.error?.message}. Continuing with existing code.`
        );
      } else {
        console.log(`[STAGE-RUNNER] Pulled latest changes on '${baseBranchForPull}'`);
      }
    } else {
      console.warn(
        `[STAGE-RUNNER] Failed to switch to base branch '${baseBranchForPull}' for pull: ${switchToBaseResult.error?.message}. Continuing with existing code.`
      );
    }
  } catch (error) {
    console.warn(
      `[STAGE-RUNNER] Error during pre-stage pull: ${error instanceof Error ? error.message : error}. Continuing with existing code.`
    );
  }

  // If edit mode: MR tasks get a feature branch; direct-commit stays on the target branch only
  if (isEditStage(definition, stageName)) {
    const baseBranch = resolveBaseBranch(task, workspace.targetBranch);
    const isDirectCommit = (task.deliveryMethod ?? 'merge-request') === 'direct-commit';

    if (isDirectCommit) {
      console.log(
        `[STAGE-RUNNER] Direct commit: switching workspace to target branch '${baseBranch}' for edit stage '${stageName}'`
      );
      const switchResult = await switchBranch(workspacePath, baseBranch);
      if (!switchResult.success) {
        return {
          error: `Failed to switch to branch '${baseBranch}' for direct commit: ${switchResult.error.message}`,
          statusCode: 500,
        };
      }
      const branchUpdateResult = await updateRalphTask(taskId, {
        baseBranch,
        featureBranch: null,
        prTargetBranch: null,
      });
      if (!branchUpdateResult.success) {
        return {
          error: `Failed to persist branch fields: ${branchUpdateResult.error.message}`,
          statusCode: 500,
        };
      }
    } else {
      const featureBranch = task.featureBranch || `ralph/${taskId}`;

      if (!task.featureBranch) {
        console.log(
          `[STAGE-RUNNER] Creating branch '${featureBranch}' from '${baseBranch}' for edit stage '${stageName}'`
        );

        const localBranchesResult = await getLocalBranches(workspacePath);
        const branchExists =
          localBranchesResult.success && localBranchesResult.data.includes(featureBranch);

        if (!branchExists) {
          const switchToBaseResult = await switchBranch(workspacePath, baseBranch);
          if (!switchToBaseResult.success) {
            return {
              error: `Failed to switch to base branch '${baseBranch}': ${switchToBaseResult.error.message}`,
              statusCode: 500,
            };
          }

          const createBranchResult = await switchBranch(workspacePath, featureBranch);
          if (!createBranchResult.success) {
            return {
              error: `Failed to create feature branch '${featureBranch}': ${createBranchResult.error.message}`,
              statusCode: 500,
            };
          }
        } else {
          const switchResult = await switchBranch(workspacePath, featureBranch);
          if (!switchResult.success) {
            return {
              error: `Failed to switch to existing branch '${featureBranch}': ${switchResult.error.message}`,
              statusCode: 500,
            };
          }
        }

        const branchUpdateResult = await updateRalphTask(taskId, {
          baseBranch,
          featureBranch,
          prTargetBranch: resolvePrTargetBranch(task, workspace.targetBranch),
        });
        if (!branchUpdateResult.success) {
          return {
            error: `Failed to persist feature branch: ${branchUpdateResult.error.message}`,
            statusCode: 500,
          };
        }
      }
    }
  }

  // Set task status to this stage if not already there
  if (task.status !== stageName) {
    const transitionResult = await transitionRalphTask(
      taskId,
      stageName,
      `Running stage: ${stageDef.label}`
    );
    if (!transitionResult.success) {
      return { error: transitionResult.error.message, statusCode: 500 };
    }
  }

  // Resolve prompt: API override > playbook override > stage config prompt
  // Check playbook for a prompt override for this stage
  let playbookPromptOverride: string | null = null;
  if (task.playbookId) {
    const pbResult = await getRalphPlaybook(task.playbookId);
    if (pbResult.success && pbResult.data.promptOverrides[stageName]) {
      playbookPromptOverride = pbResult.data.promptOverrides[stageName];
    }
  }

  const promptTemplate =
    options?.promptOverride ?? playbookPromptOverride ?? stageDef.config.prompt;

  let resolvedPrompt: string | null = null;
  if (promptTemplate) {
    // Build stage output variables for template resolution
    const stageOutputVars: Record<string, string> = {};
    let previousStageOutput: string | null = null;

    if (task.stageOutputs) {
      // Extract canonical output from each stage: prefer fileOutput (from .ralph/{stage}.md)
      // over raw iteration output, since fileOutput is the refined artifact.
      // Append any answered Q&A so downstream stages have full context.
      for (const [sid, so] of Object.entries(task.stageOutputs)) {
        let baseOutput = '';
        if (so.fileOutput) {
          baseOutput = so.fileOutput;
        } else {
          const lastIter = so.iterations[so.iterations.length - 1];
          if (lastIter?.output) {
            baseOutput = lastIter.output;
          }
        }

        // Append answered questions as formatted Q&A pairs
        const answeredQs = so.pendingQuestions?.filter((q) => q.answer) ?? [];
        if (answeredQs.length > 0) {
          const qaParts = answeredQs.map((q) => `**Q:** ${q.question}\n**A:** ${q.answer}`);
          baseOutput += '\n\n## Answered Questions\n\n' + qaParts.join('\n\n');
        }

        if (baseOutput) {
          stageOutputVars[sid] = baseOutput;
        }
      }

      // Find the previous stage in the workflow definition
      const currentIdx = definition.stages.findIndex((s) => s.id === stageName);
      if (currentIdx > 0) {
        // Walk backwards to find the most recent stage that has output
        for (let i = currentIdx - 1; i >= 0; i--) {
          const prevId = definition.stages[i]!.id;
          if (stageOutputVars[prevId]) {
            previousStageOutput = stageOutputVars[prevId];
            break;
          }
        }
      }
    }

    // Build task-scoped artifact path: .ralph/tasks/{taskId}/{stageName}.md
    const artifactPath = `.ralph/tasks/${taskId}/${stageName}.md`;

    resolvedPrompt = resolvePromptTemplate(
      promptTemplate,
      {
        title: task.title,
        description: task.description ?? null,
        filePaths: task.filePaths ?? [],
        previousStageOutput,
        stageOutputs: stageOutputVars,
        artifactPath,
      },
      stageDef.config.returnQuestions
    );
  }

  if (!resolvedPrompt) {
    // No prompt configured for this stage — just moved the task
    return { skipped: true };
  }

  // Determine iteration number from existing stage output
  const existingOutput = task.stageOutputs?.[stageName];

  // Guard: prevent duplicate triggers when auto-loop is already running
  if (existingOutput?.autoLoopActive && existingOutput?.activeJobId) {
    return {
      error: `Stage '${stageName}' already has an active auto-loop running (job: ${existingOutput.activeJobId})`,
      statusCode: 409,
    };
  }

  const iteration = (existingOutput?.currentIteration ?? 0) + 1;
  const autoLoop = stageDef.config.autoLoop ?? false;

  // Queue the stage job
  const payload: RalphStageJobPayload = {
    taskId,
    stageName,
    workspaceId: task.workspaceId as WorkspaceId,
    workspacePath: workspace.path as string,
    prompt: resolvedPrompt,
    iteration,
    maxIterations: stageDef.config.maxIterations,
    returnQuestions: stageDef.config.returnQuestions,
    editRequest: stageDef.executionMode === 'edit',
    repoUrl: workspace.repoUrl as string,
    autoLoop,
    ...(stageDef.config.cli?.enabled
      ? { cli: { enabled: true, permissions: stageDef.config.cli.permissions } }
      : {}),
  };

  const now = new Date().toISOString();
  const jobId = nanoid(10);
  const job: RalphJob = {
    id: jobId,
    task_id: taskId,
    agent_type: 'ralph-stage',
    status: 'pending',
    payload: JSON.stringify(payload),
    result: null,
    error: null,
    started_at: null,
    heartbeat_at: null,
    created_at: now,
    updated_at: now,
  };
  dbCreateJob(job);
  console.log(`[STAGE-RUNNER] Created SQLite job ${jobId} for stage '${stageName}'`);

  // Write activeJobId into the task's stageOutputs so the UI can poll
  if (jobId) {
    const currentTask = await getRalphTask(taskId);
    const currentOutputs = currentTask.success ? (currentTask.data.stageOutputs ?? {}) : {};
    const currentStage = currentOutputs[stageName];
    await updateRalphTask(taskId, {
      executionError: null,
      stageOutputs: {
        ...currentOutputs,
        [stageName]: {
          prompt: currentStage?.prompt ?? resolvedPrompt,
          currentIteration: currentStage?.currentIteration ?? 0,
          maxIterations: currentStage?.maxIterations ?? stageDef.config.maxIterations,
          returnQuestions: currentStage?.returnQuestions ?? stageDef.config.returnQuestions,
          iterations: currentStage?.iterations ?? [],
          pendingQuestions: currentStage?.pendingQuestions ?? [],
          fileOutput: currentStage?.fileOutput,
          activeJobId: jobId,
          autoLoopActive: autoLoop ? true : undefined,
          completionReason: undefined,
          lastUpdated: new Date().toISOString(),
        },
      },
    });
  }

  return { jobId };
}
