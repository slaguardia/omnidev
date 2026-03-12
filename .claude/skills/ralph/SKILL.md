---
name: ralph
description: 'Execute one Ralph Wiggum loop iteration. Reads local JSON tasks, implements next incomplete story, runs quality checks, marks complete. Triggers on: /ralph, ralph iterate, execute story.'
---

# Ralph Execution Skill (Local Tasks)

Execute ONE iteration of the Ralph Wiggum loop. Implements a single user story from local JSON task files, then exits for fresh context.

---

## Invocation

```
/ralph FEAT-20240115_123456-abc1
```

Where `FEAT-20240115_123456-abc1` is the feature ID from the `.tasks/` directory.

---

## The Flow

```
1. FETCH     -> Read feature.json and stories/*.json from .tasks/
2. CONTEXT   -> Read progress.txt for patterns/learnings
3. SELECT    -> Pick next incomplete story (lowest US-XXX number)
4. IMPLEMENT -> Build it, following acceptance criteria
5. VERIFY    -> Run typecheck, lint, format checks
6. COMMIT    -> Git commit with standardized message
7. UPDATE    -> Mark story JSON as done (status: "done")
8. LOG       -> Append learnings to progress.txt
9. EXIT      -> Return control (or signal COMPLETE if all done)
```

---

## Step 1: Fetch from Local Tasks

Read the task files from the feature directory:

```bash
cat .tasks/FEATURE_ID/feature.json
ls .tasks/FEATURE_ID/stories/
cat .tasks/FEATURE_ID/stories/US-001.json
```

Parse story files to find:

- Story ID (US-XXX from filename)
- Status (done = complete, anything else = incomplete)
- Description and acceptance criteria

---

## Step 2: Load Context

Read `progress.txt` if it exists. Look for:

- **Codebase Patterns** section - reusable conventions
- **Previous iterations** - what was already done, any gotchas

If progress.txt doesn't exist, create it from template.

---

## Step 3: Select Next Story

**Priority order:**

1. Any story currently "in_progress" (resume interrupted work)
2. Lowest-numbered incomplete story (US-001 before US-002)

**If all stories complete:**
Output `<promise>COMPLETE</promise>` and stop.

**Before implementing:**
Update the selected story JSON to status: "in_progress"

---

## Step 4: Implement

Read the story JSON for:

- User story format (As a... I want... so that...)
- Acceptance criteria (checklist items)

**Rules:**

- Implement ONLY this story, nothing more
- Follow patterns from progress.txt
- Follow codebase conventions from CLAUDE.md
- Make minimal, focused changes
- If you discover needed prerequisite work, STOP and note it

---

## Step 5: Quality Checks

**All must pass before committing:**

```bash
npx tsc --noEmit          # TypeScript (if applicable)
npm run lint              # Linter
npm run format -- --check # Formatter
```

**If checks fail:**

1. Fix the issues
2. Re-run checks
3. Repeat until passing
4. Do NOT commit broken code
5. Do NOT skip or disable checks

---

## Step 6: Commit

**Message format:**

```
feat: [US-XXX] Story title

Brief description of implementation.

Co-Authored-By: Claude <noreply@anthropic.com>
```

**Commands:**

```bash
git add -A
git commit -m "feat: [US-XXX] Story title..."
```

---

## Step 7: Update Local Task

Update the story JSON file:

```json
{
  "status": "done",
  "completedAt": "2024-01-15T12:34:56Z",
  "iteration": 2
}
```

Also update the feature's `index.json`:

- Increment `completedStories`
- Update `lastUpdated`

---

## Step 8: Log Progress

Append to `progress.txt`:

```markdown
---

## Iteration N - [ISO timestamp]

### Story: US-XXX - [Title]

**Status:** done

**Implemented:**

- [What was built]

**Files changed:**

- `path/to/file.ts` - [what changed]

**Learnings:**

- [Any patterns discovered]
- [Gotchas encountered]
- [Context for future iterations]
```

If you discovered a reusable pattern, add it to the **Codebase Patterns** section at the top.

---

## Step 9: Exit

**If all stories complete:**

1. Update feature.json status to "complete"
2. Output:
   ```
   <promise>COMPLETE</promise>
   ```

**If stories remain:**
Exit normally. The bash loop will spawn a fresh instance for the next story.

---

## Handling Problems

### Story is too complex

If you realize mid-implementation the story can't be done atomically:

1. STOP implementing
2. Revert uncommitted changes
3. Add note to story JSON: `"notes": "Needs breakdown - too complex"`
4. Log in progress.txt: "US-XXX needs breakdown"
5. Exit WITHOUT marking complete

### Missing dependency

If the story needs something from a later story:

1. Note the dependency
2. Log in progress.txt
3. Exit WITHOUT marking complete
4. (Human needs to reorder stories)

### Repeated check failures

If you can't fix failing checks after 3 attempts:

1. Revert: `git checkout -- .`
2. Add note to story JSON with error details
3. Log in progress.txt
4. Exit WITHOUT marking complete

---

## Output Example

```
Reading .tasks/FEAT-20240115_123456-abc1/feature.json...

Feature: "Allow hosts to message attendees"
Stories:
  [x] US-001 - Add schema [done]
  --> US-002 - Create action [todo] <- SELECTED
  [ ] US-003 - Build UI [todo]

Reading progress.txt... found 1 previous iteration.

Starting iteration 2: US-002 - Create announcement action

Updating US-002.json to in_progress...

Implementing...
[implementation details]

Running quality checks...
  [x] TypeScript: passed
  [x] Lint: passed
  [x] Format: passed

Committing...
  [x] feat: [US-002] Create announcement action

Updating US-002.json...
  [x] status -> done

Updating progress.txt...
  [x] Iteration 2 logged

Stories remaining: 1
Exiting for next iteration.
```
