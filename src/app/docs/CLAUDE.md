# Documentation Guidelines

## File Location

Documentation markdown files are stored in `/docs/` at the project root. The docs app reads from there.

## Formatting Guidelines

### Avoid ASCII Art Diagrams

ASCII diagrams using box-drawing characters (`┌ ┐ └ ┘ │ ─`) do NOT render correctly due to font inconsistencies. Instead, use:

- **Markdown tables** for comparisons or structured data
- **Bullet lists** for hierarchical information
- **Bold headers** with indented content for sections

**Bad:**

```
┌─────────────┐
│  Component  │
└─────────────┘
```

**Good:**
| Component | Description |
|-----------|-------------|
| App | Main application |

### Code Blocks & Snippets

The renderer automatically detects and styles different code block types:

1. **Command blocks** - Lines starting with: `npm`, `pnpm`, `yarn`, `npx`, `git`, `cd`, `cp`, `mv`, `mkdir`, `rm`, `touch`, `cat`, `echo`, `export`, `curl`, `wget`, `docker`, `kubectl`, `pip`, `python`, `node`, `bun`, `deno`
2. **Directory structures** - Detected by tree characters (`├ └ │ ─`) or path patterns
3. **Regular code** - Everything else, rendered with copy button

#### Avoid Comments in Command Blocks

**Important:** Standalone comments (lines starting with `#`) in command blocks are rendered as italic text, NOT as copyable code. This can break the intended formatting.

**Bad - comment renders as italic text:**

```bash
# Install dependencies
npm install
```

**Good - no comments, or use inline comments:**

```bash
npm install
```

Or explain commands outside the code block in regular text.

#### Code Block Behavior

- **Single commands:** Rendered as individual copyable snippets
- **Multi-line code (functions, configs):** Rendered as one copyable block
- **Mixed content:** If 50%+ of lines are commands, each line becomes a separate snippet

#### Best Practices

1. Keep command blocks simple - one command per block when possible
2. Put explanatory text outside code blocks, not as comments inside
3. For configuration files or code examples, use the appropriate language tag (`typescript, `json, etc.)
4. Directory structures are automatically detected and rendered without copy buttons

### Tables

Use standard markdown table syntax. Tables are styled automatically with proper headers and dividers.

### Headings

- Use `##` for main sections (renders with bottom border)
- Use `###` for subsections
- Use `####` for minor sections
- Headings automatically generate anchor links for the table of contents

### Lists

Both ordered and unordered lists are supported. Nested lists work as expected.

### Links

- Internal links: `[Text](/docs/slug)`
- External links automatically show an external link icon
