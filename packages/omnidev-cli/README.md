# omnidev

CLI for managing [Omnidev](https://github.com/anthropics/omnidev) tasks from the command line. Works against any Omnidev instance — local or remote.

## Install

```bash
npm i -g omnidev
```

Or with pnpm/yarn:

```bash
pnpm add -g omnidev
yarn global add omnidev
```

## Configuration

The CLI needs two values: the Omnidev server URL and an API key.

### Option 1: Config file (recommended for global installs)

Create `~/.config/omnidev/.env`:

```env
OMNIDEV_URL=https://your-omnidev-instance.example.com
OMNIDEV_API_KEY=your-api-key-here
```

### Option 2: Environment variables

```bash
export OMNIDEV_URL=https://your-omnidev-instance.example.com
export OMNIDEV_API_KEY=your-api-key-here
```

### Option 3: Command-line flags

```bash
omnidev --url https://your-instance.example.com --api-key your-key tasks list
```

### Env file discovery order

When no `--url` or `--api-key` flags are provided, the CLI searches for `.env` files in this order (first match wins):

1. **`OMNIDEV_ENV_FILE`** env var — load a specific file path
2. **Repo-root walk-up** — walk up from cwd to find a `package.json` named `omnidev` or `omnidev-app`, load `.env`/`.env.local` from there
3. **XDG config** — `$XDG_CONFIG_HOME/omnidev/.env` (default `~/.config/omnidev/.env`)
4. **Current directory** — `.env`/`.env.local` in the working directory

## Usage

### Task management

```bash
omnidev tasks list                          # List all tasks
omnidev tasks list --status executing       # Filter by status
omnidev tasks show <ref>                    # Show task details (ID or RLP-N)
omnidev tasks create -w <workspace> -t "Title" -d "Description"
omnidev tasks update <ref> -t "New title"
omnidev tasks delete <ref>
omnidev tasks archive <ref>
omnidev tasks unarchive <ref>
omnidev tasks clone <ref>
```

### Workflow lifecycle

```bash
omnidev transition <ref> <status>           # Transition task to new status
omnidev run-stage <ref> <stage>             # Start a workflow stage
omnidev stage-answer <ref> --stage <stage> --answers '{"q1":"answer"}'
omnidev complete <ref>                      # Mark task complete
omnidev cancel-loop <ref>                   # Cancel a running loop
```

### Jobs

```bash
omnidev job <jobId>                         # Check job status
```

### Dependencies

```bash
omnidev deps show <ref>                     # Show task dependencies
omnidev deps add <ref> <blockerRef>         # Add a dependency
omnidev deps remove <ref> <blockerRef>      # Remove a dependency
omnidev deps graph                          # Show dependency graph
```

### Resources

```bash
omnidev workspaces                          # List workspaces
omnidev workspaces --branches               # Include branch info
omnidev projects                            # List projects
omnidev playbooks                           # List playbooks
```

### Common options

All commands support `--json` for machine-readable JSON output.

Task references (`<ref>`) accept task IDs, short codes (e.g., `RLP-1`), or `.` to use the `OMNIDEV_TASK_ID` environment variable.

## Environment variables

| Variable            | Description                                               |
| ------------------- | --------------------------------------------------------- |
| `OMNIDEV_URL`       | Server URL (default: `http://localhost:3000`)             |
| `OMNIDEV_API_KEY`   | API key for authentication                                |
| `OMNIDEV_CLI_TOKEN` | Scoped stage token (set by worker during agent execution) |
| `OMNIDEV_TASK_ID`   | Default task ID when using `.` as a reference             |
| `OMNIDEV_ENV_FILE`  | Explicit path to a `.env` file                            |

## Compatibility

The CLI targets the `/api/ralph/*` server API. Server and CLI versions are independent — the CLI semver reflects CLI and API-client breaking changes, not server releases.

## Development

From the Omnidev monorepo root:

```bash
pnpm ralph tasks list       # Run CLI via tsx (no build needed)
pnpm --filter omnidev build # Build the distributable
```

## License

MIT
