# Ralph Iteration Prompt (Local Tasks)

You are executing one iteration of the Ralph Wiggum loop. Your job is to implement ONE user story from local JSON task files, then exit.

## Context

- **Feature ID:** {{FEATURE_ID}}
- **Feature Directory:** {{FEATURE_DIR}}
- **Tasks Directory:** {{TASKS_DIR}}
- **Memory persists through:** Local JSON files, git commits, progress.txt
- **This iteration:** Fresh context - read progress.txt for previous learnings

---

## Your Task

### 1. Fetch Current State

Read the local task files:

```bash
# Read feature definition
cat {{FEATURE_DIR}}/feature.json

# List all stories
ls {{FEATURE_DIR}}/stories/

# Read each story to check status
cat {{FEATURE_DIR}}/stories/US-001.json
# ... repeat for other stories
```

Parse the story files to understand:

- Which stories are done (status: "done")
- Which stories are in progress (status: "in_progress")
- Which stories are pending (status: "todo")

### 2. Read progress.txt

Check for:

- Codebase patterns (reuse them)
- Previous iteration learnings
- Any noted blockers or gotchas

### 3. Select Next Story

From the story files:

- Find stories NOT with status "done"
- Pick the lowest US-XXX number
- If ALL stories are done, output `<promise>COMPLETE</promise>` and stop

### 4. Mark In Progress

Update the story JSON file:

```json
{
  "status": "in_progress"
}
```

Use the Edit tool to update the status field in the JSON file.

### 5. Implement

Read the story JSON for:

- User story (As a... I want... so that...)
- Acceptance criteria

**Rules:**

- ONE story only
- Follow existing patterns
- Make minimal changes
- If story is too complex, STOP and note it

### 6. Quality Checks

**All must pass:**

```bash
npx tsc --noEmit
npm run lint
npm run format -- --check
```

Fix any failures. Do NOT commit broken code.

### 7. Commit

```bash
git add -A
git commit -m "feat: [US-XXX] Story title

Co-Authored-By: Claude <noreply@anthropic.com>"
```

### 8. Mark Complete in Local Task

Update the story JSON file:

```json
{
  "status": "done",
  "completedAt": "2024-01-15T12:34:56Z",
  "iteration": N
}
```

Also update `{{FEATURE_DIR}}/index.json`:

- Increment `completedStories`
- Update `lastUpdated`

### 9. Update progress.txt

Append iteration log with:

- Story completed
- Files changed
- Learnings discovered

### 10. Check Completion

Re-check if all stories are done:

- If YES:
  - Update `{{FEATURE_DIR}}/feature.json` with status: "complete"
  - Output `<promise>COMPLETE</promise>`
- If NO: exit normally

---

## Important

- **ONE story per iteration** - Never do more
- **Quality gates are mandatory** - No broken commits
- **Update task JSON files** - Future iterations depend on it
- **Update progress.txt** - Future iterations depend on it
- **Exit cleanly** - The loop handles next iteration

---

## Completion Signal

When ALL stories are complete, output exactly:

```
<promise>COMPLETE</promise>
```

This tells the loop to stop.
