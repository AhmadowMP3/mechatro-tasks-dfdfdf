# Kanban touch-DnD + mobile overlap fix

## Two bugs

1. **Drag & drop doesn't work on touch** — `KanbanView` uses HTML5 native drag events (`onDragStart`, `onDragOver`, `onDrop`). These don't fire on mobile browsers, so on phones/tablets tasks can't be moved between columns at all.
2. **Mobile overlap** — the Kanban board grid uses `gridAutoColumns: minmax(min(82vw, 280px), 1fr)` with no per-column `min-width`, so columns get squeezed into the narrow viewport and their cards clip / overlap the tab bar area.

## Fix

### 1. Replace native DnD with `@dnd-kit/core` (works on mouse AND touch)

Install `@dnd-kit/core` (small, no sortable-list needed — we only need column drop targets).

In `src/components/tasks/KanbanView.tsx`:
- Wrap the board in `<DndContext>` configured with `PointerSensor` (activation distance 6px so taps still open cards) + `TouchSensor` (delay 180ms, tolerance 6px — long-press to drag on mobile so scrolling still works).
- Each column becomes a `useDroppable` target keyed by its status; highlight when `isOver` and drop is allowed.
- Each card becomes a `useDraggable` — apply `listeners`/`attributes` only when `dragThis && !selectable`. Keep the existing `onClick` for opening the task; dnd-kit's activation distance/delay prevents accidental drags.
- On `onDragEnd`, if `over` is a column and the move is allowed, call the existing `moveTask` logic (unchanged Supabase update, toast, `onChanged`).
- Preserve the current permission rules (`canMove`), `in_review` styling, and selectable-mode click behavior.
- Add a `DragOverlay` that renders a lightweight preview of the dragged card so the finger/cursor doesn't obscure it.

### 2. Fix mobile column sizing / overlap

Same file, the grid wrapper:
- Set `gridAutoColumns: "minmax(280px, 320px)"` on mobile (fixed per-column width so columns don't squish) and `minmax(0, 1fr)` on desktop where the whole board fits.
- Add `paddingInline: 4px` and `paddingBottom: 12px` so the last-column card doesn't touch the bottom tab bar.
- Add `scroll-padding-inline: 12px` for cleaner snap.
- Keep `scroll-snap-type: x mandatory` and per-column `scroll-snap-align: start` (already in `styles.css`).
- Add `touch-action: pan-x` on the container so vertical page scroll isn't blocked when a card is long-pressed for drag.

### 3. Small polish

- While dragging on mobile, disable body vertical scroll only inside the board via `overscroll-behavior: contain`.
- Add a subtle "drop here" outline (already exists — reuse `isOver && dropAllowed`).

## Files touched

- `src/components/tasks/KanbanView.tsx` — rewrite drag layer using dnd-kit; column grid tweaks.
- `package.json` — add `@dnd-kit/core` (via `bun add`).

No changes to `tasks.tsx`, permissions, DB, or other views.

## Verification

- Typecheck.
- Playwright: mobile viewport, load `/tasks?view=kanban`, verify columns don't overlap and horizontal scroll works.
- Manual desktop check that mouse drag between columns still updates status.

## Out of scope

- Reordering cards inside a column (only status-column moves, matching current behavior).
- Persisted column order.
- Multi-select drag.
