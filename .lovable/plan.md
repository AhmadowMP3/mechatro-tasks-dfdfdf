## Goal
Show the task's creation date on the outside of the task card (list view), alongside the existing due date.

## Change (single file)

**`src/components/TaskCard.tsx`**
1. Extend `TaskRow` with `created_at?: string`.
2. In the footer row (currently shows assignee + due date, lines 74-80), add a small muted line above the due-date row showing:
   `t("createdAt") + ": " + formatDate(task.created_at, lang)` when `task.created_at` exists.
   Style: same 12px `var(--muted)` font, aligned to the trailing edge (same `justifyContent: "flex-end"`), no icon, so it doesn't compete with the due date.

Data is already available — `tasks.tsx` queries `select("*")` so `created_at` flows through without any query changes.

## Out of scope
- No changes to the tasks list query, filters, sort, table view, or detail modal.
- No new i18n keys (reusing existing `createdAt`).

## Verification
- On `/tasks`, every card shows "تاريخ الإنشاء: <date>" above the due-date/assignee row.
- Cards without a due date still render the created date.
