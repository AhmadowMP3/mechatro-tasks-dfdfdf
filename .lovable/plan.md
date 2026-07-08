## What's actually broken

When the master admin creates an invite with a preset password and the client redeems it:

1. `redeem-invite` creates the auth user with the email + password → OK.
2. It then tries to promote the profile: `full_name`, `username`, `role`, `status='active'`.
3. That UPDATE is silently blocked by the `profiles_guard_self_update` DB trigger. The trigger checks `private.is_admin(auth.uid())`, but service-role calls from the edge function have `auth.uid() = NULL`, so it raises "Members cannot change identity, role, admin flag, active flag, or status". The edge function only logs a warning and returns `ok`.
4. Result in DB (already confirmed for the 3 recent invites — `ahmad2026`, `admin2026`, `member2026`): profile stays `status='pending'`, `username=NULL`, `role='member'`.
5. The first sign-in from the accept page works (it uses the raw email + password directly).
6. Every later `/auth` sign-in by Name fails: `resolve_login_email` requires `status='active' AND email IS NOT NULL`, so it returns nothing, and the UI shows "Invalid name or password". The password is fine — the profile is just still in `pending`.

## Fix

1. **DB trigger** — let backend/service-role callers bypass the member guard. Update `profiles_guard_self_update` to return early when `auth.uid() IS NULL` (server context) in addition to the existing admin bypass. This matches the intent: the guard is for member self-edits from the client, not for privileged server flows.
2. **Backfill the 3 stuck profiles** so the affected clients can sign in immediately:
   - `ahmad2026`, `admin2026`, `member2026` → `status='active'`, `active=true`, set `username` = `full_name`, set `role='admin'` for `admin2026` and keep `member` for the others (best guess from their names; admin can re-adjust in Access Control).
3. **`redeem-invite` hardening** — after the profile UPDATE, check the affected row count and surface a real error instead of just warning. Also verify the profile is `status='active'` before returning `ok`, so the sign-in retry path can't silently regress again.
4. **`/auth` error UX** — keep the masked "Invalid name or password" for wrong credentials, but add a separate branch: if `resolve_login_email` returns nothing AND a profile with that name exists but is `pending`/`suspended`, show a clearer message ("Account not activated yet — open your invite link first" / "Account suspended — contact admin"). This surfaces the exact class of failure the client hit.
5. **Password requirement for preset invites** — the accept-invite form currently accepts `minLength=1` when the invite has a preset password (so users can paste whatever the admin sent). Keep that, but also require the admin-side preset to be ≥ 8 chars (already enforced) and echo the preset password back to the admin once at creation time so the admin can copy the same string they'll send the client. This is already in `admin-invites` (`preset_password` is returned); no change needed — just verify it.

## Random demo data

Seed via migration (idempotent inserts using stable names) tied to the existing 3 admins + the fixed invited users:

- **Projects** (~6): "Robotics Line Upgrade", "Vision QA Pipeline", "AGV Fleet Rollout", "PLC Migration 2026", "Warehouse Sensors", "Client Demo — Aramco".
- **Tasks** (~30): spread across projects and assignees, mix of `todo`, `in_progress`, `in_review`, `done`, varied priorities and due dates in the next 30 days.
- **Customers** (~5), **income_entries** (~10), **expenses** (~15 across a few `expense_categories`), one **invoice** with 2 items and 1 payment, a couple of **subscriptions_income/expense** entries.
- **References** (~4) and a couple of **notes** owned by the admins.

All seed rows use `ON CONFLICT DO NOTHING` on natural keys (title/name/date) so re-running is safe.

## Files touched

- `supabase/migrations/<new>.sql` — trigger update, profile backfill, demo seed.
- `supabase/functions/redeem-invite/index.ts` — check UPDATE affected rows, return `profile_update_failed` on 0 rows, verify `status='active'`.
- `src/routes/auth.tsx` — extra branch for `pending`/`suspended` profiles with a friendlier message; keep masking for real bad passwords.

## Out of scope

- Redesigning the invite flow itself.
- Changing how the admin shares invites (link + password by external channel stays as-is).
- Notes UI changes beyond what's already shipped.
