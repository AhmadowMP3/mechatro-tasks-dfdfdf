## Goal

When an admin creates an invite link, they choose how many devices that account can be signed in on at once (e.g. 1, 2, 5, or unlimited). If the account is already at the limit and signs in on a new device, the **oldest device is signed out immediately**.

This also fixes your "laptop + mobile" issue: today there is no device tracking at all, so both devices should work. If yours doesn't, it's a session/cookie bug — this plan also adds proper session tracking that surfaces and fixes that.

## What the admin sees

In the invite creation form (access-control page):

- New field: **"Max devices"** with a small number input (default `1`). `0` = unlimited.
- Shown alongside role / password / expiry.
- Editable later per-user in the profile row (Master admin only), so you can raise a member's limit without re-inviting.

## What happens at login

1. On first load after sign-in, the app generates a stable `device_id` (UUID) in `localStorage` (persisted per browser/device).
2. Client calls a server function `claimDeviceSlot({ device_id, user_agent })`:
   - Upserts a row in `public.user_sessions (user_id, device_id, user_agent, last_seen_at)`.
   - Reads `profiles.max_devices`.
   - If `max_devices > 0` and current active rows exceed it, marks the **oldest** rows `revoked_at = now()` and calls `supabase.auth.admin.signOut(session_user_id, 'others')` scoped by refresh token where possible. Since we can't pinpoint one refresh token, we use a client-side realtime signal (below).
3. The current device's row is refreshed on every app boot + every ~5 min heartbeat.

## What happens on the kicked device

- The client subscribes (Supabase Realtime) to its own `user_sessions` row.
- When that row's `revoked_at` becomes non-null (or the row is deleted), the client:
  - Calls `supabase.auth.signOut()`
  - Shows a toast: *"You were signed out because this account signed in on another device."*
  - Redirects to `/auth`.

## Schema changes (one migration)

- `invites.max_devices int not null default 1` (0 = unlimited).
- `profiles.max_devices int not null default 1` (copied from invite at redemption; admin-editable).
- New table `public.user_sessions`:
  - `id uuid pk`, `user_id uuid references auth.users on delete cascade`
  - `device_id text not null`, `user_agent text`, `created_at`, `last_seen_at`, `revoked_at nullable`
  - Unique `(user_id, device_id)`
  - RLS: users can `select` their own rows; only service_role writes; realtime enabled.
- Backfill `profiles.max_devices = 1` for existing users.

## Code changes

- **Migration** — schema above + GRANTs + RLS + realtime publication add.
- **`supabase/functions/redeem-invite/index.ts`** — copy `invites.max_devices` into `profiles.max_devices` at redemption.
- **`src/lib/device.ts`** (new) — `getDeviceId()` (localStorage UUID), `claimDeviceSlot` server fn, `startDeviceHeartbeat()`, `subscribeToKick()`.
- **`src/routes/__root.tsx`** — after `SIGNED_IN`, call `claimDeviceSlot` and start the kick-subscription; on `SIGNED_OUT`, clean up.
- **`src/routes/_authenticated/access-control.tsx`** — add "Max devices" number input to invite create form; show the value in the invite list; add inline editor on member rows for `profiles.max_devices` (master admin only).
- **i18n** — add `max_devices`, `max_devices_hint`, `device_kicked_toast` keys (ar/en).

## Technical notes

- The "kick" is enforced two ways so it's robust: (a) server function marks old rows `revoked_at`; (b) client realtime subscription forces `signOut`. This works even if the kicked device is offline — next time it opens the app the missing/revoked row makes `claimDeviceSlot` return `kicked` and it signs out on load.
- `max_devices = 0` means unlimited; input hint explains this.
- Session rows are pruned when `revoked_at` is older than 30 days by a lightweight cleanup inside `claimDeviceSlot`.
- No changes to points, roles, notifications, or existing task/finance features.

## Out of scope

- Naming devices ("iPhone 15", "Office laptop") — can add later.
- Showing a "signed-in devices" list to end users — admin-only for now.
- Geolocation / IP-based limits.
