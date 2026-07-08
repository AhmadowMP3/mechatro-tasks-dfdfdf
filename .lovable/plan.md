## Goal
Let admins/leads select multiple tasks and bulk assign or unassign members in one action, in both Table and Kanban views on `/tasks` and inside each project's tasks tab.

## UX

### Selection
- Add a checkbox to each row (Table) and each card (Kanban). A shared `selectedIds: Set<string>` lives in `src/routes/_authenticated/tasks.tsx` and in `projects.$id.tsx`.
- Table gets a header "select-all" checkbox for the currently filtered/sorted list.
- Card checkbox sits top-left, click stops propagation so it doesn't open the task modal or start a drag.

### Bulk action bar
When `selectedIds.size > 0`, a sticky action bar appears at the top of the list area:
- "N selected" counter.
- `Assign to…` button → opens the existing `AssigneeMultiSelect` in a popover.
- `Clear all assignees` button (destructive style).
- `Clear selection` / close.

Popover has three apply modes (radio at the top):
- **Add** — union current assignees ∪ selected users. *(default)*
- **Replace** — overwrite each task's assignees with selected users.
- **Remove** — subtract selected users from each task.

### Feedback
- Toast: "Updated N tasks". If some fail (RLS), show "Updated X of N, Y failed" with failing task titles listed.
- Bar hides on Escape and on route change.

## Data flow
- New helper `bulkUpdateAssignees(taskIds, userIds, mode)` in `src/lib/task-assignees.ts`:
  - One `SELECT task_id,user_id FROM task_assignees WHERE task_id IN (...)` to load current sets.
  - Compute per-task target set based on mode.
  - Call existing `saveTaskAssignees(taskId, nextIds)` per task via `Promise.allSettled`.
  - Return `{ ok: string[]; failed: {taskId,message}[] }`.
- After success: `queryClient.invalidateQueries({ queryKey: ["task-assignees-map"] })` and refetch the tasks list.

## Files to touch
- `src/lib/task-assignees.ts` — add `bulkUpdateAssignees`.
- `src/components/tasks/TableView.tsx` — checkbox column + header select-all; accept `selectedIds`, `onToggle`, `onToggleAll` props.
- `src/components/tasks/KanbanView.tsx` — checkbox on card; same props.
- New `src/components/tasks/BulkAssigneeBar.tsx` — the sticky bar + popover using existing `AssigneeMultiSelect`.
- `src/routes/_authenticated/tasks.tsx` — own `selectedIds` state, render `<BulkAssigneeBar />`, pass props down; clear selection on filter/tab change.
- `src/routes/_authenticated/projects.$id.tsx` — same wiring for the project view.
- `src/i18n/dict.ts` — new EN + AR keys: `selectedCount`, `bulkAssign`, `clearAllAssignees`, `modeAdd`, `modeReplace`, `modeRemove`, `updatedNTasks`, `updatedSomeFailed`.

## Permissions
- Bar hidden entirely for viewer-only roles (reuse the role gating already applied to per-task assignee edits).
- RLS on `tasks` / `task_assignees` still enforces server-side; rejected rows appear in the failed list.

## Out of scope
- Bulk status / priority / due-date changes (future, using the same selection primitive).
- Undo.

## Technical details
- Selection state is not persisted across route changes.
- Kanban drag-and-drop unaffected: checkbox click uses `stopPropagation` and is not a drag handle.
- `saveTaskAssignees` is reused so primary-assignee logic (points, notifications) stays consistent.
