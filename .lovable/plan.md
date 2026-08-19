# Plan: Show assignee names on task cards

## Goal
Replace the assignee avatar-only / count display on task cards with the actual assignee names, keeping a compact "+N" chip when there are more names than fit.

## What will change

1. New component `src/components/AssigneeNames.tsx`
   - Renders the avatar stack followed by assignee first names (or full names) inline.
   - Accepts `maxNames` prop (e.g. 2 for the main card, 1 for the narrow kanban card).
   - Shows a `+N` chip for the overflow, with a tooltip/title listing the remaining names.
   - Uses `toLocalDigits` so the "+N" number follows the selected language.
   - Truncates long names with ellipsis and respects RTL.

2. Update `src/components/TaskCard.tsx`
   - Replace the current `AssigneeStack` / single `Avatar` block in the card footer with `<AssigneeNames users={assignees ?? (assignee ? [assignee] : [])} maxNames={2} />`.
   - Keep the due date on the same line; adjust spacing so names and date do not collide.

3. Update `src/components/tasks/KanbanView.tsx`
   - Replace the `AssigneeStack` / `Avatar` block inside `SortableCard` with `<AssigneeNames ... maxNames={1} />` so narrow kanban cards still look clean.

4. i18n
   - Add `andMore: { ar: "+{n} آخرون", en: "+{n} more" }` to `src/i18n/dict.ts`.

5. Optional / if time permits
   - Update the multi-assignee cell in `src/components/tasks/TableView.tsx` to show the first name plus `+N` instead of the raw count number.

## Out of scope
- No database or RLS changes.
- No changes to task detail modal, filters, or exports.

## Verification
- Open `/tasks` in card view and confirm each card shows assignee name(s) and a `+N` chip when applicable.
- Switch to kanban view and confirm names appear without layout breakage.
- Check both Arabic and English layouts.