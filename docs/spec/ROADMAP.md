# Roadmap — Evolution Plan

> Last updated: 2026-03-11

This roadmap sequences the work needed to evolve from the current state toward the spec-driven development vision. Phases build on each other — each phase is usable independently but enables the next.

---

## Phase 1: Spec Becomes the Contract

**Goal:** The spec (acceptance criteria + user story) is actively used during execution, not just stored.

**Gaps addressed:** GAP-002, GAP-005, GAP-008

### Work Items

1. **Rich prompt template system**

   - Add template variables beyond `{title}`, `{description}`, `{filePaths}`
   - Priority additions: `{acceptanceCriteria}`, `{userStory}`, `{previousStageOutput}`, `{stageOutput:name}`, `{instructions}`
   - Implement in stage-runner prompt resolution
   - Update default stage prompts to use new variables

2. **Inter-stage context threading**

   - When building prompt for stage N, automatically include outputs from stages 0..N-1
   - Configurable: full output vs summary vs specific fields
   - Token-budget-aware: truncate or summarize if context exceeds limit

3. **Acceptance criteria in prompts**

   - Inject `{acceptanceCriteria}` into executing stage's default prompt
   - Format as numbered checklist for the agent
   - Include in triage and planning stage prompts for scope awareness

4. **Post-execution verification stage**
   - New default stage: `verify` (readonly, after executing)
   - Prompt: "Review the changes made against these acceptance criteria: {acceptanceCriteria}. For each criterion, state PASS or FAIL with evidence."
   - Parse verification output for pass/fail status
   - If any FAIL: transition back to executing with failure context

### Definition of Done

- Acceptance criteria appear in agent prompts
- Stage outputs flow forward to subsequent stages
- A task with acceptance criteria gets verified after execution
- Failed verification triggers a retry with specific failure context

---

## Phase 2: Automated Decomposition

**Goal:** The system creates executable child tasks from a feature spec, not just a text plan.

**Gaps addressed:** GAP-003

### Work Items

1. **Structured planning output**

   - Update planning stage prompt to request structured JSON output
   - Define schema: `{ stories: [{ title, description, acceptanceCriteria, filePaths, dependsOn }] }`
   - Parse planning output into structured format

2. **Auto-create child tasks**

   - When planning stage completes with structured output, create child tasks automatically
   - Set parent-child relationships
   - Wire dependencies from `dependsOn` references
   - Assign playbook from parent task
   - Derive acceptance criteria from parent spec

3. **Decomposition review step**

   - After auto-creation, transition parent to a `review-plan` status
   - UI shows generated stories with edit/delete/add capability
   - User approves decomposition → stories transition to `ready`
   - User rejects → delete generated stories, re-run planning

4. **Acceptance criteria traceability**
   - Each child task's acceptance criteria links back to parent criteria
   - Completing all children should satisfy all parent criteria
   - Gap detection: warn if parent criteria aren't covered by any child

### Definition of Done

- Writing a feature spec and running the planning stage creates real child tasks
- User can review and edit the decomposition before execution
- Dependencies between stories are auto-wired
- Executing "run all" on the feature executes stories in dependency order

---

## Phase 3: Validation Hooks

**Goal:** Objective verification after execution — tests, build, lint — not just agent self-assessment.

**Gaps addressed:** GAP-006, GAP-012

### Work Items

1. **Hook system architecture**

   - Define hook points: `pre-stage`, `post-stage`, `pre-execution`, `post-execution`
   - Hook definition: `{ command: string, timeout: number, failBehavior: 'block' | 'warn' }`
   - Hooks run in workspace directory with same env as Claude Code

2. **Built-in validation hooks**

   - `run-tests`: Execute workspace test command, capture output
   - `check-build`: Execute workspace build command, capture output
   - `run-lint`: Execute workspace lint command, capture output
   - Auto-detect commands from `package.json` scripts

3. **Hook output as prompt context**

   - Failed hook output available as `{testResults}`, `{buildOutput}`, `{lintOutput}`
   - On validation failure: retry executing stage with failure context injected
   - Configurable retry limit for validation failures (separate from stage iterations)

4. **Rollback capability**
   - Track git state (commit hash) before each stage execution
   - One-click rollback: `git reset --hard {pre-execution-hash}` on feature branch
   - API: `POST /api/ralph/tasks/{id}/rollback`
   - UI: "Rollback" button on task detail screen for tasks with execution history

### Definition of Done

- Post-execution hooks can run tests and capture results
- Failed tests trigger retry with test output in the prompt
- User can rollback a stage execution to pre-execution state
- Hook results visible in task detail stage output section

---

## Phase 4: User-Defined Workflows — LARGELY COMPLETE

**Goal:** Users create and modify their own workflows — custom stages, prompts, hooks, and gates.

**Gaps addressed:** ~~GAP-001~~ (resolved)

### Already Built

- **Stage editor UI** (`WorkflowSettingsTab.tsx`): create/edit/delete stages, drag-drop reorder, configure prompt template, execution mode, iterations, return questions
- **Persistence** (`workflow-definition-manager.ts`): `data/workflow-definition.json`, Zod validation, migration from old location
- **API**: `GET/PUT/DELETE /api/workflow/definition`
- **Runtime**: stage runner loads persisted definition, falls back to defaults
- **Reset**: delete file to revert to defaults

### Remaining Work Items

1. **Rich template language** (depends on Phase 1 — GAP-005)

   - Variable autocomplete in prompt editor showing all available context
   - Support conditional sections: `{#if hasTestResults}...{/if}`
   - Support iteration: `{#each acceptanceCriteria}...{/each}`
   - Template validation (catch undefined variables)

2. **Pre/post-stage hooks** (depends on Phase 3)

   - Attach validation commands to custom stages
   - Configure hook behavior (block vs warn) per stage

3. **Workflow templates (import/export)**

   - Export workflow definition as JSON
   - Import workflow from JSON
   - Built-in starter templates: "Full Pipeline", "Quick Fix", "Bug Investigation", "Feature Development"

4. **Prompt preview**
   - Preview resolved prompt with sample task data in editor

### Definition of Done

- ~~Users can create custom stages with custom prompts via the UI~~ DONE
- Rich template variables with conditionals are supported
- Workflows can be exported and imported
- ~~Default workflow is editable and restorable~~ DONE

---

## Phase 5: Reactive Execution

**Goal:** Tasks react to events — work flows automatically based on triggers, not manual clicks.

**Gaps addressed:** GAP-004, GAP-011

### Work Items

1. **Event ingestion endpoint**

   - `POST /api/events` — generic event receiver
   - Payload: `{ source, type, data }` (e.g., `{ source: 'github', type: 'issue.labeled', data: {...} }`)
   - HMAC signature verification for webhook security
   - Idempotency key to prevent duplicate processing

2. **Trigger rules engine**

   - Rule definition: `{ event: { source, type, filter }, action: { type, config } }`
   - Filter: JSONPath or simple field matching on event data
   - Actions: create-task, advance-task, run-stage, complete-task
   - Storage: `ralph_triggers` SQLite table

3. **Built-in trigger types**

   - **Completion trigger:** When task X completes → start task Y
   - **Schedule trigger:** Cron expression → create/run task
   - **GitHub webhook:** Issue labeled → create task, PR merged → advance task
   - **GitLab webhook:** Issue created → create task, MR merged → advance task

4. **Trigger management UI**

   - List configured triggers
   - Create/edit/delete triggers
   - Test trigger with sample event
   - Trigger execution log (which events triggered which actions)

5. **External integration guides**
   - n8n workflow templates for common patterns
   - GitHub Actions examples
   - Generic webhook integration documentation

### Definition of Done

- External events can create and advance tasks automatically
- Completion of one task can trigger another
- Scheduled task execution works
- GitHub/GitLab webhooks create tasks from issues

---

## Phase 6: Operational Excellence

**Goal:** Observability, reliability, and operational maturity.

**Gaps addressed:** GAP-009, GAP-010, GAP-013, GAP-016

### Work Items

1. **Task templates**

   - Template definition: pre-filled title pattern, description, acceptance criteria, file paths, playbook
   - Template CRUD API and UI
   - "Create from template" in CreateTaskModal

2. **Execution metrics**

   - Instrument: stage duration, token usage, success/failure, retry count
   - Aggregate by: task, project, stage type, time period
   - Dashboard: throughput, duration trends, cost tracking

3. **Workspace health monitoring**

   - Health check: clean working tree, up-to-date remote, no stale branches
   - Pre-execution health gate (block execution if workspace unhealthy)
   - Dashboard health indicators per workspace

4. **Cost controls**
   - Per-task token budget (warn or block at threshold)
   - Per-project monthly budget
   - Global rate limits
   - Budget alerts via dashboard notification

### Definition of Done

- Common task types can be created from templates
- Execution metrics are visible on the dashboard
- Workspace health is monitored and surfaced
- Token usage is tracked with configurable limits

---

## Dependency Graph

```
Phase 4: User-Defined Workflows ← LARGELY COMPLETE (foundation)
    │
Phase 1: Spec as Contract (rich prompt context, AC enforcement)
    │
    ├── Phase 2: Automated Decomposition
    │       │
    │       └── Phase 5: Reactive Execution
    │               │
    │               └── Phase 6: Operational Excellence
    │
    └── Phase 3: Validation Hooks
            │
            └── Phase 4 remaining (hook attachment to custom stages)
```

Phase 4 is the foundation — custom stages already exist. Phases 1-3 build on that foundation. Phase 1 enriches what goes into custom stage prompts. Phase 3 adds hooks that can be attached to the existing custom stages.

---

## Sequencing Rationale

1. **Phase 4 already done** — custom stage definitions, editor UI, persistence, and runtime integration are in place
2. **Phase 1 first** because it's foundational — every subsequent phase depends on richer prompt context and spec enforcement
3. **Phase 2 early** because it's the highest-impact user experience improvement — automating the most tedious manual work
4. **Phase 3 before Phase 4 remaining** because hooks are a prerequisite for attaching validation to custom stages
5. **Phase 5 after Phase 2** because reactive execution is most valuable when decomposition is automated
6. **Phase 6 last** because operational polish is most valuable once the core engine is mature
