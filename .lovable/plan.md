# Set project status to "archived" when archived

## Problem

Archiving a project sets `archived = true` but leaves `status` unchanged (usually "active"). The user wants the displayed status to reflect that the project is archived.

## Fix

**`src/routes/_authenticated/projects.index.tsx` — `toggleArchive`:**
- When archiving: update `{ archived: true, status: "archived" }`.
- When unarchiving: update `{ archived: false, status: "active" }` (restore to default active state).

**`src/i18n/dict.ts`:** add translation key
- `archived: { ar: "مؤرشف", en: "Archived" }`

No schema change — `status` is a free text column and already accepts arbitrary values. The status filter list (`PROJECT_STATUSES = ["active", "on_hold", "done"]`) stays as-is since archived projects are filtered out by the `archived` tab; users toggling to "Archived only" already see them regardless of status value.

## Out of scope

- Project detail page status editor stays the same (admins can still manually change status on an archived project if they want).
- No migration; no changes to tasks, filters, or reports.

## Verification

- Archive a project from the list → status label shows "مؤرشف / Archived".
- Unarchive it → status returns to "نشط / Active".
