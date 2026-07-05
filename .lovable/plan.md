## Goal
The status filter in the archived tab currently offers `active` / `on_hold` / `done` (which don't match archived projects, since their status is `archived`). In the archived tab, the status filter should offer only `archived`.

## Change (single file)

**`src/routes/_authenticated/projects.index.tsx`** — around line 241 where `ChipMultiSelect` for status is rendered:
- When `f.archived === true`: pass `options = [{ value: "archived", label: t("archived") }]`.
- When `f.archived === false`: keep current `PROJECT_STATUSES.map(...)` (active / on_hold / done).

Also, when the user switches tabs (line 211 `patch({ archived: val })`), clear `statuses: []` so a stale status selection from the other tab doesn't hide all rows.

## Out of scope
- Any other filter behavior, colors, cards, or data logic.

## Verification
- Active tab: status filter shows active / on_hold / done as today.
- Archived tab: status filter shows only "archived".
- Switching tabs resets the status chip selection.
