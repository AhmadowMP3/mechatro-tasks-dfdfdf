## Access Control – Full End-to-End Audit

Goal: verify the invite + preset-password + access-control flow works with zero errors, across DB, edge functions, and UI. No feature changes — audit + fix only what's broken.

### 1. Database layer
- Inspect `public.invites` columns: confirm `password_hash TEXT NULL` and `has_password` generated column exist and are correct.
- Confirm RLS policies + GRANTs on `invites` still match (admin manage, anon peek by token if applicable).
- Run `supabase--linter` to catch missing RLS / grant regressions.
- Spot-check `profiles`, `user_roles` (if any), `app_config` for master-admin logic still consistent.

### 2. Edge functions
- `admin-invites`: verify
  - Auth check (admin/master admin only)
  - Accepts `preset_password` (≥8) + `full_name`
  - Bcrypt hash stored; plaintext never persisted
  - Returns password once in response
  - CORS + error shapes
- `redeem-invite`: verify
  - `peek` returns `has_password`, `full_name`, expiry, used state
  - `redeem` branches: preset → `bcrypt.compare`; self-serve → min length
  - Returns `password_mismatch`, `expired`, `already_used`, `not_found` cleanly
  - Rate limiting present (or note as gap)
- `admin-users`: confirm the earlier 403 "master admin only" regression is resolved for admins that should have access.
- Deploy status + recent logs via `supabase--edge_function_logs`.

### 3. Frontend flows (Playwright against localhost:8080)
- Sign in as master admin (using injected session).
- **Generate invite – self-serve**: create link, verify modal shows link only, copy works.
- **Generate invite – preset password**: set name + password (manual + 🎲 Gen), submit, verify reveal-once screen shows link + password + "Copy both".
- **Accept invite – preset**: open link in fresh context, verify password-gate UI shows admin-set name, submit correct password → account created + signed in; submit wrong password → `password_mismatch` error surfaces.
- **Accept invite – self-serve**: verify original choose-your-own-password path still works.
- **Expired / used / bad token**: verify error states render (no blank screen).
- **Access-control page**: list, revoke, regenerate actions; team page role changes.
- Capture screenshots at each step; check console + network for errors.

### 4. Report
- Table of checks: pass / fail / gap.
- For each failure: root cause + minimal fix proposal (separate follow-up plan; not applied in this audit unless trivial).
- Confirm no plaintext password is ever logged, stored, or returned after the one-time reveal.

### Deliverable
A pass/fail report with screenshots and, for anything broken, a concrete fix list to approve before I touch code.
