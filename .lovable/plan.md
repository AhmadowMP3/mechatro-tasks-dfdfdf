## Remove percentage progress bar from Task cards

**File:** `src/components/TaskCard.tsx`

Remove the blue % progress bar block (lines 64–67) and the `{toLocalDigits(task.progress, lang)}%` label from the meta row (line 69). Keep the elapsed-timeline thin bar, the assignee avatar, and the due date. Restructure the remaining meta row so avatar + due date stay right-aligned on their own line.

No changes to data model, other views (Kanban/Table/Calendar), or the task detail modal — this is a card-only visual change.