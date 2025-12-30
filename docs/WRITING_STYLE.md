# Documentation Writing Style Guide

This guide provides detailed examples and patterns for writing project documentation. All documentation must follow these standards.

## Voice and Pronouns

### Prohibited Patterns

Never use first-person pronouns in documentation:

| Avoid | Use Instead |
|-------|-------------|
| "I built this to solve..." | "This project solves..." |
| "We recommend..." | "The recommended approach is..." |
| "Our implementation uses..." | "The implementation uses..." |
| "I've found that..." | "Experience shows that..." |
| "Let me explain..." | (Just explain directly) |

### Preferred Constructions

**Passive voice** when the actor is unimportant:

```
The configuration is loaded from environment variables.
Requests are validated before processing.
```

**Active voice with the system as subject**:

```
The application handles authentication through NextAuth.
Claude Code executes in a sandboxed environment.
```

**Imperative mood for instructions**:

```
Run the following command.
Configure the environment variables.
Create a new branch before making changes.
```

**Existential constructions**:

```
There are three authentication methods available.
Several configuration options exist for customization.
```

## Tone

### Documentation vs Marketing

| Documentation (Preferred) | Marketing (Avoid) |
|---------------------------|-------------------|
| "This tool automates X" | "Revolutionary automation" |
| "Users can configure Y" | "Powerful configuration" |
| "Handles Z use cases" | "Best-in-class Z support" |
| "Requires Claude account" | "Leverages Claude power" |

### Curious, Not Selling

Documentation should:
- Explain functionality clearly
- Acknowledge limitations
- Guide users to solutions
- Invite feedback

Documentation should NOT:
- Make competitive claims
- Use superlatives
- Promise outcomes
- Oversell capabilities

### Honest About Limitations

This project is opinionated. Documentation should help users determine fit quickly:

**State constraints directly:**

```markdown
## Who This Is For

- Teams using GitLab for source control
- Organizations wanting web-based AI code assistance
- Environments where Docker deployment is acceptable

## Who Should Look Elsewhere

- GitHub-only workflows (GitLab integration is primary)
- Users needing real-time collaborative editing
- Environments requiring serverless deployment
```

**Explain design decisions:**

```markdown
The workspace model assumes one active branch per workspace. This simplifies
state management but means parallel branch work requires multiple workspaces.
```

**Acknowledge trade-offs:**

| Pattern | Example |
|---------|---------|
| Scope limitation | "This tool handles X but not Y" |
| Design trade-off | "Optimized for A at the cost of B" |
| Future consideration | "Z support is not currently planned" |

## Structure Patterns

### Prerequisites Section

Always list what readers need before starting:

```markdown
## Prerequisites

- Node.js 18 or higher
- pnpm package manager
- Docker (for production deployment)
- Claude account with active subscription
```

### Step-by-Step Instructions

Number steps. One action per step:

```markdown
### Installation

1. Clone the repository
2. Install dependencies
3. Configure environment variables
4. Start the development server
```

### Code Examples

Show code, then explain. Not the reverse:

```markdown
Configure the API endpoint:

\`\`\`typescript
const config = {
  endpoint: process.env.API_URL,
  timeout: 30000,
};
\`\`\`

The `timeout` value is in milliseconds.
```

### Tables for Reference Data

Use tables when data has multiple attributes:

```markdown
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `API_URL` | Yes | - | Backend API endpoint |
| `TIMEOUT` | No | 30000 | Request timeout (ms) |
```

## Specific Patterns

### Error Messages and Troubleshooting

State the problem, then the solution:

```markdown
### Connection Refused Error

**Symptom:** API requests fail with "Connection refused"

**Cause:** The backend service is not running

**Solution:** Start the backend service:

\`\`\`bash
docker compose up -d
\`\`\`
```

### Configuration Documentation

Group related options. Show defaults:

```markdown
## Authentication Options

### Session Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `SESSION_DURATION` | 24h | How long sessions remain valid |
| `REFRESH_ENABLED` | true | Allow session refresh |

### API Key Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `API_KEY_PREFIX` | wf_ | Prefix for generated keys |
| `KEY_ROTATION` | 90d | Recommended rotation period |
```

### Feature Documentation

State purpose, then mechanics:

```markdown
## Workspace Management

The workspace manager handles repository lifecycle operations including cloning, branch management, and cleanup.

### Creating a Workspace

Workspaces are created by cloning a git repository:

\`\`\`bash
POST /api/workspaces
{
  "url": "https://gitlab.example.com/repo.git",
  "branch": "main"
}
\`\`\`
```

## Links and References

### Internal Links

Use relative paths with `/docs/` prefix:

```markdown
See [Environment Setup](/docs/environment) for configuration details.
```

### External Links

Indicate external destinations:

```markdown
Refer to the [Claude Code documentation](https://docs.anthropic.com/claude-code) for CLI usage.
```

### Related Documentation

End sections with next steps:

```markdown
## Next Steps

- [API Operations](/docs/api-operations) - Using the API endpoints
- [Docker Setup](/docs/docker) - Production deployment
- [Troubleshooting](/docs/troubleshooting) - Common issues
```

## Common Mistakes

### Anthropomorphizing Software

| Avoid | Use Instead |
|-------|-------------|
| "The system wants you to..." | "The system requires..." |
| "It tries to..." | "It attempts to..." |
| "The app thinks..." | "The app determines..." |

### Unnecessary Hedging

| Avoid | Use Instead |
|-------|-------------|
| "You might want to consider..." | "Consider..." |
| "It's probably best to..." | "The recommended approach is..." |
| "You may need to possibly..." | "You may need to..." |

### Redundant Instructions

| Avoid | Use Instead |
|-------|-------------|
| "Go ahead and run..." | "Run..." |
| "Simply click the button..." | "Click the button..." |
| "Just enter your password..." | "Enter your password..." |

## Review Questions

Before submitting documentation:

1. Are there any first-person pronouns?
2. Does every section have a clear purpose statement?
3. Are prerequisites listed before instructions?
4. Do code blocks contain only executable content?
5. Are related docs linked at the end?
6. Is the Claude Code dependency disclosure included (if public-facing)?
7. Does the tone explain rather than sell?
