# Cursor SDK Integration

Omnidev uses the [Cursor TypeScript SDK](https://cursor.com/docs/sdk/typescript)
(`@cursor/sdk`) as the default agent backend. The SDK puts your Cursor plan to
use directly — Cursor models (`composer-2` and others) and Cursor's MCP/tool
ecosystem run in-process with no separate CLI subprocess.

This document covers the auth model, configuration, and operational concerns
for Cursor SDK usage. For SDK API details, see the upstream docs.

## Authentication

`CursorSdkAgent` reads the API key from the first source that has a value:

1. The per-call `options.extraEnv.CURSOR_API_KEY` (passed by the worker for
   per-job auth scoping)
2. The `apiKey` constructor option on `CursorSdkAgent`
3. The `CURSOR_API_KEY` environment variable

Generate an API key in [Cursor Dashboard → Integrations](https://cursor.com/dashboard).
For shared deployments, use a **Service Account API Key** from Team Settings
rather than a personal key.

```bash
# Local dev (.env)
CURSOR_API_KEY=cursor_sk_…

# Compose / Railway / Coolify — set as a service env var
```

API keys are bearer tokens. Treat them like passwords:

- Never commit them to git
- Rotate them when leaving a deployment
- Prefer service-account keys over user keys for production workers
- Revoke unused keys from the Cursor dashboard

### Why no volume-mounted credentials?

The Cursor SDK's auth model is API-key-based (no interactive `cursor login`
step like the Claude Code CLI). Pass the key via env var and the SDK handles
it; there is no `~/.cursor` credential file the worker needs to mount.

## Model Selection

`CursorSdkAgent` defaults to `composer-2`. Override per-instance:

```ts
const agent = new CursorSdkAgent({ modelId: 'composer-2' });
```

Discover available model ids via the SDK's `Cursor.models.list()` (see SDK
docs); pass the result through `modelId`. Model selection feeds directly into
`Agent.create({ model: { id } })`.

## Operational Notes

- **Concurrent runs**: a single `CursorSdkAgent` instance is safe to share
  across N concurrent `run()` calls. Each call constructs its own `SDKAgent`
  via `Agent.create` and disposes via `Symbol.asyncDispose` on completion or
  error.
- **Cancellation**: passing an `AbortSignal` in `AgentRunnerOptions` wires
  through to `run.cancel()`. The SDK terminates in-flight tool calls and the
  event stream ends with a `done` (stopReason="cancelled") event.
- **Token tracking**: usage data flows through the SDK's `onDelta` callback
  on `TokenDeltaUpdate` events; `CursorSdkAgent` aggregates these and emits
  a single trailing `usage_update` AgentEvent before stream completion.
- **Working directory**: `options.workingDirectory` becomes
  `local: { cwd }` on `Agent.create`. The agent operates on the cloned
  workspace the worker has already prepared.

## Structured Signals via MCP

The Ralph stage runner needs two signals from the agent that are unsuitable
for free-form text parsing: "this stage is complete" and "I need user input".
These flow through an in-process HTTP MCP server at
[`mcp-signals-server.ts`](../src/shared/src/lib/agent/mcp-signals-server.ts)
that `CursorSdkAgent` wires to every `Agent.create()` call via:

```ts
mcpServers: {
  'omnidev-signals': { type: 'http', url: '<lazy-init localhost URL>' },
}
```

### Tools the agent calls

| Tool                    | Args                      | Effect                                                |
| ----------------------- | ------------------------- | ----------------------------------------------------- |
| `mark_stage_complete`   | none                      | Ralph auto-loop terminates on this iteration          |
| `request_clarification` | `{ questions: string[] }` | Stage pauses; questions surface to the human reviewer |

### Why an MCP server, not inline tool definitions

The Cursor SDK has no inline-tool option on `Agent.create` — the only path
for custom tools is `mcpServers` (LocalAgentOptions). HTTP transport is
chosen over stdio because parallel agent runs in one worker would otherwise
spawn one MCP subprocess per run.

### Why HTTP, not stdio

The signals server is stateless — its tool handlers return trivial success
responses. The actual signal capture happens via the
[`AgentEvent.tool_call`](../src/shared/src/lib/agent/types.ts) stream that
`CursorSdkAgent` already produces. So one HTTP server, lazy-started on
worker boot, is enough for N concurrent agent runs.

### Why detection lives in `agent-runner.ts`, not the MCP handler

The MCP handler can't reach back into the worker's run-tracking state
(it's a separate request/response surface). The agent emitting the
`tool_call` SDKMessage is what `CursorSdkAgent` translates into our
`AgentEvent.tool_call`, and `consumeAgentStream` in
[`agent-runner.ts`](../src/shared/src/lib/agent/agent-runner.ts) reads
those events alongside the per-run state it already tracks.

## Failure Modes

| Symptom                                                                            | Likely cause                                           | Fix                                              |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------ |
| Stream emits a single unrecoverable `error` event with "CURSOR_API_KEY is not set" | Missing env var in worker container                    | Add `CURSOR_API_KEY` to the worker's environment |
| All runs fail with auth errors from the SDK                                        | Expired or revoked API key                             | Rotate key in Cursor dashboard, redeploy         |
| `error` event with `recoverable: true` and a network/rate-limit message            | Transient — Cursor API throttling or upstream blip     | Worker retry path handles this automatically     |
| Cancellation seems delayed                                                         | Tool call in-flight; SDK aborts at the next safe point | Expected — usually within a few seconds          |

## Switching Agents

The `AgentRunner` interface lets you swap implementations without touching
the pipeline. `CursorSdkAgent` is the only implementation today; future
backends (custom loops, other vendor SDKs) implement
[`AgentRunner`](../src/shared/src/lib/agent/types.ts) and the rest of the
system continues unchanged. The Claude Code CLI implementation was removed
during the migration (see commit `50dca80`); no fallback exists.
