## Goal
Provision two ready-to-use test accounts with known passwords so you can log in and see the "New Project" / "New Task" buttons (Admin) and the member view (Member).

## Why the buttons are hidden today
The "New Project" and "New Task" buttons are gated by `isAdmin` in `src/routes/_authenticated/projects.tsx` and `.../tasks.tsx`. The screenshots show "My Tasks" and no create button — that means the account you're signed in with resolves to `role = 'member'`. Your Master Admin account (`minimamba1608@gmail.com`) does have `role = 'admin'` in the DB, so signing into that one already works. The fix here is to give you fresh, guaranteed test credentials for both roles.

## Test accounts to create

| Role   | Email                          | Password       | Full name        |
|--------|--------------------------------|----------------|------------------|
| Admin  | `admin.test@mechatro.test`     | `Admin!2026`   | Admin Test       |
| Member | `member.test@mechatro.test`    | `Member!2026`  | Member Test      |

(Passwords can be changed later from Settings.)

## Implementation

1. **Clean up orphan profile rows** — the `profiles` table already has duplicate rows for those two emails from earlier experiments but no matching `auth.users`. A migration will delete profile rows whose `id` isn't in `auth.users` for those two emails so the trigger can re-create clean ones.

2. **Provision auth users via a one-shot admin server function** (`src/lib/provision-test-users.functions.ts`):
   - `createServerFn` guarded by `requireSupabaseAuth` + master-admin check.
   - Loads `supabaseAdmin` inside the handler (`await import('@/integrations/supabase/client.server')`).
   - Uses `supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name } })` for each account.
   - After creation, updates each `profiles` row: sets `role = 'admin'` / `'member'`, `status = 'active'`, `active = true`.
   - Idempotent: if the email already exists, updates password + metadata via `admin.updateUserById` instead.

3. **Trigger it once** — add a small "Seed test users" button on Settings visible only to the Master Admin. Clicking it calls the server fn and toasts the two credentials. Removed later or left behind a dev flag.

4. **After running** — sign out, sign in as `admin.test@mechatro.test / Admin!2026` and you'll see:
   - Sidebar → **Projects** → top-right **"+ New Project"** button
   - Sidebar → **Tasks** → top-right **"+ New Task"** button

## Files touched

- `supabase/migrations/<ts>_cleanup_orphan_test_profiles.sql` (new)
- `src/lib/provision-test-users.functions.ts` (new)
- `src/routes/_authenticated/settings.tsx` (add master-admin-only "Seed test users" button)

## Not touched
RLS, existing roles, invite flow, or your Master Admin account.
