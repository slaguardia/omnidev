# Import Tasks from Markdown

Import tasks from a markdown file into local JSON task format.

## Usage

```bash
/import-tasks path/to/tasks.md
```

## Supported Markdown Formats

### Format 1: Feature with User Stories

```markdown
# Feature: Enable host messaging

Allow event hosts to send direct messages to attendees.

## Out of Scope

- Group messaging
- Rich media attachments

## User Stories

### US-001: View attendee list

As an event host, I want to see my attendees so I can select who to message.

**Acceptance Criteria:**

- [ ] Show list of all registered attendees
- [ ] Display attendee name and status
- [ ] Support search/filter by name

### US-002: Compose message

As an event host, I want to compose and send a message.

**Acceptance Criteria:**

- [ ] Open compose modal on click
- [ ] Support up to 1000 characters
- [ ] Show character count
```

### Format 2: Task List

```markdown
# Tasks: Implement Dark Mode

## Tasks

- [ ] Add theme context provider
- [ ] Create dark color palette
- [ ] Update components to use theme
- [ ] Add toggle in settings
- [ ] Persist preference to storage
```

### Format 3: GitHub-style Task List

```markdown
# Epic: User Authentication

- [ ] **US-001**: User registration form
  - Email validation
  - Password requirements
  - Terms acceptance
- [ ] **US-002**: Login functionality
  - Email/password login
  - Remember me option
  - Error handling
- [ ] **US-003**: Password reset
  - Request reset email
  - Token validation
  - New password form
```

## Output

Creates task files in `.tasks/` directory:

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

## Options

| Option            | Description                                   |
| ----------------- | --------------------------------------------- |
| `--tasks-dir DIR` | Output directory (default: .tasks)            |
| `--feature-id ID` | Use specific feature ID instead of generating |

## Examples

```bash
# Basic import
/import-tasks feature-spec.md

# Custom output directory
/import-tasks --tasks-dir ./my-tasks feature-spec.md

# Specify feature ID
/import-tasks --feature-id FEAT-auth feature-spec.md
```

## Behavior

1. **Parse markdown** - Extract feature title, summary, out of scope, stories
2. **Generate IDs** - Create feature ID and story IDs if not specified
3. **Create JSON** - Write feature.json, index.json, and story files
4. **Report** - Show created files and next steps

## After Import

```bash
# Start implementation
/ralph FEAT-20240115_123456-abc1

# Or run adversarial planning to refine
/team-planning --file feature-spec.md
```
