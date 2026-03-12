---
name: interactive-planning
description: 'Create or update local task files with user stories and acceptance criteria. Triggers on: create task, draft tasks for, plan tasks for, /interactive-planning.'
---

# Interactive Planning (Local Tasks)

Create detailed local task files that are clear, actionable, and suitable for implementation.

**End goal:** Local JSON task files with a feature definition (feature.json) and sub-task files (stories/US-XXX.json).

- **Feature file:** Feature design only - Summary, Out of Scope, Technical Considerations. NO acceptance criteria, NO open questions.
- **Story files:** User stories with acceptance criteria. Each is independently implementable.

## The Job

1. Receive a feature description from the user (or existing feature ID to edit)
2. **If existing feature ID provided:** Read existing task files first, review what's already planned
3. Ask 3-5 essential clarifying questions (with lettered options)
4. Generate a structured task set with multiple user stories
5. Show draft to user - **they can say what's missing**
6. Save feature.json and story files to `.tasks/` directory
7. Return the feature ID and path

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
  "dependencies": [],
  "status": "todo",
  "createdAt": "ISO timestamp",
  "completedAt": null,
  "iteration": null
}
```

### User Story Guidelines

- Each story should be independently implementable
- Break complex features into logical pieces
- Number stories sequentially (US-001, US-002, etc.)
- Stories should be small enough to complete in one focused session

### Acceptance Criteria Standards

- Must be verifiable (not "works correctly")
- Include edge cases and error states
- For UI changes: "Verify [specific visual/behavior] in simulator"
- For data changes: "Confirm [state before/after]"

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

- [ ] Asked clarifying questions with lettered options
- [ ] Incorporated user's answers
- [ ] Created feature.json with Summary, Out of Scope, Technical Considerations
- [ ] Created story files for each user story (US-001, US-002, etc.)
- [ ] Each story is small enough to implement in one focused session
- [ ] Each story follows "As a [user], I want [X] so that [Y]" format
- [ ] Each story has specific, verifiable acceptance criteria
- [ ] Showed draft to user for feedback
- [ ] User confirmed or provided additions
