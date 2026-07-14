## Per-Assignee Points on Review Approval

### Goal
When a multi-assignee task moves to **In Review**, the admin approving it should be able to award each assignee an individual amount of points (custom number OR percentage split of the task's total). When the admin then approves (moves to Done), each assignee receives their allocated points independently — instead of only the "primary" assignee getting the task's points.

### UX Flow

1. Member (any assignee) moves task → **In Review**. No change here.
2. Admin opens the task detail. New section shown only when `status = in_review` and viewer is admin: **"Award points per assignee"**.
   - One row per assignee (avatar + name).
   - Each row has two inputs:
     - **Amount** (integer, 0–1000)
     - **%** (0–100), auto-linked with Amount using the task's `points` as the base.
   - Toolbar buttons: **Split equally**, **Reset**, **Total: X / task.points** live counter (informational, not enforced — admin can over/under-allocate).
   - Editing % updates Amount; editing Amount updates %.
3. Admin clicks **"Approve & award"** → task status becomes `done`, and each assignee gets their `awarded_points` credited to their profile total, streak, season scores, badges, notifications — same logic as the current single-assignee award trigger, but per row.
4. Always shown even if there's one assignee (per user request).

### Data model (new table)

`public.task_point_awards`
- `id uuid PK`
- `task_id uuid → tasks(id) ON DELETE CASCADE`
- `user_id uuid → profiles(id) ON DELETE CASCADE`
- `points integer NOT NULL CHECK (points >= 0 AND points <= 1000)` — admin-entered amount
- `awarded_amount integer` — final amount after streak multiplier (set when approved)
- `awarded_at timestamptz` — null until approved
- `awarded_by uuid → profiles(id)`
- `created_at`, `updated_at`
- `UNIQUE (task_id, user_id)`

RLS:
- Admins: full access.
- Assignee: `SELECT` own row (so they can see what admin proposed / what they got).
- GRANTs to `authenticated` + `service_role`.

### Award logic

Rewrite `public.award_task_points` trigger so that when a task transitions to `done`:
- If rows exist in `task_point_awards` for the task → award each row's `points` (× streak multiplier per user) to that user, mark `awarded_at`/`awarded_amount` on each row, and create per-user notifications/badges/season scores.
- Else (backward-compat single assignee) → keep the current path using `tasks.assignee_id` + `tasks.points`.
- Idempotency: skip rows where `awarded_at IS NOT NULL`; still set `tasks.points_awarded_at` so the task itself isn't re-processed.

### Frontend changes

- **`src/components/TaskDetailModal.tsx`**: new `<AwardPointsPanel />` shown when `task.status === 'in_review'` and `isAdmin`. Loads assignees + any existing draft awards from `task_point_awards`, upserts on change, shows the Total counter. **"Approve & award"** button = upsert final rows → then update task status to `done`.
- **`src/components/TaskDetailModal.tsx`** (member view): after approval, show a small read-only "You earned X points" chip for the current user, sourced from `task_point_awards`.
- **`src/i18n/dict.ts`**: new keys (`awardPointsTitle`, `awardPointsHint`, `splitEqually`, `resetAwards`, `totalAllocated`, `approveAndAward`, `youEarnedPoints`, etc.) in AR + EN.
- **`src/lib/tasks/*` (or nearest data hook)**: add `useTaskPointAwards(taskId)` + `upsertTaskPointAward` + `approveTaskWithAwards` helpers.

### Out of scope
- Editing awards after approval (locked once `awarded_at` is set).
- Deducting points on un-approving (status change back from done).
- Changes to the report PDF (awards will naturally appear in members' point totals).

### Order of operations
1. **Migration**: create `task_point_awards` (table + grants + RLS) and rewrite `award_task_points` trigger to consume it.
2. **Frontend**: hooks, `AwardPointsPanel`, wire into `TaskDetailModal`, i18n keys.
3. Typecheck.

Awaiting approval to switch to build mode.