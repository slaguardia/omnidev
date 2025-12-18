# Update Documentation Command

Review and update all CLAUDE.md files and documentation to ensure they accurately reflect the current codebase structure, patterns, and conventions.

## Instructions

1. **Analyze Current Codebase Structure**

   Scan the repository to understand the current state:

   - Check `src/` directory structure for new or removed directories
   - Review `src/lib/*/index.ts` files for exported modules
   - Check `src/components/` for new or updated components
   - Review `src/app/api/` for API route changes
   - Check `src/hooks/` for new or updated hooks
   - Review `package.json` for dependency changes

2. **Update Root CLAUDE.md**

   Ensure the root `CLAUDE.md` file includes:

   - Accurate technology stack with current versions
   - Up-to-date directory structure
   - Current command reference from `package.json` scripts
   - Accurate architecture overview
   - Current environment variables
   - Links to all nested CLAUDE.md files

3. **Update src/CLAUDE.md**

   Verify and update:

   - Directory structure matches actual `src/` layout
   - File conventions are accurate
   - App Router structure reflects current routes
   - Entry points are correctly listed
   - Hooks overview matches `src/hooks/index.ts`

4. **Update src/lib/CLAUDE.md**

   For each module in `src/lib/`:

   - Verify module exists and is accurately described
   - Check exported functions/types match the index.ts barrel
   - Update usage examples if APIs have changed
   - Add any new modules
   - Remove documentation for deleted modules

5. **Update src/components/CLAUDE.md**

   Verify and update:

   - Component inventory matches actual files
   - Dashboard components list is current
   - Tab components match `src/components/dashboard/tabs/index.ts`
   - Hook documentation matches `src/hooks/index.ts`
   - Import patterns reflect current HeroUI package structure

6. **Update src/app/api/CLAUDE.md**

   Verify and update:

   - Route inventory matches actual API routes in `src/app/api/`
   - Authentication requirements are accurate
   - Request/response formats match implementation
   - Add documentation for any new routes
   - Remove documentation for deleted routes

7. **Update src/app/docs/CLAUDE.md**

   Review documentation system guidelines:

   - Verify formatting rules are current
   - Check code block handling matches implementation
   - Update any changed rendering behavior

8. **Check for New CLAUDE.md Locations**

   Consider if new CLAUDE.md files are needed for:

   - New major directories added to the project
   - Complex subsystems that would benefit from documentation
   - Areas with non-obvious patterns or conventions

9. **Verify Cross-References**

   Ensure all CLAUDE.md files:

   - Have correct relative paths to each other
   - Reference the same file locations consistently
   - Don't contain broken links to removed files

10. **Report Changes**

    After completing updates, provide a summary:

    - List of files updated
    - Major changes made
    - Any new documentation files created
    - Any inconsistencies found that couldn't be resolved

## CLAUDE.md Files to Review

| File                       | Purpose                    |
| -------------------------- | -------------------------- |
| `CLAUDE.md`                | Root project documentation |
| `src/CLAUDE.md`            | Source code overview       |
| `src/lib/CLAUDE.md`        | Library modules            |
| `src/components/CLAUDE.md` | UI components              |
| `src/app/api/CLAUDE.md`    | API routes                 |
| `src/app/docs/CLAUDE.md`   | Documentation system       |

## Quality Checks

- All code examples should be syntactically correct TypeScript
- Tables should be properly formatted markdown
- No placeholder text or TODOs should remain
- File paths should use forward slashes for consistency
- Version numbers should match `package.json`
