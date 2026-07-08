## Goal
Wherever an export (XLSX report or PDF report) lists a task's assignee or aggregates per-member work, include **all** assignees (primary + co-assignees from `task_assignees`), not just `tasks.assignee_id`.

## Surfaces to update

### 1. Tasks page XLSX (`src/routes/_authenticated/tasks.tsx`)
`assigneesByTask` is already in scope. Change the Assignee column's `get` to join every name in `assigneesByTask[r.id]` with `، ` (AR) / `, ` (EN), falling back to the primary if the join map is empty. Add a numeric "Assignees" column (count) right after — small and useful for filtering.

### 2. Admin Reports workbook (`src/lib/export/xlsx-workbook.ts`)
- Load `task_assignees` alongside `tasks`, `profiles`, `projects` (single fetch).
- Build `assigneesByTask: Map<taskId, userId[]>`.
- **Sheet 2 "All Tasks"** — change the `Assignee` cell to the joined full names of every assignee for that task (fallback: primary). Widen the column to 34.
- **Per-member sheets (Sheets 4..N)** — replace `tasks.filter(t => t.assignee_id === m.id)` with "member is either primary OR in `assigneesByTask[t.id]`". The KPI banner (`mine.length`, `mineDone`, `overdueCount`) and the row list both pick up co-assigned tasks.

### 3. Team PDF report (`src/lib/report/team-report.ts`)
- In `loadTeamReportData`, fetch `task_assignees` (bounded to the loaded task ids) and build the same map.
- For each member, `mine = tasks` where the member is primary OR appears in `assigneesByTask[task.id]`. `tasks_total`, `tasks_done`, `tasks_overdue`, `on_time_pct` all follow.
- Team totals stay based on the raw task list (no double counting).

### 4. Per-member PDF report (`src/lib/report/data.ts`)
- Currently `tasks` are pulled with `.eq("assignee_id", memberId)`. Change to a two-step fetch:
  1. `task_assignees.select("task_id").eq("user_id", memberId)` → co-assigned ids.
  2. `tasks.select(...).or("assignee_id.eq.<id>,id.in.(<co-ids>)")` — dedup by id, order by created_at desc.
- Downstream code that renders the task table in `report-html.ts` is unchanged (no assignee column there).

### 5. Team overview stats (`src/routes/_authenticated/team.index.tsx`)
- The header aggregate (`ts = tasks.filter(x => x.assignee_id === uid)`) understates co-assigned work. Also fetch `task_assignees(user_id,task_id)` in that same query and treat a member as "on the task" if primary OR co-assignee. Applies to the per-member stat rows shown/exported on that page.

## Out of scope
- `projects.index.tsx` project stats (aggregate counts, not per-task assignee display).
- Invoices/payroll PDFs — no task-assignee content.
- Reordering columns or changing the visual style.

## Technical details
- Join separator: `، ` for `lang === "ar"`, `, ` for English.
- Deduplicate ids per task (`Array.from(new Set([primary, ...coAssignees]))`) so a primary who is also in the join table isn't listed twice.
- `task_assignees` fetch is scoped by task ids already in memory (`in("task_id", taskIds)`) to keep payload small — never a full-table scan.
- No schema changes.
- No new i18n keys required (join separator is the only string, chosen by `lang`).
