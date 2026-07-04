## Problem
The buttons are not showing because backend reads are failing with:

`permission denied for function is_admin`

That means the test admin logs in successfully, but the app cannot run the admin-check function used by the database policies. Because profile/projects/tasks fail to load, the UI cannot confirm the user is admin, so it hides the create buttons.

## Plan
1. **Fix backend permission**
   - Add a database migration that grants execute permission on `private.is_admin(uuid)` to authenticated users and service role.
   - Keep the function private and security-definer; only restore the permission needed for RLS policies to evaluate.

2. **Verify admin profile access**
   - Confirm `admin.test@mechatro.test` can read its profile and is recognized as `admin` / active.
   - Confirm projects and tasks reads no longer return 403.

3. **Verify UI buttons**
   - Check `/projects` as the test admin: top-right should show `+ New Project`.
   - Check `/tasks` as the test admin: top-right should show `+ New Task`.

4. **No permission broadening**
   - Keep creation admin-only as requested.
   - Do not make members able to create projects or tasks.