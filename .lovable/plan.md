# Change project status from the detail page

## Change

Replace the static status label on `src/routes/_authenticated/projects.$id.tsx` (line 72) with an inline `<select>` for admins. Members keep the read-only label.

- Options: `active`, `on_hold`, `done`, `archived` — labels via `t(...)`.
- Selecting `archived` sets `{ status: "archived", archived: true }`.
- Selecting any other value on a currently archived project sets `{ status, archived: false }` (unarchive).
- Otherwise just update `status`.
- On success: toast + `refetch()`. On error: `explainSupabaseError` toast (same pattern as delete).
- Styled to match the surrounding meta row (small pill-shaped select using `var(--surface-2)` / `var(--border)`).

## Out of scope

No changes to the projects list, filters, or export. No new fields (due_date / description editing stays out of this turn). No RLS changes — existing admin-manage policies already allow the update.

## Verification

- As admin: open a project → change status via the dropdown → label updates, list page reflects new status, and toggling to/from "archived" also flips the archive tab correctly.
- As member: same row renders as plain text (no dropdown).
