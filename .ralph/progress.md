# Progress: Simplify subtask data model and field inheritance

## Completed

### Iteration 1 — Steps 1 & 2: Simplify CreateSubtaskInput and createSubtask()

- Removed `userStory` and `acceptanceCriteria` from `CreateSubtaskInput` interface
- Updated `createSubtask()` to set `userStory=null`, `acceptanceCriteria=[]`, `instructions=null`
- Added `projectId` and `playbookId` inheritance from parent in `createSubtask()`
- Fixed caller in `approveChildStories()` (~line 1960) that was passing removed fields
- Typecheck passes

### Iteration 2 — Steps 4 & 5: API route delegation and conditional validation

- When `parentId` is provided, API route now calls `createSubtask(parentId, { title, description })` instead of `createRalphTask()` + `addChildToRalphTask()`
- Removed `addChildToRalphTask` import (no longer needed in this route)
- Added `createSubtask` import
- Made `workspaceId` conditionally required via Zod `.superRefine()` — only required for top-level tasks
- Subtask path skips branch protection check (parent owns delivery config)
- Auto-run logic preserved for subtasks that inherit playbookId

### Iteration 3 — Step 6: UI changes in CreateTaskModal.tsx

- Hidden Workspace dropdown for subtasks (was disabled, now fully hidden)
- Hidden File Paths section for subtasks
- Hidden Project and Playbook dropdowns for subtasks
- Hidden Auto Run switch for subtasks
- Delivery Method and Branch dropdowns were already hidden (existing `!form.parentId` guards)
- Changed submit button text to "Create Subtask" when parentId is set
- Updated client-side validation to not require workspaceId for subtasks (inherited from parent)

## Remaining (per plan)

- **Step 3**: CreateChildStoryInput alias — no changes needed (confirmed)
- **Step 7**: `useCreateRalphTask.ts` — no changes needed (confirmed)

All planned steps are complete.

## Blockers

None.
