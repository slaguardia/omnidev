---
name: ship
description: 'Execute a feature or single task by running stories with parallel subagents, verifying acceptance criteria, syncing status bidirectionally, and cleaning up per-story. Triggers on: /ship, ship feature, execute feature.'
---

# Ship — Feature Execution Engine

Execute a feature (with sub-issues) or a single standalone task. Reads tasks from Linear or local `.tasks/` files, builds a dependency graph, runs stories in parallel waves via subagents, verifies acceptance criteria, and syncs status bidirectionally throughout.

**This skill is a pure executor.** It does not plan, decompose, or generate acceptance criteria. If tasks don't exist or lack acceptance criteria, it stops and tells you what to run first.

---

## Invocation

```
# From local tasks
/ship FEAT-20240115_123456-abc1

# From Linear
/ship LIN-1234
/ship https://linear.app/team/issue/LIN-1234

# Single standalone task (no sub-issues)
/ship US-001 --feature FEAT-xxx
/ship LIN-5678  (when LIN-5678 has no sub-issues)
```

---

## Preconditions (Hard Stops)

Before executing anything, verify these. If any fail, **stop immediately** and tell the user what to do.

### 1. Tasks must exist

- **Linear:** The issue (or its sub-issues) must exist and be retrievable
- **Local:** `.tasks/FEAT-xxx/` must contain `feature.json` and story files

If no tasks exist:
> "No tasks found. Run `/interactive-planning` or `/headless-planning` to create them first."

### 2. Every story must have acceptance criteria

Read every story/sub-issue. Each one must have non-empty acceptance criteria.

If any story is missing criteria:
> "The following stories have no acceptance criteria: US-002, US-005. Run `/acceptance-criteria FEAT-xxx` to generate them before shipping."

### 3. Detect task type

Determine if this is:
- **Single task:** No sub-issues/stories. Execute directly.
- **Feature with sub-issues:** Multiple stories with potential dependencies. Build a DAG.

---

## Execution Flow

### Phase 1: Load and Orient

1. **Read all tasks** from the source of truth (Linear or `.tasks/`)
2. **Detect task type** — single task or feature with sub-issues
3. **Set a goal** using the built-in `/goal` mechanism for self-orientation:
   - Feature: `"Ship FEAT-xxx: [title] (0/N stories complete)"`
   - Single task: `"Ship [task title]"`
4. **Build the dependency graph** (features only):
   - Parse `dependencies` from each story
   - Topological sort to compute execution waves
   - Wave = group of stories whose dependencies are all satisfied
   - If circular dependencies detected, stop and surface to human
5. **Print the execution plan** — show the user what waves will run and in what order

### Phase 2: Execute

For each wave (or the single task):

#### 2a. Pre-wave sync

Re-read current state from the source of truth. A story may have been completed externally or updated since the last wave. Respect what the source says.

#### 2b. Dispatch stories

For each unblocked story in the current wave, spawn a subagent:

```
Agent({
  description: "Ship US-XXX: [story title]",
  prompt: <story context + acceptance criteria + codebase context>
})
```

**Parallel:** Stories within the same wave that have no interdependencies run as concurrent subagents.

**Sequential:** If only one story is in the wave, or for a single task, run directly without a subagent.

Each subagent receives:
- The story description and user story
- The full acceptance criteria
- Context from previously completed stories (what changed, what files were touched)
- Relevant codebase context (CLAUDE.md, related files)
- Instructions to commit with message format: `feat: [US-XXX] Story title`

#### 2c. Verify acceptance criteria

After each subagent completes, verify its work against the acceptance criteria:

**Automated criteria** (`acceptanceType: "automated"`):
- Run the specified `acceptanceChecks` commands (test suites, typecheck, lint, grep assertions)
- Run quality gates: `pnpm typecheck`, `pnpm lint:all`, `pnpm test` (as applicable)
- If checks fail: retry the story (max 2 retries with error context appended)
- If still failing after retries: stop and surface to human with the failure details

**Human-required criteria** (`acceptanceType: "human"`):
- **Full stop.** Pause execution entirely.
- Present the criteria to the user with what was implemented
- Ask the user to verify
- Wait for explicit confirmation before continuing
- If the user rejects: retry with their feedback, or stop if they say so

#### 2d. Per-story cleanup (after each story passes verification)

This happens immediately after each individual story is verified, NOT at the end of the feature:

1. **Update source of truth:**
   - Linear: Update the sub-issue status to done/completed, add a comment summarizing what was implemented
   - Local `.tasks/`: Update story JSON — `status: "done"`, `completedAt`, `iteration`
2. **Clean up local working state:**
   - Remove any scratch files, temp state, or working artifacts for this story
   - Update `progress.txt` with iteration log (files changed, learnings)
3. **Update the goal:**
   - `"Ship FEAT-xxx: [title] (3/7 stories complete)"`

#### 2e. Decision points

If at any point during execution:
- An architectural decision has no obvious answer
- Two valid approaches exist with real tradeoffs
- A story's implementation would conflict with or require rethinking a completed story
- Something feels wrong but isn't a clear failure

**Stop and surface to the human.** Explain the situation, present the options, and wait. Do not guess on ambiguous decisions.

### Phase 3: Feature completion

After all stories pass verification:

1. **Final sync:**
   - Linear: Close/complete the parent issue, add summary comment
   - Local `.tasks/`: Update `feature.json` status to `"complete"`
2. **Final cleanup:**
   - Delete `.tasks/FEAT-xxx/` directory (local mode only — all state is already synced)
   - Delete `progress.txt` for this feature
3. **Summary:** Print what was shipped — stories completed, branches pushed, issues closed

---

## Handling Interruptions and Resumability

`/ship` is **stateless between invocations**. It does not maintain its own state file. The source of truth (Linear or `.tasks/`) IS the state.

- If `/ship` crashes mid-feature: re-run `/ship FEAT-xxx`. It re-reads the source, sees which stories are done, and picks up from the next incomplete one.
- If a story was left `in_progress`: treat it as incomplete, re-execute it.
- Per-story cleanup ensures every completed story is fully synced before the next one starts, so no work is lost on interruption.

---

## Single Task Mode

When the target is a single task (no sub-issues):

1. Skip DAG construction
2. Execute directly (no subagent needed)
3. Verify against acceptance criteria
4. Per-story cleanup applies the same way
5. No feature-level cleanup needed

---

## Linear Integration

### Reading from Linear

Use the Linear MCP tools to:
- `get_issue` — load the parent issue
- `list_issues` with `parentId` — load sub-issues
- Parse descriptions for acceptance criteria
- Read `priority` and any ordering signals for wave construction
- Check `dependencies` / blocking relations if present

### Writing back to Linear

After each story:
- `save_issue` — update status to done
- `save_comment` — add implementation summary

After feature completion:
- `save_issue` — close parent issue
- `save_comment` — add feature completion summary

### Issue identifier detection

- `LIN-xxxx` or Linear URL → Linear mode
- `FEAT-xxxx` → local `.tasks/` mode
- Ambiguous → ask the user

---

## Error Handling

| Situation | Action |
|---|---|
| Acceptance criteria missing | Hard stop before execution |
| Automated check fails | Retry up to 2 times with error context |
| Automated check fails after retries | Stop, surface to human |
| Human acceptance criteria | Full stop, wait for confirmation |
| Story too complex for subagent | Stop, surface to human, suggest breakdown |
| Circular dependencies | Stop, surface to human |
| Architectural ambiguity | Stop, surface to human |
| Linear API unreachable | Retry with backoff, then stop |
| Subagent crashes | Mark story as failed, surface to human |

---

## Subagent Prompt Template

Each subagent receives a prompt structured like:

```
You are implementing one story for a feature.

## Story
Title: [title]
User Story: As a [user], I want [feature] so that [benefit].

## Acceptance Criteria
- [ ] [criterion 1]
- [ ] [criterion 2]
- [ ] [criterion 3]

## Context from completed stories
- US-001 ([title]): [summary of changes, key files modified]
- US-002 ([title]): [summary of changes, key files modified]

## Rules
- Implement ONLY this story
- Follow codebase conventions (read CLAUDE.md)
- Run quality checks before committing: pnpm typecheck, pnpm lint:all, pnpm test
- Commit with message: feat: [US-XXX] Story title
- If you hit an ambiguity or serious design decision, STOP and report it
  rather than guessing
```

---

## Checklist

Before starting execution:
- [ ] Tasks exist (Linear or `.tasks/`)
- [ ] Every story has acceptance criteria
- [ ] Dependency graph is acyclic
- [ ] Execution plan shown to user
- [ ] Goal set for orientation

During execution (per story):
- [ ] Pre-wave state synced from source of truth
- [ ] Subagent dispatched with full context
- [ ] Acceptance criteria verified (automated or human)
- [ ] Source of truth updated immediately
- [ ] Local working state cleaned up
- [ ] Goal updated with progress
- [ ] Decision points surfaced to human

After all stories:
- [ ] Parent issue closed (Linear) or feature.json marked complete (local)
- [ ] `.tasks/` directory deleted (local mode)
- [ ] Summary printed
