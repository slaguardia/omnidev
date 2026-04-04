# Progress: Publish Ralph CLI as standalone npm package (monorepo)

## Completed

### Iteration 1 — Phases 1-4: Scaffold monorepo, move CLI source, wire root

- Created `pnpm-workspace.yaml` with `packages/*`
- Created `packages/omnidev-cli/package.json` (name: `omnidev`, version: `0.1.0`, ESM, bin entry)
- Created `packages/omnidev-cli/tsconfig.json` (standalone TS config, NodeNext modules)
- Created `packages/omnidev-cli/tsup.config.ts` (ESM output, shebang banner, external commander/dotenv)
- Copied all 11 CLI source files from `src/cli/` to `packages/omnidev-cli/src/`
- Modified `index.ts`: renamed program to `omnidev`, added `--url` and `--api-key` global options
- Modified `config.ts`: added `ConfigOverrides` interface, updated error message for global install UX
- Modified `load-env.ts`: 4-tier env discovery (OMNIDEV_ENV_FILE -> repo-root -> XDG -> cwd), recognizes both `omnidev` and `omnidev-app` as repo root names
- Renamed root package from `omnidev` to `omnidev-app` (avoids workspace name collision)
- Added `ralph` script in root `package.json` pointing to `tsx packages/omnidev-cli/src/index.ts`
- Verified: typecheck passes, all 52 tests pass, lint:all passes, CLI build succeeds, `--help` shows correct output

### Iteration 2 — Phase 6: Documentation

- Created `packages/omnidev-cli/README.md` — standalone README for npm package page (install, config, usage, env vars, compatibility)
- Created `docs/RALPH_CLI.md` — full CLI reference (standalone install, local dev, all commands, task refs, env discovery, global flags, versioning)

## Remaining

Nothing. All phases are complete:

- Phase 1: Scaffold monorepo structure -- DONE
- Phase 2: Move CLI source files -- DONE
- Phase 3: Global install config/UX -- DONE
- Phase 4: Wire monorepo root -- DONE
- Phase 5: Validate build -- DONE
- Phase 6: Documentation -- DONE
- Phase 7: Root package.json cleanup -- DONE (was part of Phase 4)

Note: `src/cli/` deletion (Step 20) is not applicable — the original files exist in the main app repo, not in this workspace branch. They should be removed when this branch is merged.

## Blockers

None.
