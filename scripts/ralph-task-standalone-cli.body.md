## Goal

Ship the Omnidev Ralph CLI as its own installable package (for example `npm i -g @scope/omnidev-cli`) so users can manage tasks against **any** Omnidev instance (local or remote) without cloning the full app repo.

## Approach (same repo is fine)

- Add `packages/omnidev-cli` (or similar) with its own `package.json`, `bin`, and build (ESM).
- Enable pnpm workspaces at repo root; keep `pnpm ralph` wired to the workspace package for dev.
- Move or copy current `src/cli/*` into the package; ensure no imports from `@/lib` (already HTTP-only).

## Config / UX for global installs

- Replace or extend repo-root discovery (`package.json` name `omnidev`): support cwd `.env`, XDG-style config, and/or `OMNIDEV_ENV_FILE`.
- Optional Commander globals: `--url`, `--api-key` (override env for one-off use).

## Publishing

- Document semver and server API compatibility (`/api/ralph/*`).
- CI/release: publish from `packages/omnidev-cli` on tag (optional).

## Acceptance criteria

- `pnpm ralph` still works from monorepo root.
- Published package runs against a remote `OMNIDEV_URL` with `OMNIDEV_API_KEY` only.
- README or docs point to install and env vars (align with `docs/RALPH_CLI.md`).
