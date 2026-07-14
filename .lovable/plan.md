## Rewrite Kanban drag-and-drop from scratch

Replace the current `@dnd-kit/core` setup with `@dnd-kit/core` + `@dnd-kit/sortable`, which is the standard reliable combo for Kanban boards (works on mouse, touch, keyboard). Add per-column reordering.

### 1. DB — add `sort_order` to tasks

Migration adds `sort_order double precision` to `public.tasks` (nullable, default null). Backfill with `row_number()` per `(status)` so existing tasks get a stable order. No RLS changes needed (existing task policies cover it).

Using `double precision` lets us insert between two rows without renumbering: `newOrder = (prev + next) / 2`.

### 2. Rewrite `src/components/tasks/KanbanView.tsx`

- Wrap board in `<DndContext>` with `PointerSensor` (distance 6px) + `TouchSensor` (delay 200ms, tolerance 8px) + `KeyboardSensor`.
- Each column = `useDroppable` (id = status) AND wraps its cards in `<SortableContext items={ids} strategy={verticalListSortingStrategy}>`.
- Each card = `useSortable({ id })` — gives listeners, transform, transition. Click still opens the task (activation distance prevents accidental drag).
- `onDragEnd(event)`:
  - Determine target column (from `over.data.current.sortable.containerId` or `over.id` when dropped on empty column).
  - Compute new `sort_order` from neighbors in that column.
  - If status changed, update `status` (+ `completed_at` logic as today) + `sort_order`.
  - If same column, update `sort_order` only.
  - Enforce existing `canMove` permissions; revert with toast on denial.
  - Optimistic local reorder, then Supabase update, then `onChanged()`; revert on error.
- `DragOverlay` renders a lightweight card preview.
- Keep selectable/bulk mode: when `selectable=true`, disable drag listeners (checkbox mode wins).

### 3. Mobile layout (kept from previous fix)

Grid stays `minmax(280px, 1fr)` with `scroll-snap-type: x mandatory`, `touch-action: pan-x pan-y`, `overscroll-behavior: contain`, `scrollPaddingInline: 12`. Cards use `touch-action: none` only when draggable.

### 4. Consumers

`src/routes/_authenticated/tasks.tsx` already passes `onChanged`. Sort the tasks passed to `KanbanView` by `sort_order NULLS LAST, created_at` — either in the existing query or client-side after fetch. Include `sort_order` in the select and in the `TaskRow` type in `src/components/TaskCard.tsx`.

### Files touched

- Migration: add `tasks.sort_order` + backfill.
- `src/components/TaskCard.tsx` — add `sort_order?: number | null` to `TaskRow`.
- `src/components/tasks/KanbanView.tsx` — full rewrite of the DnD layer.
- `src/routes/_authenticated/tasks.tsx` — include `sort_order` in select + sort.
- `package.json` — `bun add @dnd-kit/sortable @dnd-kit/utilities` (core already installed).

### Out of scope

- Cross-view ordering (Table/Cards views keep current sort).
- Multi-drag.
- Server-side conflict resolution beyond last-write-wins.

### Verification

- Typecheck.
- Playwright mobile viewport: long-press a card, drag between columns, drop; verify status updated and order persists after reload.
- Desktop mouse: drag within a column reorders; drag across columns changes status.
