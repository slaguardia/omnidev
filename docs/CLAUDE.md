# Documentation Guidelines

This file establishes design principles and writing standards for Omnidev documentation. These guidelines are subject to change as the project develops.

## Core Principles

### Project Identity

**Omnidev** is a single developer bot orchestration runtime that spans many workspaces, adapts to user-defined workflows, runs anywhere, and uses the [Cursor SDK](https://cursor.com/docs/sdk/typescript) (the user's own Cursor plan) for agent intelligence.

Omnidev is:

- A self-hostable workflow orchestration runtime (task → job → repo change), not a hosted AI service
- One bot identity spanning many workspaces
- Modular workflows and deploy-anywhere operation

Omnidev is NOT:

- A SaaS AI product
- A multi-bot system
- An AI model provider
- A Cursor SDK replacement

### Project Philosophy

Omnidev adapts to developer workflows, not the other way around. The architecture reflects this principle: one bot, many workspaces, with workspace-scoped behavior.

Documentation should:

- Acknowledge the single-bot model clearly
- Explain the relationship to the Cursor SDK (dependency, not partnership)
- Be clear about what the project does and does not support
- Help users determine if this tool fits their workflow

Users benefit from understanding constraints early rather than discovering them after investment.

### Voice and Tone

| Guideline                | Rationale                                                       |
| ------------------------ | --------------------------------------------------------------- |
| No first-person pronouns | Avoid "I", "we", "our". Use passive voice or direct instruction |
| Curious, not promotional | Documentation explains; marketing sells. Keep them separate     |
| Direct and concise       | Respect reader time. Remove unnecessary words                   |
| Technical accuracy first | Correctness matters more than polish                            |
| Honest about limitations | State what the project does not do; save users time             |

### Writing Standards

**Preferred:**

- "The application handles..."
- "Users can configure..."
- "This module provides..."
- "Run the following command..."

**Avoid:**

- "I built this to..."
- "We designed our system..."
- "Our approach is..."
- "Let me explain..."

## Document Structure

### README Requirements

The README answers five questions quickly:

| Question           | Section                                    |
| ------------------ | ------------------------------------------ |
| What is this?      | One-sentence description at top            |
| Why does it exist? | Problem statement, motivation              |
| What does it do?   | Concrete capabilities, not hype            |
| Who is it for?     | Target users AND who should look elsewhere |
| How to start?      | 5-10 minute quick start                    |

Include these additional sections:

- **Non-goals** - What this intentionally does NOT do
- **Roadmap / ideas** - Invite feedback on direction
- **License** - MIT

### Technical Documentation

Each technical doc should include:

1. **Purpose statement** - What problem this solves
2. **Prerequisites** - What the reader needs before starting
3. **Steps or reference** - Actionable content
4. **Next steps** - Links to related documentation

## Cursor SDK Dependency Disclosure

All public-facing documentation must include this disclosure:

```markdown
## Cursor SDK Dependency

Omnidev depends on the [`@cursor/sdk`](https://www.npmjs.com/package/@cursor/sdk)
package and a valid Cursor API key. Users bring their own Cursor plan;
the SDK is a product of Anysphere Inc. and is not affiliated with this project.
```

### Relationship to the Cursor SDK

Omnidev uses the Cursor SDK as an agent runtime. Omnidev does not replace, reimplement, or resell Cursor. Cursor models run remotely (inference); tool execution and git operations stay local to the worker.

| Omnidev Responsibilities      | Cursor SDK Responsibilities        |
| ----------------------------- | ---------------------------------- |
| Workflow orchestration        | Model inference + decision-making  |
| Event handling                | Tool dispatch                      |
| Workspace scoping             | Conversation + tool-call streaming |
| Permission boundaries         |                                    |
| Git lifecycle (clone/push/PR) |                                    |
| Integration lifecycle         |                                    |

### Branding Guidelines

**Acceptable phrasing:**

- "Single developer bot orchestration runtime"
- "One bot, many workspaces"
- "Workspace-scoped behavior"
- "Orchestration layer / automation runtime"
- "Bring your own AI"
- "Runs an agent via the Cursor SDK for code analysis and editing"
- "Integrates with the Cursor SDK"

**Avoid these patterns:**

- "Multi-bot system"
- "Agent framework"
- "AI platform"
- "Hosted AI service"
- "Cursor replacement"
- "Powered by Claude" (implies partnership)
- "Built on Claude" (implies foundation/endorsement)
- "Claude-native" (implies official status)
- Any phrasing suggesting resale or access provision

## Formatting Standards

### Code Blocks

Keep command blocks simple. Explain context outside the block:

**Preferred:**

Install dependencies:

```bash
pnpm install
```

**Avoid:**

```bash
# Install all project dependencies
pnpm install
```

### Tables vs Lists

Use tables for:

- Comparisons
- Reference data with multiple attributes
- Configuration options

Use lists for:

- Sequential steps
- Hierarchical information
- Simple enumerations

### Headings

- `##` for main sections (renders with border)
- `###` for subsections
- `####` for minor sections
- Headings generate anchor links automatically

## Related Documentation

| Document                 | Purpose                               |
| ------------------------ | ------------------------------------- |
| `docs/WRITING_STYLE.md`  | Detailed examples and patterns        |
| `src/app/docs/CLAUDE.md` | Documentation renderer implementation |

## File Organization

| Location            | Purpose                                      |
| ------------------- | -------------------------------------------- |
| `/docs/`            | User-facing documentation, served at `/docs` |
| `/CLAUDE.md`        | AI assistant context for code navigation     |
| `/src/**/CLAUDE.md` | AI assistant context for specific modules    |
| `/README.md`        | Project overview and quick start             |

### Documentation File Naming

- Use `SCREAMING_SNAKE_CASE.md` for documentation files
- Names should describe content, not audience
- Examples: `API_AUTHENTICATION.md`, `DOCKER.md`, `ENVIRONMENT.md`

## Success Criteria

Documentation succeeds when:

- Readers find answers without additional questions
- Setup takes 5-10 minutes for the quick start path
- Technical accuracy enables immediate action
- Tone invites feedback and contribution

Documentation is NOT measured by:

- Length or comprehensiveness
- Promotional effectiveness
- Visual polish

## Review Checklist

Before merging documentation changes:

- [ ] No first-person pronouns ("I", "we", "our")
- [ ] Cursor SDK dependency disclosure present (if public-facing)
- [ ] Branding guidelines followed
- [ ] Code blocks contain only executable content
- [ ] Links to related docs included
- [ ] Prerequisites clearly stated
