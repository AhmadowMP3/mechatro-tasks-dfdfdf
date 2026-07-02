## Full Pipeline Audit — Mechatro Tasks

I checked every table, RLS policy, storage bucket, edge function, and every place the frontend touches the database, and cross-referenced against the schema and the seed data actually in the DB. Below is the honest report plus the fixes I want to make.

---

### 1. Database vs. frontend — what's in sync

Tables in DB: `profiles, projects, tasks, task_files, task_comments, work_sessions, activity_log, notifications, references, member_reports, roles, role_permissions, user_roles, app_config`.

All 14 tables have RLS enabled, GRANTs to `authenticated`, and are read/written by the frontend correctly. Column names in every `supabase.from(...)` call line up with the actual schema. No dangling references, no missing columns, no wrong enum values.

Storage buckets `backups` and `member-reports` both have complete RLS on `storage.objects`. Good.

Row counts right now: tasks 6, projects 2, profiles 5, activity_log 17, work_sessions 0, notifications 0, references 0, member_reports 0, roles 2, user_roles 1.

---

### 2. Problems I found (ranked by impact)

**P1 — Seed profiles are orphaned (breaks Team / League / Reports / Workload).**
4 of the 5 profile rows (`أحمد الإداري, سارة المديرة, محمد المهندس, ليلى المشاهدة`) have NO matching row in `auth.users`. They can never sign in, but they still appear in the Team page, the League leaderboard, the Dashboard's "Workload by teammate", and the "Generate report" picker — where they will always show zero activity and produce empty PDFs. They also let admins "assign" tasks to accounts that will never log in.

**P2 — Regular signed-up users get zero permissions.**
`handle_new_user` only inserts a `user_roles` row when the user is the master admin. Every other real signup has an empty `permissions` array, so every `hasPerm(...)` check returns false. Today the sidebar and page gates mostly key off `isMasterAdmin` or the legacy `role` column, so it looks OK — but the whole "dynamic roles + permissions" system is effectively dead for non-master users, and the moment a page starts calling `hasPerm(...)` a real invited user will see nothing.

**P3 — Dead / broken query in `app-context.tsx`.**
`loadUser` fires a malformed nested join (`role_permissions:role_id(permission:role_permissions(permission))`) before the working two-query fallback. It errors silently on every login and every auth state change. Wastes a round-trip and pollutes network logs.

**P4 — Test-user provisioning endpoint is still public.**
`src/routes/api/public/provision-test-user.ts` uses the service-role key to create/reset a hard-coded admin account. On the published site anyone who hits that URL can (re)create `tester@mechatro.test` as a master admin. Must be removed.

**P5 — SECURITY DEFINER functions callable by anon/authenticated (linter WARN x6).**
`handle_new_user` and `sync_master_admin` are `SECURITY DEFINER` but have public EXECUTE. They should be trigger-only / callable by `service_role` only. `has_role`, `is_admin_or_manager`, `is_master_admin`, `has_permission` are fine to be executable by `authenticated` (they're used in policies), but should have EXECUTE revoked from `anon`.

**P6 — Leaked-password protection is off (linter WARN).**
One toggle in auth config; low cost, high value.

**P7 — Sign-out cache hygiene.**
`signOut()` in `AppProvider` skips `queryClient.cancelQueries()` + `clear()`. In-flight authenticated queries will 401-flash after logout. Documented anti-pattern in the TanStack guide.

**P8 — `work_sessions` visibility mismatch (info, not a bug).**
RLS on `work_sessions.SELECT` is own-or-admin. Dashboard, Team, and League read sessions without filtering by user, so a non-admin sees only their own sessions and any team-level aggregation renders incomplete. Fine for the current admin-heavy usage, worth noting.

---

### 3. Fixes I want to apply

**A. Data cleanup migration**
- Delete the 4 orphaned Arabic seed profiles (`WHERE id NOT IN (SELECT id FROM auth.users)`).
- Reassign any task currently pointing at those `assignee_id`s / `created_by` to `NULL` first, so the delete succeeds.

**B. Auto-assign a default role to every new signup**
- In `handle_new_user`, after inserting the profile, insert into `user_roles` picking the `roles.slug = 'member'` row (create the row if it doesn't exist as part of the migration).
- Backfill: insert `user_roles(user_id = tester)` for the existing master admin (already present) and set future non-master users to the `member` role automatically.

**C. Frontend cleanup**
- Remove the broken nested-join query in `src/lib/app-context.tsx` `loadUser` (keep only the working two-query path).
- Harden `signOut()` — cancel + clear the query cache, then `supabase.auth.signOut()`, then navigate to `/auth` with `replace: true`.

**D. Remove `src/routes/api/public/provision-test-user.ts`** entirely.

**E. Security-definer function lockdown migration**
- `REVOKE EXECUTE ... FROM PUBLIC, anon` on `handle_new_user`, `sync_master_admin`.
- `REVOKE EXECUTE ... FROM anon` on `has_role`, `is_admin_or_manager`, `is_master_admin`, `has_permission` (keep `authenticated` so RLS policies still work).

**F. Enable leaked-password protection** via `supabase--configure_auth`.

**G. Verify** — re-run the linter and confirm 0 remaining actionable warnings (leaked-password + SECURITY DEFINER items should be gone; the WARN class stays only if the linter continues to flag any functions I still need callable).

---

### 4. What I'm intentionally NOT changing

- Edge functions (`admin-users`, `admin-roles`, `backup-snapshot`) — they work and are correctly service-role gated. Rewriting them to `createServerFn` is a larger refactor and out of scope for a "sync" pass.
- The dual role system (legacy `profiles.role` enum vs. new dynamic `roles` table). Both are used; unifying is a design decision, not a bug fix. I'll flag it in the closing note.
- Dashboard/League team-aggregation over `work_sessions` under member RLS — noted above; changing it requires a design choice about whether members should see peers' hours.

---

### 5. Technical section (for reference)

Migration 1 — cleanup + trigger:
```sql
UPDATE public.tasks SET assignee_id = NULL WHERE assignee_id IN (SELECT id FROM public.profiles WHERE id NOT IN (SELECT id FROM auth.users));
UPDATE public.tasks SET created_by = NULL WHERE created_by IN (SELECT id FROM public.profiles WHERE id NOT IN (SELECT id FROM auth.users));
UPDATE public.projects SET created_by = NULL WHERE created_by IN (SELECT id FROM public.profiles WHERE id NOT IN (SELECT id FROM auth.users));
DELETE FROM public.profiles WHERE id NOT IN (SELECT id FROM auth.users);

-- Ensure a 'member' role exists, then extend handle_new_user to insert user_roles for every new signup.
```

Migration 2 — function grants:
```sql
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_master_admin() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_admin_or_manager(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_master_admin(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, permission_key) FROM anon;
```

Frontend touch list: `src/lib/app-context.tsx`, delete `src/routes/api/public/provision-test-user.ts`.

Auth config: enable `password_hibp` (leaked-password protection).
