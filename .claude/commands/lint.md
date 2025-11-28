# Lint Command

Run the comprehensive linting suite for the project. This includes TypeScript type checking, ESLint, Prettier, and dependency checking.

## Instructions

1. Run `pnpm lint:all` to execute all linting checks:

   - TypeScript (`pnpm typecheck`) - Check for type errors (runs automatically as part of `pnpm lint`)
   - ESLint (`pnpm lint`) - Check for code quality and style issues (includes typecheck)
   - Prettier (`pnpm prettier`) - Check code formatting
   - Depcheck (`pnpm depcheck`) - Check for unused or missing dependencies

2. Review the output from each tool.

3. **Automatically fix all issues without asking the user:**

   - Run `pnpm lint:all:fix` to auto-fix what's possible
   - For issues that can't be auto-fixed (like `@typescript-eslint/no-explicit-any` or unused variables), manually fix them by:
     - Adding proper TypeScript types instead of `any`
     - Removing unused imports and variables
     - Escaping special characters in JSX (use `&apos;` for apostrophes)
   - For depcheck issues:
     - **Unused dependencies**: Remove them from package.json
     - **Missing dependencies**: Add them with `pnpm add <package>`

4. After fixing, re-run `pnpm lint:all` to confirm all issues are resolved.

5. Report to the user what issues were found and fixed.

## Available Scripts

| Script              | Description                                 |
| ------------------- | ------------------------------------------- |
| `pnpm typecheck`    | Run TypeScript type checking                |
| `pnpm lint`         | Run typecheck + ESLint checks               |
| `pnpm lint:fix`     | Run ESLint and auto-fix issues              |
| `pnpm prettier`     | Check formatting with Prettier              |
| `pnpm prettier:fix` | Fix formatting with Prettier                |
| `pnpm depcheck`     | Check for unused/missing dependencies       |
| `pnpm lint:all`     | Run all checks (lint + prettier + depcheck) |
| `pnpm lint:all:fix` | Fix all auto-fixable issues                 |
