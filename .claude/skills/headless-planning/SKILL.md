---
name: headless-planning
description: 'Async iterative planning via markdown files. Creates planning documents with embedded questions, user answers inline, Claude continues until ready to create task files. Triggers on: /headless-planning, async planning, headless tasks.'
---

# Headless Iterative Planning (Local Tasks)

Asynchronous planning workflow that uses markdown files as the communication medium. Questions and answers happen directly in a planning document, not in chat.

**End goal:** Local JSON task files containing a feature definition and user stories with acceptance criteria.

## The Job

1. User provides a feature idea (or existing planning document to continue)
2. **If existing document provided:** Read it first, review what's already planned
3. Claude creates/updates a markdown planning document with embedded questions
4. User answers questions by editing the markdown file
5. User returns and asks Claude to continue (`/headless-planning planning-doc.md`)
6. Claude reads answers, asks follow-up questions OR creates task files
7. Repeat until planning is complete

**Key difference from interactive-planning:** All Q&A happens in a markdown document, not in chat.

## Workflow States

### State 1: Questions Pending

```markdown
# Feature Planning: [Feature Title]

## Summary

[Initial understanding of the feature]

---

## Planning Questions

Please answer these questions inline (replace the placeholders):

### 1. What problem does this solve?

**Your answer:** [ANSWER HERE]

### 2. Who is the primary user?

**Your answer:** [ANSWER HERE]

### 3. What's the scope?

**Your answer:** [ANSWER HERE]

---

**Status:** Waiting for answers. Once complete, run: `/headless-planning planning-doc.md`
```

### State 2: Ready for Task Files

```markdown
# Feature Planning: [Feature Title]

## Summary

[Refined summary based on answers]

## Out of Scope

- [Item 1]
- [Item 2]

## Technical Considerations

- [Item 1]

---

**Status:** Planning complete. Task files created in .tasks/FEAT-xxx/
```

## Step 1: Initial Document Creation

When user provides a feature idea:

1. Create planning markdown document
2. Filename: `planning-[feature-slug].md`
3. Document contains:
   - Initial summary
   - 3-5 clarifying questions with answer placeholders
   - Instructions for user
   - Status indicator

### Question Format

```markdown
### 1. [Question]

**Your answer:** [ANSWER HERE]
```

## Step 2: Continue Planning

When user provides a planning document path:

1. Read the planning document
2. Parse answers from the document
3. Check if existing task files already exist
4. Create task files if ready, or ask follow-up questions

## Step 3: Create Task Files

When all questions are answered:

1. Update planning document with final feature design
2. Remove questions section
3. Create task files in `.tasks/` directory

### Task File Structure

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

### feature.json

```json
{
  "id": "FEAT-20240115_123456-abc1",
  "title": "Feature: [Title]",
  "summary": "...",
  "status": "planning",
  "createdAt": "ISO timestamp",
  "outOfScope": [...],
  "technicalConsiderations": [...],
  "storiesCount": N
}
```

### stories/US-XXX.json

```json
{
  "id": "US-001",
  "featureId": "FEAT-...",
  "title": "Story title",
  "userStory": "As a [user], I want [feature] so that [benefit].",
  "acceptanceCriteria": [...],
  "dependencies": [],
  "status": "todo",
  "createdAt": "ISO timestamp",
  "completedAt": null,
  "iteration": null
}
```

## Usage Examples

### Start New Planning

```bash
/headless-planning "add host messaging feature"
```

Creates: `planning-host-messaging.md`

### Continue Planning

```bash
/headless-planning planning-host-messaging.md
```

Reads the document, processes answers, and either asks more questions or creates task files.

## Checklist

Before creating task files:

- [ ] Read existing planning document
- [ ] Checked for existing task files
- [ ] All questions have been answered
- [ ] Skipped questions already answered by existing content
- [ ] Planning document updated with final Summary, Out of Scope
- [ ] Task files created in `.tasks/` directory
- [ ] Each story has acceptance criteria
- [ ] Status updated to "Planning complete"
