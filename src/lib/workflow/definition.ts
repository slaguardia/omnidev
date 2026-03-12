/**
 * Workflow Definition Engine
 *
 * Single source of truth for workflow stage structure.
 * Stages are execution definitions — each is an agent (prompt + iteration config + execution mode).
 * Tasks can freely move between any stages. Running a stage executes its configured prompt.
 */

import { z } from 'zod';
import type { WorkflowStageDefinition, WorkflowDefinition } from '@/lib/types/index';

/**
 * Valid stage color values
 */
export const STAGE_COLORS = [
  'default',
  'warning',
  'secondary',
  'success',
  'primary',
  'danger',
] as const;

export type StageColor = (typeof STAGE_COLORS)[number];

/**
 * Zod schema for a single workflow stage definition
 */
export const WorkflowStageDefinitionSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, 'Stage ID must be lowercase alphanumeric with hyphens'),
  label: z.string().min(1),
  color: z.enum(STAGE_COLORS),
  executionMode: z.enum(['readonly', 'edit']),
  config: z.object({
    prompt: z.string().nullable(),
    maxIterations: z.number().int().min(1),
    returnQuestions: z.boolean(),
    autoLoop: z.boolean(),
  }),
  onEnter: z.enum(['branch-creation', 'confirm-pr']).optional(),
});

/**
 * Zod schema for a complete workflow definition
 */
export const WorkflowDefinitionSchema = z
  .object({
    version: z.number().int().min(1),
    stages: z.array(WorkflowStageDefinitionSchema).min(1),
  })
  .refine(
    (def) => {
      const ids = def.stages.map((s) => s.id);
      return new Set(ids).size === ids.length;
    },
    { message: 'Stage IDs must be unique' }
  )
  .refine(
    (def) => {
      // System statuses cannot be used as stage IDs
      return !def.stages.some((s) => s.id === 'draft' || s.id === 'complete');
    },
    {
      message:
        "'draft' and 'complete' are reserved system statuses and cannot be used as stage IDs",
    }
  );

/**
 * Default triage prompt template
 */
const DEFAULT_TRIAGE_PROMPT = `You are triaging a task. Analyze it in the context of this codebase and report your findings.

## Task: {title}

{description}

### Relevant Files
{filePaths}

---

## Steps

### 1. Search the Codebase

Find the files that are relevant to this task. Read them. Do not guess — open the actual files and understand the current implementation.

### 2. List Affected Files

List every file that will need to change. Include:
- Implementation files
- Type definition files
- Test files
- Barrel exports (index.ts)
- Configuration files

### 3. Assess Complexity

Rate as **low**, **medium**, or **high**. Consider:
- Number of files touched
- Cross-cutting concerns
- Regression risk
- New patterns vs reusing existing ones

### 4. Identify Ambiguities

Flag anything in the task that is vague, contradictory, or missing. Be specific about what information would resolve each ambiguity.

### 5. Flag Risks

Note potential regressions, breaking changes, or conflicts with existing codebase patterns.

### 6. Recommend Decomposition

If this task should be split into subtasks, explain why and suggest the split. If it can execute as a single unit, say so.

---

Keep your assessment concise — a senior engineer should read it in under two minutes.`;

/**
 * Default planning prompt template
 */
const DEFAULT_PLANNING_PROMPT = `You are creating an implementation plan for a task. Produce a concrete, step-by-step plan specific enough to follow without re-analyzing the codebase.

## Task: {title}

{description}

### Relevant Files
{filePaths}

---

## Steps

### 1. Read the Codebase

Open and read the files relevant to this task. Understand the current implementation, patterns, and conventions before planning changes.

### 2. Identify the Change Set

List every file to create or modify. For each file, describe what changes are needed and why.

### 3. Define the Sequence

Order the changes so they compile at each step:
- Types before implementation
- Implementation before tests
- Barrel exports after implementation

Make dependency order explicit.

### 4. Note Prerequisites

List any package installations, config changes, or migrations needed before implementation.

### 5. Include Test Strategy

For each behavioral change, state how it should be tested. Follow existing test patterns in the codebase.

### 6. Call Out Decisions

Where multiple approaches exist, state which you chose and give a brief reason.

---

### Output Format

Structure the plan as numbered steps. Each step names the file and describes the change:

\`\`\`
1. src/lib/types/index.ts — Add FooConfig interface with bar and baz fields
2. src/lib/foo/implementation.ts — Implement processFoo() using the new type
3. src/lib/foo/index.ts — Export from barrel
4. src/lib/foo/__tests__/implementation.test.ts — Unit tests for processFoo()
\`\`\`

Do not write code. Describe *what* to change, not the code itself. Code will be written in the executing stage.`;

/**
 * Default research prompt template
 */
const DEFAULT_RESEARCH_PROMPT = `You are reviewing an implementation plan. Validate it against the actual codebase. You are a reviewer — find problems, do not rewrite the plan.

## Task: {title}

{description}

### Relevant Files
{filePaths}

---

## Steps

### 1. Read the Plan

Review the implementation plan from the previous stage output above.

### 2. Verify File Paths

Check that every file referenced in the plan actually exists (or is explicitly marked as new). Open the files. Flag any incorrect paths.

### 3. Check Pattern Compliance

Read existing code near the planned changes. Does the plan follow established conventions?
- Import style
- Error handling patterns
- Naming conventions
- Module structure

Flag deviations.

### 4. Identify Missing Changes

Are there files the plan should modify but does not mention? Common oversights:
- Barrel exports (index.ts)
- Type definitions
- Test files
- Configuration files

### 5. Validate Dependency Order

Will the planned sequence compile at each step? Flag ordering issues.

### 6. Assess Risk

Are there breaking changes affecting other parts of the codebase? Edge cases not addressed?

---

### Output Format

If the plan looks sound, say so briefly and state why.

If you find issues, list each one:
- **What:** the problem
- **Where:** which plan step or file
- **Suggestion:** how to fix it

Be specific. "Step 3 references src/lib/foo/types.ts but that file does not exist — the types are in src/lib/types/index.ts" is useful.`;

/**
 * Default executing prompt template
 */
const DEFAULT_EXECUTING_PROMPT = `You are executing one iteration of implementation for a task. Make progress, commit, and exit cleanly.

## Task: {title}

{description}

### Relevant Files
{filePaths}

---

## Steps

### 1. Assess Current State

Read the \`.ralph/progress.md\` file in the workspace root (if it exists) to understand what has been done in previous iterations. This file is your cross-iteration memory.

Also read the relevant source files to understand the current state of the implementation.

### 2. Decide What To Do This Iteration

Pick ONE logical unit of work:
- If an implementation plan exists from earlier stages, follow the next uncompleted step
- If no plan exists, identify the smallest meaningful change that moves the task forward
- If previous iterations had errors, fix those first

**Rules:**
- ONE logical unit of work per iteration
- Follow existing codebase patterns
- Make minimal, focused changes

### 3. Implement

Make the code changes for your chosen unit of work. Be thorough within your scope:
- Update barrel exports (index.ts) if needed
- Update type definitions if needed
- Add tests if the codebase has tests for similar functionality

### 4. Quality Checks

Run quality checks and fix any failures before committing:

\`\`\`bash
pnpm typecheck
pnpm lint:all
pnpm test
\`\`\`

If checks fail, fix the issues and re-run. Do NOT proceed with broken code.

### 5. Commit

If you made changes and quality checks pass:

\`\`\`bash
git add -A
git commit -m "feat: concise description of what changed"
\`\`\`

### 6. Update Progress File

Update (or create) \`.ralph/progress.md\` in the workspace root with:
- What was completed this iteration
- What remains to be done
- Any issues or blockers

This file persists across iterations so the next instance can pick up where you left off.

### 7. Signal Completion

If ALL work for this task is complete (nothing remaining):
- Output \`<promise>COMPLETE</promise>\` at the end of your response
- This signals the system to stop iterating

If work remains, do NOT output the completion signal. The system will automatically start another iteration.

---

## Important

- **ONE unit of work per iteration** — do not try to do everything at once
- **Quality gates are mandatory** — no broken commits
- **Exit cleanly** — the system handles the next iteration
- **Do not modify files unrelated to the task**
- **Update .ralph/progress.md** — this is how you communicate state across iterations
- **Signal completion** — output \`<promise>COMPLETE</promise>\` only when ALL work is done`;

/**
 * Default workflow definition — matches the original 5 user-defined stages
 */
export const DEFAULT_WORKFLOW_DEFINITION: WorkflowDefinition = {
  version: 1,
  stages: [
    {
      id: 'triage',
      label: 'Triage',
      color: 'warning',
      executionMode: 'readonly',
      config: {
        prompt: DEFAULT_TRIAGE_PROMPT,
        maxIterations: 2,
        returnQuestions: true,
        autoLoop: false,
      },
    },
    {
      id: 'planning',
      label: 'Planning',
      color: 'secondary',
      executionMode: 'readonly',
      config: {
        prompt: DEFAULT_PLANNING_PROMPT,
        maxIterations: 3,
        returnQuestions: true,
        autoLoop: false,
      },
    },
    {
      id: 'research',
      label: 'Research',
      color: 'secondary',
      executionMode: 'readonly',
      config: {
        prompt: DEFAULT_RESEARCH_PROMPT,
        maxIterations: 2,
        returnQuestions: false,
        autoLoop: false,
      },
    },
    {
      id: 'ready',
      label: 'Ready',
      color: 'success',
      executionMode: 'readonly',
      config: {
        prompt: null,
        maxIterations: 1,
        returnQuestions: false,
        autoLoop: false,
      },
    },
    {
      id: 'executing',
      label: 'Executing',
      color: 'primary',
      executionMode: 'edit',
      config: {
        prompt: DEFAULT_EXECUTING_PROMPT,
        maxIterations: 10,
        returnQuestions: false,
        autoLoop: true,
      },
      onEnter: 'branch-creation',
    },
  ],
};

/**
 * Validate and return a workflow definition, falling back to default.
 * Useful as a pure validate-or-default helper.
 */
export function getWorkflowDefinition(input?: WorkflowDefinition | null): WorkflowDefinition {
  if (input) {
    const result = WorkflowDefinitionSchema.safeParse(input);
    if (result.success) {
      return result.data;
    }
    console.warn('[WORKFLOW DEFINITION] Invalid definition, using default:', result.error.message);
  }
  return DEFAULT_WORKFLOW_DEFINITION;
}

/**
 * Derive the full status list from a workflow definition.
 * Returns ['draft', ...stageIds, 'complete']
 */
export function deriveStatusList(definition: WorkflowDefinition): string[] {
  return ['draft', ...definition.stages.map((s) => s.id), 'complete'];
}

/**
 * Find a stage definition by its ID
 */
export function findStageDefinition(
  definition: WorkflowDefinition,
  stageId: string
): WorkflowStageDefinition | undefined {
  return definition.stages.find((s) => s.id === stageId);
}

/**
 * Check if a stage uses edit mode
 */
export function isEditStage(definition: WorkflowDefinition, stageId: string): boolean {
  const stage = findStageDefinition(definition, stageId);
  return stage?.executionMode === 'edit';
}

/**
 * Check if a status is a system status ('draft' or 'complete')
 */
export function isSystemStatus(status: string): boolean {
  return status === 'draft' || status === 'complete';
}

/**
 * Check if a status is valid within a given workflow definition
 */
export function isValidStatus(definition: WorkflowDefinition, status: string): boolean {
  return deriveStatusList(definition).includes(status);
}
