# Gaps — Identified Improvements

> Last updated: 2026-03-11

Gaps are organized by severity relative to the spec-driven development vision.

---

## Critical — Blocks the Spec-Driven Vision

### ~~GAP-001: Workflow Definitions Are Hardcoded~~ — RESOLVED

**Status: Built.** Custom stage definitions are fully implemented:

- **Stage editor UI** (`WorkflowSettingsTab.tsx`): drag-drop reorder, add/delete stages, edit ID, label, color, execution mode, prompt template, max iterations, return questions toggle
- **Persistence** (`workflow-definition-manager.ts`): saves to `data/workflow-definition.json`, Zod validation, migration from old app-config location
- **API** (`GET/PUT/DELETE /api/workflow/definition`): full CRUD
- **Runtime integration**: stage runner loads persisted definition via `loadWorkflowDefinition()`, falls back to defaults
- **Client hook** (`useWorkflowDefinition`): derives stage list, lookup helpers, edit mode checks

**Remaining sub-gaps (reclassified to GAP-005):**

- Template variables limited to `{title}`, `{description}`, `{filePaths}`
- No conditional template sections
- No pre/post-stage hooks or validation gates
- No import/export of workflow definitions

### GAP-002: Acceptance Criteria Are Not Used

**Current state:** The task model has `acceptanceCriteria: string[]` and `userStory: string` fields. These are stored but never referenced during execution. No stage reads them, no validation checks them, no prompt includes them.

**Impact:** The core contract of spec-driven development — "the spec defines done" — is not enforced. Tasks complete based on iteration count or agent self-assessment, not against the user's criteria.

**Target state:** Acceptance criteria injected into prompts via template variable. Post-execution validation stage checks criteria. Failed criteria trigger retry with specific failure context.

**Dependencies:** GAP-005 (rich prompt context).

### GAP-003: No Automated Decomposition

**Current state:** The planning stage generates a text plan. Users must manually create child tasks from the plan. There is no structured output from planning that the system can act on.

**Impact:** Users are doing the orchestration work that the system should handle. Creating 5 stories from a plan is mechanical work — the system should do it.

**Target state:** Planning stage produces structured output (parseable story definitions). System creates real child tasks with auto-generated acceptance criteria, file paths, and dependency relationships. User reviews and approves the decomposition before execution.

**Dependencies:** GAP-005 (rich prompt context), stable task creation API.

### GAP-005: Stage Prompts Have Minimal Context

**Current state:** Prompt templates support only three variables: `{title}`, `{description}`, `{filePaths}`. Stage N cannot reference Stage N-1's output. Acceptance criteria, user stories, test results, and workspace state are not available.

**Impact:** Each stage operates in relative isolation. The agent doesn't benefit from accumulated context across the workflow. Prompts must be manually crafted to include this context.

**Target state:** Rich prompt template system with access to: previous stage outputs, acceptance criteria, test results, build output, parent spec, sibling results, iteration history, workspace state.

**Dependencies:** None — can be built incrementally by adding variables.

---

## High — Limits Autonomous Operation

### GAP-004: No Event/Trigger System

**Current state:** All task execution is manually triggered via the UI. The External Tasking tab exists in the dashboard navigation but the webhook → task pipeline is not fully wired.

**Impact:** Users must babysit execution. They click "run next stage" or "execute" for each task. Work cannot flow automatically based on external events (PR merged, issue created, schedule).

**Target state:** Event ingestion endpoint that maps external events to task operations. Trigger configuration (per-task or global rules). Types: webhook, completion-triggered, scheduled, external issue sync.

**Dependencies:** Stable task lifecycle API.

### GAP-006: No Output Validation Loop

**Current state:** After execution, results go into `stageOutputs`. The auto-loop checks for `<promise>COMPLETE</promise>` signal from the agent but performs no objective validation (no test running, no build check, no lint verification).

**Impact:** "Done" is based on the agent's self-assessment, not objective verification. A task can complete with broken tests or failing builds.

**Target state:** Pluggable post-stage validation hooks. Built-in hooks for: run tests, check build, run linter. Custom hooks for user-defined scripts. Failed validation triggers retry with failure context.

**Dependencies:** GAP-002 (acceptance criteria usage).

### GAP-007: No Cross-Workspace Orchestration

**Current state:** Each task is bound to a single workspace. A feature spanning two repos (e.g., API + frontend) cannot be expressed as one unit of work.

**Impact:** Multi-repo features require manual coordination — create separate tasks, manage them independently, manually sequence.

**Target state:** Feature tasks can reference multiple workspaces. Child stories can target different workspaces. Dependency graph respects cross-workspace ordering.

**Dependencies:** Task model changes (workspace as per-story, not per-feature).

### GAP-008: Limited Inter-Stage Context Threading

**Current state:** Auto-loop reads `.ralph/progress.md` for continuation context. But stage-to-stage context is not automatically threaded. The planning stage's output is not automatically available to the executing stage.

**Impact:** Each stage starts with minimal context. The accumulated understanding from triage → planning → research is lost when execution begins.

**Target state:** Automatic context threading. Each stage has access to all previous stage outputs via template variables. Context is accumulated and summarized to stay within token limits.

**Dependencies:** GAP-005 (rich prompt context).

---

## Medium — Quality of Life

### GAP-009: No Task Templates / Blueprints

**Current state:** Every task starts from scratch in the CreateTaskModal. There are no reusable templates for common patterns like "Add API endpoint", "Fix bug", "Add test coverage".

**Impact:** Repetitive manual work for common task types. Acceptance criteria and file paths must be re-specified each time.

**Target state:** Task templates with pre-filled: title pattern, description template, acceptance criteria, file path patterns, playbook assignment, stage prompt overrides.

**Dependencies:** None.

### GAP-010: No Execution Metrics / Analytics

**Current state:** No visibility into execution patterns. No tracking of: average time per stage, success/failure rates, token costs per task, common failure modes.

**Impact:** Cannot identify bottlenecks, optimize workflows, or measure improvement over time. Cannot answer "is the system getting better?"

**Target state:** Metrics collection during execution. Dashboard showing: task throughput, stage durations, success rates, token usage, cost tracking.

**Dependencies:** None — can instrument existing execution paths.

### GAP-011: External Tasking Not Wired

**Current state:** "External Tasking" tab exists in dashboard navigation. Callback webhooks are supported on jobs. But there is no end-to-end flow from external event → task creation → execution → result delivery.

**Impact:** Integration with external tools (n8n, GitHub Actions, Linear) requires manual bridging.

**Target state:** Documented webhook endpoints for: task creation, task status queries, execution results. Integration guides for common tools. API-first design for external tasking.

**Dependencies:** GAP-004 (event/trigger system).

### GAP-012: No Rollback Mechanism

**Current state:** If a task's execution produces broken code, the only recovery is manual git operations (revert commit, delete branch).

**Impact:** Users must understand git internals to recover from bad executions. Risk of broken code accumulating on feature branches.

**Target state:** One-click rollback per stage execution. Undo last commit on feature branch. Option to reset branch to pre-execution state.

**Dependencies:** None — git operations already exist.

### GAP-013: No Workspace Health Monitoring

**Current state:** No automated checking of workspace state. Workspaces can accumulate stale branches, uncommitted changes, or diverge from remote without detection.

**Impact:** Execution can fail due to workspace state issues that could have been prevented.

**Target state:** Workspace health checks: clean working tree, up-to-date with remote, no stale branches. Pre-execution health gate. Dashboard indicators for workspace health.

**Dependencies:** None.

---

## Low — Future Considerations

### GAP-014: No Multi-Instance Coordination

**Current state:** Single Omnidev instance assumed. No coordination between multiple instances targeting the same repos.

**Impact:** Not a current issue but would prevent scaling to team usage.

### GAP-015: No Audit Trail for Task Lifecycle

**Current state:** Task `updatedAt` changes on any modification. No granular history of: who changed what, when, why. Stage outputs provide execution history but not lifecycle history.

**Impact:** Cannot reconstruct the decision trail for a task.

### GAP-016: No Cost Controls

**Current state:** No budget limits per task, per project, or globally. Token usage is captured per execution but not aggregated or limited.

**Impact:** Runaway execution (many auto-loop iterations) could consume significant Claude Code quota without warning.
