## What's wrong

1. **Role changes silently ignored.** The `admin-users` Edge Function writes the new role to `profiles.role` (`set_role`), but its `list` action reads the role from a separate `user_roles` table. After the update, the reload still returns the old value from `user_roles`, so the dropdown snaps back — the DB was updated but the UI never sees it.
2. **No realtime.** The page only refetches when the user opens/closes the invite modal or triggers an action. Changes made by other admins, new sign-ups, redeemed invites, etc. don't show up until a manual reload.

## The fix

### 1. Correct the role source (Edge Function)
In `supabase/functions/admin-users/index.ts`, `list` will read `role` directly from `profiles.role` (same column `set_role` writes to). Drop the `user_roles` lookup so read and write agree. This alone makes role changes stick visibly.

### 2. Optimistic UI on role change
In `access-control.tsx`, when the admin picks a new role, update local `users` state immediately, then call the function. On failure, revert and toast the error. No more waiting for a round-trip to see the pill flip.

### 3. Realtime subscriptions
- **Migration:** add `public.profiles` and `public.invites` to the `supabase_realtime` publication so `postgres_changes` events fire.
- **Client:** in `AccessControlPage`, open one `supabase.channel('access-control')` inside a `useEffect` that listens for `INSERT | UPDATE | DELETE` on both tables. On any event, debounce (~250 ms) and call `load()` + trigger the pending-invites list to refresh. Tear the channel down on unmount.
- Replace the current `refreshKey` prop on `PendingInvitesList` with a proper realtime refetch driven by the same channel (or its own subscription), so revoked/created/redeemed invites appear instantly.

### 4. Small polish
- Live "🟢 Live" indicator next to the header so the master admin can see the page is streaming.
- When a pending user gets approved elsewhere, the row moves from "Pending" to "All" without a click.

## Files touched

- `supabase/functions/admin-users/index.ts` — fix `list` to use `profiles.role`.
- New migration — `ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles, public.invites;` (guarded so it's a no-op if already added).
- `src/routes/_authenticated/access-control.tsx` — optimistic role update, realtime channel, live indicator, cleaner refresh wiring for `PendingInvitesList`.

## Out of scope

No schema/RLS changes, no changes to invite generation, no change to the master-admin gate.
