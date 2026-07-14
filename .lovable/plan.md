## Remove click-to-select from Kanban, keep pure drag-and-drop

Currently the Kanban shows a checkbox on each card (for admins) and clicking enters bulk-select mode, which disables drag. The user wants Kanban to be drag-and-drop only.

### Changes

1. `src/routes/_authenticated/tasks.tsx`
   - When rendering `<KanbanView>`, do NOT pass `selectable`, `isSelected`, `onToggle`. Kanban never enters bulk mode.
   - Leave bulk selection intact for Table and Cards views (unchanged).

2. `src/components/tasks/KanbanView.tsx`
   - Remove the `selectable`/`isSelected`/`onToggle` props and all related code: `BulkCheckbox` import, checkbox overlay, `cardSelected` styling, meta/ctrl/shift click-to-toggle branch, and `draggable = dragThis && !selectable` gate becomes just `dragThis`.
   - Card click always opens the task; drag always moves/reorders it (subject to existing `canMove` permissions).

### Out of scope
- Table and Cards bulk selection stays.
- No DB, no permission, no mobile layout changes (already handled in previous turn).

### Verify
- Typecheck.
- Drag a card across columns and within a column on desktop + mobile viewport; click a card opens the detail modal; no checkbox appears on Kanban.