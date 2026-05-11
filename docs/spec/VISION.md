# Vision — Spec-Driven Development

> **Legacy note:** This document was written before the Cursor SDK migration. It may reference the removed Claude Code CLI integration, the `claudeCode/` directory, or sandbox-wrapper patterns that no longer apply. The Cursor SDK is the only agent backend today — see [docs/CURSOR.md](./CURSOR.md) for current setup. Sections below are preserved as historical context.

> Last updated: 2026-03-11

This document describes the north star for Omnidev's tasking and workflow engine.

---

## Core Principle

**The user's job is to manage the work, not manage the agent.**

The system should create a clear separation:

```
USER defines WHAT  →  SYSTEM figures out HOW  →  AGENT does the WORK
     (spec)              (orchestration)             (execution)
```

### What This Means in Practice

| Responsibility                  | Owner  | Examples                                                |
| ------------------------------- | ------ | ------------------------------------------------------- |
| Define the outcome              | User   | "Add pagination to the /users endpoint"                 |
| Write acceptance criteria       | User   | "Returns 20 items per page", "Includes next/prev links" |
| Decompose into executable units | System | Split into API route + frontend component + tests       |
| Decide execution order          | System | Dependencies, parallelism, stage sequencing             |
| Build the prompt                | System | Rich context from spec, codebase, previous stages       |
| Execute the work                | Agent  | Claude Code runs with full context                      |
| Verify the output               | System | Check acceptance criteria, run tests, validate build    |
| Review and approve              | User   | Inspect results, answer questions, approve PR           |

### What This Is NOT

- Not "no human involvement" — users still review, approve, and course-correct
- Not "magic AI" — the system is explicit about what it's doing and why
- Not "one-shot" — iterative refinement with human-in-the-loop is expected
- Not "autonomous agents" — the agent is a tool the system wields, not an independent actor

---

## Evolution Levels

The vision is realized incrementally. Each level builds on the previous.

### Level 1: Spec as Contract

**Status: Partially built. Task model has `acceptanceCriteria` field but nothing uses it.**

The user writes a specification (user story + acceptance criteria). The system treats acceptance criteria as executable assertions, not just documentation.

After the agent executes:

1. The system runs a validation stage
2. The validation stage checks each acceptance criterion against the actual output
3. If criteria aren't met, the system feeds failure context back for retry

**User experience:**

- Write spec with clear acceptance criteria
- Hit "go"
- Get back a result that either passes all criteria or tells you exactly which ones failed and why

**Key requirements:**

- Acceptance criteria must be parseable and verifiable (not just free text)
- Validation stage needs access to: test results, build output, file diffs, acceptance criteria text
- Retry loop needs previous output + failure reason as context

### Level 2: Automatic Decomposition

**Status: Partially built. Planning stage suggests decomposition but doesn't create real tasks.**

The user writes a high-level feature spec. The system's planning stage creates real child tasks with their own acceptance criteria, dependencies, and execution order.

**User experience:**

- Write a feature spec: "Add user profile editing"
- System decomposes into stories: API endpoint, form component, validation, tests
- Each story has auto-generated acceptance criteria derived from the parent spec
- User reviews the decomposition, adjusts if needed
- Hit "go" — stories execute in dependency order

**Key requirements:**

- Planning stage output must be structured (not free-text) — parseable into task creation calls
- Auto-generated acceptance criteria must trace back to parent spec
- Dependency graph must be auto-wired from planning analysis
- User must be able to edit decomposition before execution starts

### Level 3: Reactive Execution

**Status: Not built. External tasking tab exists but webhook → task pipeline is not wired.**

Tasks react to events rather than requiring manual triggers.

**Trigger types:**

- **Webhook:** External system (GitHub, GitLab, Linear, n8n) sends event → creates/advances task
- **Completion:** "When task RLP-15 completes, start RLP-16"
- **Schedule:** "Run this task every Monday against latest main"
- **External issue:** "When a GitHub issue is labeled `ralph`, create a task from it"

**User experience:**

- Configure triggers once
- Work flows automatically as events occur
- Dashboard shows what's running, what's waiting, what triggered what

**Key requirements:**

- Event ingestion endpoint that maps external events to task operations
- Trigger configuration UI (per-task or global rules)
- Audit trail: which event triggered which task
- Idempotency: same event received twice doesn't create duplicate work

### Level 4: Self-Correcting Loops

**Status: Auto-loop exists but has no validation against acceptance criteria.**

When a stage fails validation:

1. System captures the failure reason
2. Feeds it back as context for a retry iteration
3. Agent gets: "Your previous attempt failed because [reason]. The acceptance criteria require [X]. Try again."
4. Continues until pass or max iterations

**User experience:**

- Agent's first attempt doesn't compile → system detects, retries with error context
- Agent's second attempt compiles but fails a test → system detects, retries with test output
- Agent's third attempt passes → stage completes
- If max iterations reached → pauses for human intervention with full history

**Key requirements:**

- Pluggable validation hooks (run tests, run build, run linter, custom script)
- Failure context formatting that's useful to the agent
- Clear escalation path when automated correction exhausts retries

### Level 5: User-Defined Workflows

**Status: Largely built.** Full stage editor UI with drag-drop reorder, add/delete, custom prompts, execution mode, iteration config. Persisted to `data/workflow-definition.json`. Remaining: rich template variables, hooks/gates, conditional logic, import/export.

Users define their own complete workflow graphs:

- Custom stages with custom prompts
- Rich template variables (previous stage output, acceptance criteria, test results, workspace state)
- Custom hooks (run tests, build, lint, custom scripts)
- Custom gates (require human approval, require CI green)
- Conditional branching ("if complexity > 3, add research stage")

**User experience:**

- Open workflow editor
- Add/remove/reorder stages
- Configure each stage: prompt template, execution mode, validation hooks, iteration limits
- Save as reusable workflow template
- Apply to any task

**Key requirements:**

- Stage definition must be data, not code — stored in database, editable via UI
- Rich prompt template language with well-defined variables
- Hook system for pre/post-stage validation
- Conditional logic for dynamic workflow paths
- Import/export for sharing workflows between instances

---

## Prompt Context Model

A critical enabler for spec-driven development is giving the agent rich, structured context at each stage. Today's template variables are minimal (`{title}`, `{description}`, `{filePaths}`).

### Target Prompt Context

The prompt builder should be able to inject:

| Variable                  | Description                                           |
| ------------------------- | ----------------------------------------------------- |
| `{title}`                 | Task title                                            |
| `{description}`           | Task description                                      |
| `{instructions}`          | Detailed instructions                                 |
| `{filePaths}`             | Relevant file paths                                   |
| `{acceptanceCriteria}`    | Formatted acceptance criteria                         |
| `{userStory}`             | User story text                                       |
| `{previousStageOutput}`   | Output from the previous stage                        |
| `{stageOutput:stageName}` | Output from a specific named stage                    |
| `{allStageOutputs}`       | Concatenated outputs from all completed stages        |
| `{parentSpec}`            | Parent task's description and criteria (for subtasks) |
| `{siblingResults}`        | Results from sibling tasks (for coordinated features) |
| `{testResults}`           | Output from test execution hook                       |
| `{buildOutput}`           | Output from build verification hook                   |
| `{lintOutput}`            | Output from lint check hook                           |
| `{validationErrors}`      | Specific acceptance criteria that failed              |
| `{iterationHistory}`      | Summary of previous iterations and their outcomes     |
| `{workspaceState}`        | Branch, last commit, changed files                    |

### Template Language

Templates should support:

- Simple substitution: `{variable}`
- Conditional sections: `{#if hasTestResults}...{/if}`
- Iteration: `{#each acceptanceCriteria}...{/each}`

Not a full programming language — just enough to compose structured prompts from available context.

---

## Success Metrics

How do we know the vision is being realized?

| Metric                      | Measures                                                   | Target               |
| --------------------------- | ---------------------------------------------------------- | -------------------- |
| **Touch count**             | How many times does the user intervene per task?           | Decreasing over time |
| **Spec-to-merge time**      | Time from spec written to PR merged                        | Decreasing over time |
| **First-pass success rate** | % of tasks that pass validation on first execution         | Increasing over time |
| **Manual trigger rate**     | % of stage transitions triggered manually vs automatically | Decreasing over time |
| **Rework rate**             | % of tasks that require re-execution after completion      | Decreasing over time |

---

## Non-Goals

These are explicitly NOT part of the vision:

- **Replacing code review:** The system assists with creation, not approval. Humans review output.
- **Multi-agent orchestration:** One bot identity, one Claude Code subscription. Not a multi-agent framework.
- **General-purpose automation:** This is for software development tasks specifically.
- **Lock-in to Claude:** The orchestration layer should treat the AI backend as a pluggable dependency.
- **Zero-touch autonomy:** Human oversight is a feature, not a limitation. The goal is reducing unnecessary intervention, not eliminating all intervention.
