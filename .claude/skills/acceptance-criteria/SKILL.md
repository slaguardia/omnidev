---
name: acceptance-criteria
description: 'Generate testable acceptance criteria for existing tasks or features. Works on single tasks or entire features. Reads from Linear or local .tasks/ files. Triggers on: /acceptance-criteria, generate criteria, add acceptance criteria.'
---

# Acceptance Criteria Generator

Generate concrete, testable acceptance criteria for existing tasks. Works on a single task or an entire feature (all stories). Reads from and writes back to the same source — Linear issues or local `.tasks/` files.

**This skill does not create tasks or plan features.** It takes existing tasks that lack (or have weak) acceptance criteria and produces criteria that are specific enough for a machine or human to verify.

---

## Invocation

```
# Entire feature (all stories)
/acceptance-criteria FEAT-20240115_123456-abc1
/acceptance-criteria LIN-1234

# Single task/story
/acceptance-criteria US-001 --feature FEAT-xxx
/acceptance-criteria LIN-5678
```

---

## Detect Task Type

1. **Single task** — one issue or one story file. Generate criteria for it alone.
2. **Feature with sub-issues** — parent with children. Generate criteria for every sub-issue/story that is missing or has weak criteria. Skip stories that already have strong criteria (ask the user if unclear).

---

## The Job

### Step 1: Load tasks

- **Linear:** `get_issue` for the target, `list_issues` with `parentId` for sub-issues
- **Local:** Read `.tasks/FEAT-xxx/feature.json` and `stories/US-XXX.json`

### Step 2: Analyze existing criteria

For each story, assess what exists:
- **No criteria:** Needs full generation
- **Vague criteria** (e.g., "works correctly", "looks good"): Needs replacement
- **Strong criteria** (specific, verifiable assertions): Skip unless user asks to refine

Show the user a summary:
```
US-001: Add OAuth config          — no criteria (needs generation)
US-002: Create callback route     — vague ("works correctly") (needs refinement)
US-003: Add token refresh         — strong (3 specific checks) (skipping)
US-004: Wire up protected routes  — no criteria (needs generation)

Generating criteria for US-001, US-002, US-004. US-003 looks good. Proceed?
```

### Step 3: Research the codebase

Before generating criteria, understand what's being built:
- Read the feature description/summary
- Read each story's description and user story
- Explore relevant parts of the codebase (the files/modules each story will touch)
- Understand the project's test patterns, linting setup, and type system

This research is critical — generic criteria are useless. Criteria must be grounded in the actual codebase.

### Step 4: Generate criteria

For each story needing criteria, produce two things:

#### Acceptance Criteria (human-readable)

Specific, verifiable statements. Each one answers: "How do I confirm this is done?"

Good:
- "POST /api/oauth/callback returns 200 with valid auth code"
- "Token refresh triggers automatically when token expires within 5 minutes"
- "Protected routes return 401 when no session cookie is present"

Bad:
- "OAuth works correctly"
- "Error handling is good"
- "Code is clean"

#### Acceptance Checks (machine-executable)

Concrete commands or assertions that can be run to verify the criteria:

```json
{
  "acceptanceChecks": [
    "pnpm typecheck",
    "pnpm test -- --grep 'oauth'",
    "grep -r 'export.*OAuthProvider' src/",
    "pnpm lint:all"
  ]
}
```

These should include:
- **Always:** `pnpm typecheck`, `pnpm lint:all` (baseline quality)
- **When tests exist or should exist:** `pnpm test` with relevant filter
- **Structural assertions:** grep for expected exports, file existence, route registration
- **Build checks:** `pnpm build` if the story touches build-affecting code

#### Acceptance Type

Classify each story:

- **`automated`** — All criteria can be verified by running commands. No human eyeballs needed.
- **`human`** — At least one criterion requires human verification (visual UI behavior, UX flow, subjective quality). This will cause `/ship` to pause for human confirmation.

Criteria that require human verification:
- Visual appearance or layout
- UX flow correctness (multi-step interactions)
- Copy/content review
- Anything requiring judgment ("feels right", "is intuitive")

### Step 5: Present draft to user

Show all generated criteria to the user before saving:

```
## US-001: Add OAuth config

**Acceptance Type:** automated

**Acceptance Criteria:**
- OAuth provider configuration exists in src/shared/src/lib/auth/
- Provider config exports OAuthProviderConfig type
- Environment variables documented in .env.example
- TypeScript compiles with no errors

**Acceptance Checks:**
- pnpm typecheck
- grep -r 'OAuthProviderConfig' src/shared/
- grep 'OAUTH' .env.example

---

## US-002: Create callback route

**Acceptance Type:** human

**Acceptance Criteria:**
- GET /api/auth/callback processes OAuth code exchange
- Successful auth redirects to /dashboard
- Failed auth shows error message (human: verify error UX)
- TypeScript compiles with no errors

**Acceptance Checks:**
- pnpm typecheck
- pnpm test -- --grep 'callback'
- pnpm lint:all

---

Anything to change before I save these?
```

### Step 6: Save to source

After user confirms:

- **Linear:** Update each sub-issue description to include the acceptance criteria and checks. Use a structured format at the end of the description:

```markdown
## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Acceptance Checks
`pnpm typecheck`
`pnpm test -- --grep 'oauth'`

## Acceptance Type: automated
```

- **Local `.tasks/`:** Update each `stories/US-XXX.json`:

```json
{
  "acceptanceCriteria": [
    "OAuth provider configuration exists in src/shared/src/lib/auth/",
    "Provider config exports OAuthProviderConfig type"
  ],
  "acceptanceChecks": [
    "pnpm typecheck",
    "grep -r 'OAuthProviderConfig' src/shared/"
  ],
  "acceptanceType": "automated"
}
```

---

## Guidelines

### Criteria Quality

- Every criterion must be verifiable — either by a command or by a human looking at something specific
- Criteria should test behavior and contracts, not implementation details
- Include edge cases and error states where relevant
- For UI stories, specify what to look at ("the button appears in the top-right of the nav bar"), not vague descriptions ("UI looks correct")

### When to flag for human review

If you're uncertain whether a criterion should be automated or human-verified, default to `human`. A false pause is better than shipping unverified work.

### Respect existing criteria

If a story already has strong criteria, don't overwrite them unless the user explicitly asks. Offer to refine or supplement instead.

---

## Checklist

- [ ] Loaded all tasks from source (Linear or `.tasks/`)
- [ ] Assessed existing criteria quality for each story
- [ ] Showed summary of what needs generation
- [ ] Researched codebase for each story's context
- [ ] Generated specific, verifiable criteria (not generic)
- [ ] Included machine-executable acceptance checks
- [ ] Classified each story as automated or human acceptance type
- [ ] Showed draft to user for review
- [ ] Saved to source (Linear or `.tasks/`) after user confirmation
