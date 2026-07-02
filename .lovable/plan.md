## Problem

`Recent activity` shows a new `signed_in` row every time the page is refreshed. Cause: in `src/lib/app-context.tsx`, `onAuthStateChange` calls `logActivity(..., "signed_in", ...)` whenever Supabase fires a `SIGNED_IN` event — but Supabase also emits `SIGNED_IN` on session restore (page reload, tab focus, token refresh in some SDK versions), not just on real logins.

## Fix

1. **Stop logging `signed_in` from `onAuthStateChange`** in `src/lib/app-context.tsx`. Keep the state-sync logic (loadUser / refreshUsers), just remove the `logActivity` call for `SIGNED_IN`.

2. **Log `signed_in` explicitly at real login points**, right after a successful credential exchange:
   - `src/routes/auth.tsx` — after `supabase.auth.signInWithPassword` resolves without error.
   - `src/routes/accept-invite.tsx` — after the invite acceptance completes and the user is signed in for the first time.

3. **Log `signed_out` at real logout points** (already done in `app-context.signOut`; verify `Sidebar` / `SuspendedScreen` route through the context's `signOut` so no duplication).

4. **One-time cleanup** (optional, run once via migration): delete the accumulated bogus rows so the log looks clean.
   ```sql
   -- keep only 1 signed_in per actor per 10-minute bucket
   DELETE FROM public.activity_log a
   USING public.activity_log b
   WHERE a.action = 'signed_in' AND b.action = 'signed_in'
     AND a.actor_id = b.actor_id
     AND a.id <> b.id
     AND a.created_at < b.created_at
     AND b.created_at - a.created_at < interval '10 minutes';
   ```

After this, only genuine credential-based sign-ins produce a `signed_in` entry; refreshes and token refreshes stay silent.