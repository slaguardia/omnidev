# Headless Planning Examples

## Example 1: Starting New Planning

**User:** `/headless-planning add search functionality`

**Claude creates `planning-search-functionality.md`:**

```markdown
# Feature Planning: Add Search Functionality

## Summary

Add search capability to help users find content quickly.

---

## Planning Questions

Please answer these questions inline (replace the placeholders):

### 1. What content should be searchable?

**Your answer:** [ANSWER HERE]

### 2. What search features are needed?

- [ ] Basic keyword search
- [ ] Filters (date, type, author)
- [ ] Advanced search syntax
- [ ] Search suggestions/autocomplete

**Your answer:** [SELECT OPTIONS OR DESCRIBE]

### 3. Where should search be accessible?

**Your answer:** [ANSWER HERE]

### 4. What are the performance requirements?

**Your answer:** [ANSWER HERE]

---

**Status:** Waiting for answers. Once complete, run:
`/headless-planning planning-search-functionality.md`
```

---

## Example 2: Continuing Planning

**User edits `planning-search-functionality.md`:**

```markdown
### 1. What content should be searchable?

**Your answer:** Articles, user profiles, and comments

### 2. What search features are needed?

**Your answer:** Basic keyword search and filters for date and content type. No autocomplete for now.

### 3. Where should search be accessible?

**Your answer:** Global search bar in header, plus dedicated search page

### 4. What are the performance requirements?

**Your answer:** Results within 500ms for typical queries
```

**User:** `/headless-planning planning-search-functionality.md`

**Claude reads answers and creates task files:**

```
Reading planning document...

All questions answered. Creating task files...

Created: .tasks/FEAT-20240115_160030-s4r2/
  - feature.json
  - stories/US-001.json (Build search index)
  - stories/US-002.json (Add global search bar)
  - stories/US-003.json (Create search results page)
  - stories/US-004.json (Implement search filters)
  - stories/US-005.json (Optimize search performance)

Updated planning document with final design.

To start implementation:
  /ralph FEAT-20240115_160030-s4r2
```

---

## Example 3: Follow-up Questions

**Initial document has vague answers:**

```markdown
### 1. What content should be searchable?

**Your answer:** Everything

### 2. What search features are needed?

**Your answer:** Basic search
```

**Claude adds follow-up questions:**

```markdown
---

## Follow-up Questions

Your answers need clarification:

### 1a. "Everything" is too broad. Please specify:
- [ ] User-generated content (posts, comments)
- [ ] System content (help articles, docs)
- [ ] User profiles
- [ ] Files and attachments
- [ ] Chat messages

**Your answer:** [SELECT SPECIFIC ITEMS]

### 2a. For "basic search", please clarify:
- Should partial matches work? (e.g., "search" matches "searching")
- Should search be case-insensitive?
- How many results per page?

**Your answer:** [ANSWER HERE]

---

**Status:** Waiting for clarification. Once complete, run:
`/headless-planning planning-search-functionality.md`
```

---

## Example 4: Team Async Workflow

**Day 1 - Developer creates planning doc:**

```bash
/headless-planning "implement real-time notifications"
```

**Day 1 - PM reviews and answers questions in Linear/GitHub/etc:**

- Opens `planning-real-time-notifications.md`
- Fills in answers based on product requirements
- Commits changes

**Day 2 - Developer continues:**

```bash
/headless-planning planning-real-time-notifications.md
```

**Claude creates task files, developer starts implementation:**

```bash
/ralph FEAT-20240116_090000-n2k8
```

This workflow allows async collaboration without requiring real-time chat.
