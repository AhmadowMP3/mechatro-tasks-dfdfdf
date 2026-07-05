## Goal
Show the project status as a colored pill badge on the top-right of each project card (grid view), matching the empty area circled in red on the uploaded reference.

## Change (single file)

**`src/routes/_authenticated/projects.index.tsx`** — grid card (around line 307):
- Add a small status pill absolutely positioned at the top-inline-start (LTR: top-left; RTL: top-right — since UI is RTL, this lands on the top-left corner in the RTL layout, matching the circled area in the screenshot).
- Pill content: `t(p.status)` (already localized: `active` / `on_hold` / `done` / `archived`).
- Color mapping (semantic tokens, works in dark mode):
  - `active` → green (`var(--success)` / green gradient)
  - `on_hold` → amber/gold (`var(--brand-gold)`)
  - `done` → blue (`var(--primary)` or `var(--grad-blue)`)
  - `archived` → muted gray (`var(--surface-3)` bg, `var(--muted)` text)
- Style: pill with padding `2px 10px`, `border-radius: 999px`, font-size 11, bold, uppercase-off, subtle border, `color:#fff` for colored states.
- The card wrapper gets `position: relative` so the pill can absolute-position inside it under the colored top bar.

Also mirror the same pill in the table/list view (if present in this route) — will inspect and add there too during the edit for consistency.

## Out of scope
- No changes to the status dropdown on the detail page.
- No changes to filters, export, or data model.

## Verification
- Grid view: each card shows a colored status badge in the top corner; colors distinct per status; readable in dark theme.
- Switching a project's status on the detail page reflects the new color/label after list refetch.
