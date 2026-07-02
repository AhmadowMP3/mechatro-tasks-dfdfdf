## Make the Activity Log capture everything

Right now the log only fills up with `signed_in` events because most non-auth writes bypass `logActivity()` (kanban drag, references delete, project archive, task delete, admin role changes, etc.). Instead of hunting every call site, we install **database triggers** that log every insert/update/delete automatically — so nothing can slip through, regardless of whether it came from the app, an edge function, or a future feature.

### 1. Database — universal audit triggers (migration)
Create one security-definer function `public.log_row_change()` that:
- reads `auth.uid()` as `actor_id` (falls back to `NULL` for system/service-role writes),
- maps `TG_OP` to a canonical action (`INSERT`→`created`, `UPDATE`→`updated`, `DELETE`→`deleted`),
- for updates, if the `status` column exists and changed, emits `status_changed` with `{from, to}` meta instead,
- picks the entity title/name from the row (`title`, `name_en`/`name_ar`, `full_name`),
- writes into `public.activity_log`.

Attach `AFTER INSERT OR UPDATE OR DELETE` triggers to:
- `tasks` — covers create, edit, drag-to-column, delete
- `projects` — covers create, edit, archive/unarchive, delete
- `references` — covers create, edit, pin toggle, delete
- `task_comments` → action `commented`
- `task_files` → action `file_added`
- `profiles` — only when `role`, `status`, or `active` changes → action `assigned` with `{from_role, to_role, status}` meta
- `member_reports` → `report.generated` / `report.deleted`

RLS stays untouched; the function runs `SECURITY DEFINER` so inserts always succeed. `activity_log` INSERT policy already allows any authenticated user (existing schema).

### 2. Frontend cleanup
- Remove now-duplicate client-side `logActivity()` calls in `TaskDetailModal`, `NewTaskModal`, `KanbanView`, `projects.tsx`, `references.tsx`, `reports-history.tsx`, `report/generator.ts` so a single edit doesn't produce two rows.
- Keep client-side logging **only** for events that have no DB trace:
  - `signed_in` (already in `app-context.tsx`)
  - `signed_out` (add on sign-out)
- `src/lib/activity.ts` keeps `logActivity()` and `normalizeAction()` for those two.

### 3. Activity page polish (`src/routes/_authenticated/activity.tsx`)
- Add `reference` and `report` to the `ENTITIES` filter list.
- Extend `resolveEntityNames()` to fetch reference titles (`references.title`) and report labels (`member_reports` → member full_name + range).
- Add `signed_out` to `ACTIONS`, `ACTION_ICONS` (LogOut icon), and `ACTION_COLORS`.
- Bilingual dict keys: `act_signed_out`, `entity_reference`, `entity_report` (add to `src/i18n/dict.ts` if missing).

### 4. Verification
- After migration approval: perform a create/edit/delete on tasks, projects, references from the UI and confirm each shows up in `/activity` with the correct actor name, action pill, and entity title in both AR and EN.
- Confirm the log line reads like: **"Ahmed  updated  task  'Fix login bug'"** and **"Sara  status changed  task  'Redesign hero'  (in_progress → in_review)"**.

### Files touched
- New migration (triggers + audit function)
- `src/lib/activity.ts` (trim to auth-only helpers)
- `src/lib/app-context.tsx` (add signed_out log on sign-out)
- `src/components/TaskDetailModal.tsx`, `NewTaskModal.tsx`, `tasks/KanbanView.tsx` (remove redundant logs)
- `src/routes/_authenticated/projects.tsx`, `references.tsx`, `reports-history.tsx` (remove redundant logs)
- `src/lib/report/generator.ts` (remove redundant logs)
- `src/routes/_authenticated/activity.tsx` (reference/report support, signed_out entry)
- `src/i18n/dict.ts` (missing labels only)
