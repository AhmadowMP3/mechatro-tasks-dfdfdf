## Goal

Allow a task to be assigned to multiple members (not just one).

## Approach

Add a new join table `task_assignees` alongside the existing single `assignee_id` column. Keep `assignee_id` populated with the "primary" assignee (first picked) so all existing code, triggers (points/streaks/badges/notifications in `award_task_points`, `notify_admins_on_review`, etc.), filters, and reports keep working with zero regressions. Everything reads multi-assignees from the join table when it needs the full list; the rest of the app continues to treat `assignee_id` as the lead assignee.

## Database (migration)

New table `public.task_assignees`:
- `task_id uuid` → `public.tasks(id) on delete cascade`
- `user_id uuid` → `auth.users(id) on delete cascade`
- `assigned_at timestamptz default now()`
- `assigned_by uuid`
- PK `(task_id, user_id)`
- Indexes on `task_id` and `user_id`

GRANTs + RLS:
- `GRANT SELECT, INSERT, DELETE ON public.task_assignees TO authenticated;`
- `GRANT ALL ... TO service_role;`
- Policies: admins full access via `private.is_admin(auth.uid())`; members can `SELECT` rows where they are the assignee OR are already in the task's assignee set OR are the task creator (mirrors the existing tasks visibility rules).

Trigger: `task_assignees_sync_primary` — after insert/delete, if `tasks.assignee_id` is NULL or no longer present in the join table, set `tasks.assignee_id` to the earliest remaining row (by `assigned_at`). Keeps points/notifications flowing to a real assignee.

Backfill: for every existing task with `assignee_id IS NOT NULL`, insert `(task_id, assignee_id)` into `task_assignees` on conflict do nothing.

Points/streaks stay on the lead `assignee_id` for this iteration — no changes to `award_task_points`. This is called out as an explicit trade-off (see "Out of scope").

## Backend behavior

- `NewTaskModal` and `TaskDetailModal` (admin edit path) send an array of user IDs. We wrap the write in a small helper `saveTaskAssignees(taskId, userIds, { creator })`:
  1. Set `tasks.assignee_id = userIds[0] ?? null`.
  2. `delete from task_assignees where task_id = :id and user_id not in (...)`.
  3. `upsert` the current list into `task_assignees`.
- Member-side task updates (status/progress) don't touch assignees, so the existing `tasks_guard_member_updates` trigger is unaffected.

## UI changes

- `src/components/NewTaskModal.tsx`: replace the single assignee select with a multi-select chip picker (search + checkbox list). Store `assigneeIds: string[]`. On create: insert task with `assignee_id = ids[0]`, then call `saveTaskAssignees`.
- `src/components/TaskDetailModal.tsx` (admin edit section): same multi-select; on save, call `saveTaskAssignees`.
- `src/components/TaskCard.tsx`: show a stacked avatar group (up to 3 avatars + "+N" overflow) instead of one avatar. Fetch extras from `task_assignees` in the parent lists that already load tasks (add a lightweight `useQuery` map keyed by task ids on the pages that render cards: `tasks.tsx`, `projects.$id.tsx`, dashboard task lists).
- `src/components/tasks/TableView.tsx` and `KanbanView.tsx`: same avatar stack in the assignee cell.
- Filters (`FilterBar`, `FilterDrawer`) keep filtering by a single member, but the query switches from `assignee_id = :uid` to `id in (select task_id from task_assignees where user_id = :uid)` so filtering by a member also finds tasks where they are a secondary assignee.
- i18n: add `assignees` (plural) alongside existing `assignee` in `src/i18n/dict.ts` (AR + EN).

## Notifications & points (unchanged this iteration)

- `award_task_points`, `notify_admins_on_review`, `notify_assignee_on_admin_comment` continue to fire for the lead `assignee_id` only. Documented in the plan; can be widened in a follow-up if you want everyone on the task to earn points and get notifications.

## Files touched

- `supabase/migrations/<new>.sql` — table, grants, RLS, sync trigger, backfill.
- `src/lib/task-assignees.ts` (new) — `saveTaskAssignees`, `useTaskAssignees` hook.
- `src/components/NewTaskModal.tsx` — multi-select + save flow.
- `src/components/TaskDetailModal.tsx` — multi-select in admin edit; render stacked avatars in header.
- `src/components/TaskCard.tsx` — avatar stack.
- `src/components/tasks/TableView.tsx`, `KanbanView.tsx` — avatar stack.
- `src/routes/_authenticated/tasks.tsx`, `projects.$id.tsx`, dashboard task list — batch-load `task_assignees` for the visible task ids; adapt "filter by member" query.
- `src/i18n/dict.ts` — `assignees` label.

## Out of scope

- Awarding points and streaks to every assignee (still only the lead assignee earns).
- Sending admin/review notifications to all assignees.
- Bulk reassignment tools or per-assignee status.

Confirm and I'll implement.
