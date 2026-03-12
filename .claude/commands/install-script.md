---
description: 'Install ralph.sh script to your project'
allowed-tools: ['Bash']
---

# Install Ralph Script

Copy the `ralph.sh` script and its prompt file to your current project directory.

## Instructions

Run these commands to copy the files:

```bash
cp "${CLAUDE_PLUGIN_ROOT}/scripts/ralph.sh" ./ralph.sh && chmod +x ./ralph.sh
cp "${CLAUDE_PLUGIN_ROOT}/scripts/ralph-prompt.md" ./ralph-prompt.md
```

Then confirm success:

```bash
ls -la ./ralph.sh ./ralph-prompt.md
```

## After Installation

The script is now available in your project root. Run it with:

```bash
./ralph.sh FEATURE_ID
```

Or add it to your PATH for global access.

## Script Options

```bash
./ralph.sh <FEATURE_ID> [options]

Options:
  --tasks-dir DIR     Tasks directory (default: .tasks)
  --max-iterations N  Maximum iterations before stopping (default: 10)
  --sleep N           Seconds to wait between iterations (default: 2)
  --help, -h          Show help message
```
