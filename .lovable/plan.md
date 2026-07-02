## Goal

Collapse the current dynamic role system into three fixed roles and enforce a strict Member scope everywhere.

- **Master Admin (مدير)** — full access + only role that can promote/demote Admins and manage the Access Control page.
- **Admin (نائب مدير)** — full access to everything else (projects, tasks, team, reports, activity log, backups, references editing, approving new signups).
- **Member (عضو)** — limited, scoped access defined below.

## Member scope (from your answers)

Can see:
- **Projects** — only projects where they have at least one assigned task.
- **Tasks** — only tasks assigned to them (across all views: Kanban, Table, Calendar).
- **Task detail** — can change status, add comments/files, run the timer on their own tasks.
- **Team page** — directory only (name + avatar), no email/phone/role.
- **League / leaderboard** — full view.
- **Notifications** — own notifications.
- **Settings** — own profile, language, theme, notification prefs.
- **References** — read-only.
- **Dashboard** — scoped to their own tasks/projects only.

Cannot see / do:
- Access Control, Activity Log, Backups pages (hidden from sidebar + route-blocked).
- Create/edit/archive projects.
- Create tasks or edit tasks not assigned to them.
- Generate member PDF reports.
- See teammate emails, phones, roles, work sessions, or reports.
- Add/edit/delete references.

## Technical plan

### 1. Database migration

- Simplify `app_role` usage to exactly `admin` and `member`. `Master Admin` stays represented by the existing `profiles.is_master_admin` boolean (only the master can toggle it or promote another admin).
- Drop the dynamic `roles` / `role_permissions` / `user_roles` tables and the `permission_key` enum + `has_permission()` function (no longer needed — permissions are hard-coded by role).
- Update `handle_new_user()` trigger: new signups get `role = 'member'`, `status = 'pending'`; master-admin bootstrap still auto-activates.
- Rewrite RLS policies:
  - `projects`: admins full; members SELECT only where `EXISTS (task assigned to auth.uid())`.
  - `tasks`: admins full; members SELECT/UPDATE only rows where `assignee_id = auth.uid()` (UPDATE restricted to status/progress columns via a trigger or column-level check).
  - `task_comments` / `task_files` / `work_sessions`: members scoped to tasks they own.
  - `profiles`: members SELECT limited-column view (name + avatar). Full row access for admins. Achieved via a `public.team_directory` view granted to authenticated + members hitting the view, while `profiles` full access is admin-only.
  - `references`: SELECT for all authenticated, write for admins.
  - `activity_log`, `member_reports`, `notifications` (others'), `backups` bucket: admin-only.
- Add helper `public.is_admin(uuid)` returning `is_master_admin OR role = 'admin' AND active`. Replace `has_role` / `is_admin_or_manager` / `has_permission` call sites with `is_admin` and `is_master_admin`.

### 2. Frontend

- Replace the `hasPerm(key)` API in `AppProvider` with three booleans: `isMasterAdmin`, `isAdmin` (true for both master + admin), `isMember`.
- `Sidebar`: show Access Control only when `isMasterAdmin`; show Activity Log / Backups only when `isAdmin`.
- Route guards: add `beforeLoad` checks on `/access-control`, `/activity`, `/backups`, and admin-only project/task actions redirecting members to `/`.
- **Projects list** + `/projects/$id`: for members, filter to projects containing their tasks; hide "New Project", archive, edit controls.
- **Tasks views** (Kanban / Table / Calendar): for members, filter query to `assignee_id = user.id`; hide "New Task" button; disable drag-and-drop on tasks not theirs; TaskDetailModal shows read-only fields except status/comments/files/timer.
- **Team page**: for members, render a stripped directory (avatar + name only), no report buttons, no comparison dashboard, no profile drawer with PII.
- **References page**: hide add/edit/delete controls for members.
- **Dashboard**: for members, pre-scope `tasks`, `activity`, `sessions` datasets to their own; hide "Team Pulse" section; keep personal momentum/task flow.
- **Access Control**: only Master Admin can promote a user to Admin or demote back to Member; the "Roles" tab is removed (fixed roles now). Approving pending signups → sets status active + role choice (member/admin).

### 3. Cleanup

- Remove `admin-roles` edge function and the Roles tab UI.
- Simplify `admin-users` function to: invite, approve pending, set role (`member`|`admin`), toggle master admin (master-only), deactivate.
- Update i18n dict: drop permission-key strings; add labels for the 3 fixed roles in AR/EN.

### 4. Verification

- Playwright: sign in as master, as admin, and as a seeded member; confirm sidebar entries, project/task visibility, and that direct-URL access to `/access-control`, `/activity`, `/backups` redirects members away.
- Run `supabase--linter` after the migration.

## Open confirmations (please confirm before I build)

1. **Members editing their own task**: status change + comments + files + timer only — no editing title/description/deadline/assignee. Correct?
2. **Admin vs Master Admin difference**: the ONLY thing Master can do that Admin can't is manage Access Control (promote/demote admins, approve signups, toggle master). Everything else Admin does fully. Correct?
3. OK to **delete** the dynamic `roles`/`role_permissions`/`user_roles` tables and the `admin-roles` edge function? (All permission logic becomes hard-coded to the 3 roles.)
