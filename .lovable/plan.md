## Invite-only access with a dynamic role system

Rebuild the auth flow so the app is **invite-only**, gated by a **master admin** who defines roles, decides what each role can do, and personally lets people in. No one can create an account from the outside.

### The experience

**Public /auth page** — becomes a clean sign-in-only screen:
- Email + password fields, one "Sign in" button.
- Small line below: *"Need access? Ask your master admin to invite you."* (no request form, no Google button).
- Anyone who hits a protected URL without a session lands here.

**Master admin's "Access Control" section** (new area in Settings, only visible to master admin):
- **Users tab** — list of every account with their assigned role, active/suspended toggle, last-seen. Actions: change role, suspend, delete. Big **"Invite user"** button opens a modal → enter name + email + pick a role → an invite email is sent with a magic link that takes them straight to a "Set your password" screen. Until they set it, they show as *Pending*.
- **Roles tab** — full CRUD on roles. Create a role (name in AR + EN, colour, description), rename it, delete it (blocked if users still hold it), reorder. Each role card shows a checklist of every permission in the system; the admin ticks what that role can do. Changes take effect immediately.
- **Activity tab** — audit trail of every admin action (invites sent, roles changed, permissions edited, users suspended). Uses the existing `activity_log`.

**The master admin badge** — you'll give me the email later. On first login of that email, we auto-promote it to master admin. Master admin is a permanent flag (not a role), can never be demoted or deleted from inside the UI, and is the only one who can see the Access Control section. If the email hasn't signed in yet, the app shows a locked state on protected routes so no one else can accidentally seize control.

**Everywhere else in the app** — pages, buttons, and menu items check permissions instead of hard-coded role names. A user with no matching permission simply doesn't see the control (or sees a friendly "You don't have access to this" panel on a page).

### How permissions work

I'll ship a fixed catalogue of ~20 granular permissions (e.g. `projects.create`, `projects.delete`, `tasks.assign_any`, `tasks.edit_own`, `team.view`, `league.view`, `backups.run`, `settings.company_edit`, …). The master admin can't invent new permission *keys* — those are wired into the code — but can freely combine them into any role they want. This is the standard pattern; fully user-invented permissions would need code changes to enforce, so it's a dead end.

When you're ready to define your roles, you'll just say e.g. *"Create a role 'Engineer' with tasks.view, tasks.edit_own, projects.view"* and the master admin UI handles it.

### Technical details

**Database (one migration):**
- New enum `permission_key` listing every permission in the system.
- New table `roles` — `id`, `name_en`, `name_ar`, `slug`, `color`, `description`, `is_system` (protects seed roles from deletion), `sort_order`.
- New table `role_permissions` — `role_id` + `permission_key` (many-to-many).
- New table `user_roles` — `user_id` + `role_id` (a user has exactly one role; separate table so we can migrate to multi-role later without a rewrite; also satisfies the security rule that roles never live on `profiles`).
- Alter `profiles`: add `is_master_admin boolean default false`, `status` (`pending` | `active` | `suspended`), `invited_at`, `invited_by`. Drop the old `role app_role` column *after* migrating existing rows into `user_roles`.
- Security-definer helpers: `has_permission(_user_id, _permission)`, `is_master_admin(_user_id)`. All RLS policies across the app switch to these instead of the old `has_role` / `is_admin_or_manager` (which stay as thin wrappers for backwards compatibility during the switch, then get removed).
- Trigger on `auth.users` update: first sign-in of the configured master-admin email flips `is_master_admin=true` and sets `status='active'`. All other auto-created profiles start as `status='pending'` with no role — but since we're invite-only, the invite flow pre-creates them as `active` with the chosen role already attached, so "pending" is just the window between invite-sent and password-set.
- Seed two system roles: **Admin** (all permissions) and **Member** (view-only baseline) so the master admin has something to hand out on day one.

**Auth config:**
- Disable public signups at the Supabase level (`disable_signup: true`). Invitations use the Admin API server-side.
- Keep email/password on. Google stays disabled (already done).

**Server functions (all `requireSupabaseAuth` + master-admin check):**
- `inviteUser({ email, full_name, role_id })` — calls Supabase Admin API `inviteUserByEmail`, pre-inserts the profile + user_roles row, logs to activity_log.
- `createRole`, `updateRole`, `deleteRole`, `setRolePermissions`.
- `changeUserRole`, `suspendUser`, `reactivateUser`, `deleteUser`.
- All load `supabaseAdmin` inside the handler (never at module top), and re-check `is_master_admin(context.userId)` before doing anything.

**Frontend:**
- Strip signup/forgot tabs and the "Continue with Google" leftovers from `/auth`. Add "Set password" page at `/set-password` (uses the recovery token from the invite email).
- `AppProvider` exposes `hasPermission(key)` and `isMasterAdmin`. Existing `can(perm)` helper switches to hit the new table via a cached fetch on session start.
- New route `_authenticated/access-control` (master-admin only, `beforeLoad` redirects others) with the three tabs above.
- Sidebar hides menu items whose permission the user lacks; the "Access Control" link only appears for the master admin.

**Auth emails:** the invite email needs a Lovable-branded template. After the schema and UI are in, I'll scaffold the auth email templates so invites look right — quick, no extra work from you.

### Order of operations

1. Migration + seed the two system roles + master-admin trigger.
2. Disable public signup, keep email/password.
3. `/auth` cleanup + `/set-password` page.
4. Server functions for invites and role/permission management.
5. Access Control UI (Users → Roles → Activity tabs).
6. Swap every existing page's role checks over to `hasPermission`.
7. Scaffold Lovable auth email templates so invites are branded.

**What I need from you before I start:** the email that should become the master admin (you can paste it in your next message and I'll wire it into the migration).