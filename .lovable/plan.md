## Goal

Add a Delete button to each project on the Projects page (and project detail page) for admins. Deleting removes the project along with all its tasks, comments, files, and related activity. The existing Active / Archived tabs stay as they are.

## Changes

### 1. Database — cascade delete migration

Ensure FK constraints from child tables to `projects.id` are `ON DELETE CASCADE` so a single project delete wipes everything cleanly:

- `tasks.project_id` → cascade
- `task_comments.task_id` (already cascades from tasks — verify)
- `task_files.task_id` (verify cascade)
- `work_sessions.task_id` (verify cascade)
- `season_scores` / `league_seasons.project_id` (if scoped) → set null on delete
- `activity_log` rows referencing the project/tasks: leave as-is (audit trail), no FK

I'll drop and recreate the relevant FKs with `ON DELETE CASCADE` in one migration.

### 2. RLS policy

Add/confirm a DELETE policy on `public.projects` allowing admins (`private.is_admin(auth.uid())` or `has_role(auth.uid(),'admin')`) to delete. Members cannot.

### 3. UI — Projects list (`src/routes/_authenticated/projects.tsx`)

- Add a small Delete (trash icon) button next to the Archive/Unarchive button on each project card, admin-only.
- Click → confirmation modal showing project name + task count + warning "This will permanently delete the project and all its tasks, comments, and files. This cannot be undone." with a typed-confirm (type project name) before enabling the Delete button.
- On success: toast, refetch list.

### 4. UI — Project detail page (`src/routes/_authenticated/projects.$id.tsx`)

- Add the same Delete action in the page header (admin-only), same confirmation modal.
- After delete → navigate back to `/projects`.

### 5. i18n

Add strings: `deleteProject`, `deleteProjectConfirm`, `deleteProjectWarning`, `typeToConfirm`, `projectDeleted` in both `ar` and `en` in `src/i18n/dict.ts`.

## Out of scope

- No changes to the Active/Archived tabs (already good per your answer).
- No bulk delete on the projects page (can add later if needed).
- No soft-delete / trash; deletion is permanent as requested.
