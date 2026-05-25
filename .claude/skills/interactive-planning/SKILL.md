---
name: interactive-planning
description: 'Create or update local task files with user stories and acceptance criteria. Triggers on: create task, draft tasks for, plan tasks for, /interactive-planning.'
---

# Interactive Planning (Local Tasks)

Create detailed local task files that are clear, actionable, and suitable for implementation.

**End goal:** Local JSON task files with a feature definition (feature.json) and sub-task files (stories/US-XXX.json).

- **Feature file:** Feature design only - Summary, Out of Scope, Technical Considerations. NO acceptance criteria, NO open questions.
- **Story files:** User stories with dependencies and acceptance criteria. Each is independently implementable.

## Detect Task Type

Not every request is a multi-story feature. Determine whether this is:

- **Single task:** A focused piece of work with no sub-parts. Create a feature with one story (US-001).
- **Feature with sub-issues:** A larger body of work that decomposes into multiple stories.

Both produce the same file structure — a single task is just a feature with one story.

## The Job

1. Receive a feature description from the user (or existing feature ID to edit)
2. **If existing feature ID provided:** Read existing task files first, review what's already planned
3. Ask 3-5 essential clarifying questions (with lettered options)
4. Generate a structured task set with user stories (one or many)
5. Show draft to user - **they can say what's missing**
6. Save feature.json and story files to `.tasks/` directory
7. Return the feature ID and path
8. **Remind the user** to run `/acceptance-criteria FEAT-xxx` before `/ship`

## Step 1: Clarifying Questions

Ask only critical questions where the initial prompt is ambiguous:

- **Problem/Goal:** What problem does this solve?
- **Core Functionality:** What are the key actions?
- **User Type:** Who is this for?
- **Scope/Boundaries:** What should it NOT do?
- **Success Criteria:** How do we know it's done?

### Format Questions Like This:

```
1. What problem does this solve?
   A) Users can't find something they need
   B) Missing functionality they've requested
   C) Current behavior is confusing/broken
   D) Other: [please specify]

2. Who is the primary user?
   A) Event hosts
   B) Event attendees
   C) New users (onboarding)
   D) All users
```

This lets users respond with "1B, 2A, 3A" for quick iteration.

## Step 2: Generate Task Files

### feature.json (Feature Design)

```json
{
  "id": "FEAT-YYYYMMDD_HHMMSS-xxxx",
  "title": "Feature: [action verb + specific description]",
  "summary": "1-2 sentence description of the feature and problem it solves",
  "status": "planning",
  "createdAt": "ISO timestamp",
  "outOfScope": [
    "What this feature will NOT include",
    "Explicit boundaries to prevent scope creep"
  ],
  "technicalConsiderations": [
    "Affected components/screens",
    "Dependencies or integration points"
  ],
  "storiesCount": N
}
```

### stories/US-XXX.json (User Stories)

Each user story becomes its own JSON file:

```json
{
  "id": "US-001",
  "featureId": "FEAT-...",
  "title": "Story Title",
  "userStory": "As a [user], I want [feature] so that [benefit].",
  "acceptanceCriteria": [
    "Specific verifiable criterion",
    "Another criterion",
    "[UI changes] Verify visual behavior in simulator"
  ],
  "acceptanceChecks": [],
  "acceptanceType": null,
  "dependencies": [],
  "status": "todo",
  "createdAt": "ISO timestamp",
  "completedAt": null,
  "iteration": null
}
```

#### Field reference

| Field | Set by | Purpose |
|---|---|---|
| `acceptanceCriteria` | `/interactive-planning` | Human-readable criteria (planning produces initial set) |
| `acceptanceChecks` | `/acceptance-criteria` | Machine-executable commands (left empty during planning) |
| `acceptanceType` | `/acceptance-criteria` | `"automated"` or `"human"` (left null during planning) |
| `dependencies` | `/interactive-planning` | Array of story IDs this story depends on (e.g., `["US-001"]`) |

**Planning creates the structure. `/acceptance-criteria` fills in the verification details. `/ship` executes.**

### User Story Guidelines

- Each story should be independently implementable
- Break complex features into logical pieces
- Number stories sequentially (US-001, US-002, etc.)
- Stories should be small enough to complete in one focused session

### Dependency Guidelines

- Use `dependencies` to express ordering constraints between stories
- A story with `dependencies: ["US-001"]` cannot start until US-001 is complete
- Stories with no dependencies (or whose dependencies are all met) can run in parallel
- Keep the dependency graph shallow — deep chains limit parallelization
- If two stories touch the same files but don't logically depend on each other, note that in the story description rather than adding a hard dependency

### Acceptance Criteria Standards

- Must be verifiable (not "works correctly")
- Include edge cases and error states
- For UI changes: "Verify [specific visual/behavior] in simulator"
- For data changes: "Confirm [state before/after]"
- Planning produces initial criteria; `/acceptance-criteria` refines them into testable checks

## Step 3: Review with User

After generating the draft, always ask:

> "Here's the draft. Did I miss anything? Let me know what to add or change before I save the task files."

## Step 4: Save to .tasks/

Create the directory structure and write JSON files:

```
.tasks/
  FEAT-20240115_123456-abc1/
    feature.json
    index.json
    stories/
      US-001.json
      US-002.json
      ...
```

## Title Writing Standards

- Start with action verbs: Add, Enable, Fix, Implement, Allow
- Be specific about the affected area
- Keep under 80 characters

**Good Examples:**

- "Add visual indicator to distinguish host accounts on connections page"
- "Enable hosts to message event attendees"

**Bad Examples:**

- "Fix bug" (too vague)
- "Improve profile" (not specific)

## Checklist

Before saving the task files:

- [ ] Determined task type (single task vs. feature with sub-issues)
- [ ] Asked clarifying questions with lettered options
- [ ] Incorporated user's answers
- [ ] Created feature.json with Summary, Out of Scope, Technical Considerations
- [ ] Created story files for each user story (US-001, US-002, etc.)
- [ ] Each story is small enough to implement in one focused session
- [ ] Each story follows "As a [user], I want [X] so that [Y]" format
- [ ] Each story has specific, verifiable acceptance criteria
- [ ] Dependencies between stories are declared (or explicitly empty)
- [ ] `acceptanceChecks` and `acceptanceType` are present (empty/null — filled by `/acceptance-criteria`)
- [ ] Showed draft to user for feedback
- [ ] User confirmed or provided additions

## Next Steps (remind the user)

After planning is complete, remind the user:

> "Tasks saved to `.tasks/FEAT-xxx/`. Next steps:
> 1. Run `/acceptance-criteria FEAT-xxx` to generate testable verification checks
> 2. Run `/ship FEAT-xxx` to execute"
