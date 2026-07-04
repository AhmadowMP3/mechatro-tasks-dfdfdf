## Problem

"Invalid login credentials" appears because `admin.test@mechatro.test` and `member.test@mechatro.test` don't exist yet — the seed function was written, but it's gated behind the Settings page which requires being signed in as the Master Admin. You're locked out.

## Fix

Run the seed once as the Master Admin (`minimamba1608@gmail.com`), then sign in as the test users.

### Steps

1. **Sign in as Master Admin** at `/auth` with `minimamba1608@gmail.com` and your existing password.
2. **Go to Settings** → scroll to the "Seed test users" section (only visible to Master Admin).
3. **Click "Seed test users"** — this calls `provisionTestUsers` which creates both auth users + profiles with correct roles.
4. **Sign out**, then sign in with:
   - Admin: `admin.test@mechatro.test` / `Admin!2026`
   - Member: `member.test@mechatro.test` / `Member!2026`

### If you don't remember the Master Admin password

I'll add a one-time public seed path — a `/seed-test-users` route that calls a server function guarded by a hardcoded seed token you'd pass as `?token=...`. After running once, you'd sign in as the admin test user. I'd remove this route in a follow-up turn.

Tell me which option you want:
- **A** — you have the Master Admin password, just run the seed from Settings (no code changes needed)
- **B** — you don't have it, add the temporary `/seed-test-users` route
