## Goal

Master admins and admins can sign in from as many devices as they want without the "you were signed out — this account signed in on another device" kick. Regular users keep their `max_devices` limit.

## How devices are limited today

- Each sign-in calls the `claim-device-slot` edge function.
- It reads `profiles.max_devices` (default 1). If more devices than that are active, the oldest is `revoked_at`-stamped and the realtime listener signs it out.
- The function already supports `max_devices = 0` as "unlimited" — the block that revokes old sessions is skipped in that case.

## Change (one file)

`supabase/functions/claim-device-slot/index.ts`:

1. When loading the profile, also select `is_master_admin` and `role`.
2. Compute `unlimited = prof?.is_master_admin === true || prof?.role === "admin"`.
3. Treat that as `maxDevices = 0` (unlimited) regardless of the stored `max_devices` value, so the revoke-oldest block is skipped for admins and master admins.
4. Return `max_devices: 0` in the response when unlimited so the client shows the right state.

No schema change, no migration, no client changes. Existing device rows remain, and any admin currently in a "revoked" state will get their row re-upserted with `revoked_at: null` on their next claim call and stay active.

## Out of scope

- No UI changes in Access Control — `max_devices` is still editable for regular users.
- No changes to the finance-admin flag (it's not an app-wide admin, so it stays limited unless promoted).
- No changes to the realtime kick logic on the client.

## Result

Signing in on a second, third, Nth device as a master admin or admin no longer kicks earlier devices. Regular users behave exactly as before.
