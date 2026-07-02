## Multi-View Tasks Page

Add a view switcher to `/tasks` with 4 modes. All views share the existing filters, search, `TaskDetailModal`, and permission checks. Selected view persists in `localStorage` (`tasks.view`).

### View switcher UI

Segmented control next to the "New Task" button — icons + labels, bilingual:
- Cards (current) — `LayoutGrid` icon
- Kanban — `Columns3` icon
- Table — `Table2` icon
- Timeline — `CalendarRange` icon

### 1. Cards view (keep as-is)

Existing responsive `TaskCard` grid. No changes.

### 2. Kanban view

4 columns matching `task_status`: Todo · In Progress · Paused · Done.
- Column header: colored top bar (uses `STATUS_STYLES`), title, count pill.
- Compact task cards inside each column (title, priority dot, assignee avatar, due date, project color stripe).
- Drag-and-drop between columns using native HTML5 DnD (no new dep). On drop → `supabase.from('tasks').update({ status }).eq('id', …)` + log activity + refetch. Guarded by `can('manage_tasks')`; viewers get read-only columns.
- Horizontal scroll on narrow screens; RTL-aware order.

### 3. Table view

Dense data table with sortable columns:
- Title · Project (color chip) · Assignee (avatar + name) · Status pill · Priority pill · Due date (red if overdue) · Progress (small bar from `progress_pct`).
- Sticky header, zebra rows, hover highlight, click row → open `TaskDetailModal`.
- Sort by clicking header (title, due_date, priority, status). Sort state local.
- Responsive: hides Project + Progress columns under 768px.

### 4. Timeline view (the creative one)

Horizontal **swim-lane timeline** grouped by assignee — a mini Gantt.
- Left column: assignee avatars + names (sticky).
- Right: horizontal time axis covering min(start_date, today) → max(due_date) + 7 days, ticked by week. Today marked with a vertical accent line (brand blue).
- Each task = a rounded bar spanning `start_date` → `due_date`, colored by project, with a thin inner fill representing `progress_pct`. Overdue bars get a red left border and pulse.
- Bar shows truncated title + priority dot; hover reveals tooltip; click opens detail modal.
- Tasks without dates appear in a "No dates" tray at the bottom.
- Empty-state per lane when a user has no tasks in range.
- Horizontal scroll; RTL flips axis direction.

### File changes

- `src/routes/_authenticated/tasks.tsx` — add view state + switcher; render one of four view components.
- `src/components/tasks/ViewSwitcher.tsx` — segmented control.
- `src/components/tasks/KanbanView.tsx` — columns + DnD + status update.
- `src/components/tasks/TableView.tsx` — sortable table.
- `src/components/tasks/TimelineView.tsx` — swim-lane timeline.
- `src/i18n/dict.ts` — add labels: `viewCards`, `viewKanban`, `viewTable`, `viewTimeline`, `noDates`, `today`, plus AR translations.

No schema or RLS changes. No new dependencies.

### Verification

After build, use Playwright to load `/tasks`, screenshot each view, and confirm a Kanban drag updates status in the DB.
