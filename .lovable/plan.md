## Goal
Promote your main account `minimamba1608@gmail.com` to **Admin** so the "+ New project" and "+ New task" buttons appear and you can create both.

## Change
Single data update — no schema changes:
- Set `role = 'admin'` and `status = 'active'` on the `profiles` row where `email = 'minimamba1608@gmail.com'`.
- Executed with the profile guard trigger temporarily disabled (same technique used for the test users), because the guard blocks non-admin identity/role changes.

## After it runs
Sign out and sign back in as `minimamba1608@gmail.com`. The "+ New project" button will appear on the Projects page (top-right) and "+ New task" on the Tasks page (top-right). You'll also see the admin-only nav items (Team, Access control, Activity, etc.).

## Not touched
- Test users (`admin.test@mechatro.test`, `member.test@mechatro.test`) stay as they are.
- RLS policies stay unchanged — the app still restricts creates to admins.